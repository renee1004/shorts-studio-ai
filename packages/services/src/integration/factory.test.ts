import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { readdir, rm } from "node:fs/promises";
import {
  closePools,
  claimQueuedRenderJob,
  countCostEventsForRun,
  getRenderJob,
  insertApproval,
  insertContentProject,
  insertNiche,
  insertScript,
  listMediaAssetsForProject,
  replaceShots,
  serviceDb,
  withUserSession,
  type Database,
} from "@shorts-os/db";
import { renderManifestSchema, structuredScriptSchema } from "@shorts-os/contracts";
import { UnavailableVideoGenerationProvider } from "@shorts-os/providers";
import {
  approveRenderJob,
  enqueueProjectRender,
  executeRenderJob,
  localMediaRoot,
  retryFailedShots,
  saveUploadedClip,
} from "../factory";

const serviceUrl = process.env.DATABASE_URL;
const appUrl = process.env.DATABASE_APP_URL ?? serviceUrl;
const owner = "00000000-0000-4000-8000-0000000000d4";
const suffix = Date.now().toString(36);
const video = new UnavailableVideoGenerationProvider();

let service: Database;
let workspaceId: string;
let topicId: string;

type Fixture = Awaited<ReturnType<typeof createFixture>>;

beforeAll(async () => {
  if (!serviceUrl) throw new Error("DATABASE_URL이 필요합니다.");
  service = serviceDb(serviceUrl);
  workspaceId = await withUserSession(appUrl as string, owner, async (db) => {
    const rows = await db.execute<{ create_workspace_with_owner: string }>(
      sql`select create_workspace_with_owner(
        ${"Factory WS"},
        ${`factory-${suffix}`},
        'Asia/Seoul',
        'ko-KR'
      )`,
    );
    return (rows as unknown as { create_workspace_with_owner: string }[])[0]!
      .create_workspace_with_owner;
  });
  const niche = await withUserSession(appUrl as string, owner, (db) =>
    insertNiche(db, {
      workspaceId,
      createdBy: owner,
      slug: `factory-niche-${suffix}`,
      name: "Factory Niche",
      targetCountry: "KR",
      targetLanguage: "ko",
      seedKeywords: ["렌더"],
      includeTerms: [],
      excludeTerms: [],
    }),
  );
  const rows = await service.execute<{ id: string }>(sql`
    insert into topics (
      workspace_id, niche_id, title, normalized_title, angle_hint,
      target_country, target_language, discovered_by
    )
    values (
      ${workspaceId}, ${niche.id}, '렌더 테스트', '렌더 테스트', null,
      'KR', 'ko', 'test'
    )
    returning id
  `);
  topicId = (rows as unknown as { id: string }[])[0]!.id;
});

afterAll(async () => {
  await service.execute(sql`delete from workspaces where id = ${workspaceId}`);
  await rm(`${localMediaRoot()}/${workspaceId}`, { recursive: true, force: true });
  await closePools();
});

async function addScript(
  projectId: string,
  version: number,
  caption = "첫 장면",
) {
  const structured = structuredScriptSchema.parse({
    title: `렌더 대본 ${version}`,
    hook: "첫 문장",
    targetDurationSeconds: 8,
    estimatedDurationSeconds: 2,
    cta: { type: "follow", text: "구독" },
    beats: [
      {
        beatId: "b1",
        startSeconds: 0,
        endSeconds: 1,
        purpose: "hook",
        narration: "첫 장면입니다.",
        onScreenText: caption,
        claimKeys: [],
      },
      {
        beatId: "b2",
        startSeconds: 1,
        endSeconds: 2,
        purpose: "body",
        narration: "둘째 장면입니다.",
        onScreenText: "둘째 장면",
        claimKeys: [],
      },
    ],
    factualClaims: [],
  });
  const script = await insertScript(service, {
    workspaceId,
    projectId,
    angleId: null,
    version,
    structured,
    scriptText: structured.beats.map((beat) => beat.narration).join("\n"),
    wordCount: 8,
    estimatedDurationSeconds: 2,
    claims: [],
    originalitySummary: {},
    modelName: "test",
    promptVersion: "test",
    inputHash: `factory-${suffix}-${projectId}-${version}`,
    createdBy: owner,
    status: "approved",
  });
  const shots = await replaceShots(
    service,
    workspaceId,
    script.id,
    structured.beats.map((beat, index) => ({
      sequenceNo: index + 1,
      startSeconds: beat.startSeconds,
      endSeconds: beat.endSeconds,
      narration: beat.narration,
      onScreenText: beat.onScreenText,
      visualDescription: beat.purpose,
      cameraDirection: null,
      generationPrompt: null,
      negativePrompt: null,
      assetStrategy: "motion_graphic",
    })),
  );
  return { script, shots };
}

async function createFixture(options: {
  approved?: boolean;
  caption?: string;
  secondScript?: boolean;
} = {}) {
  const project = await insertContentProject(service, {
    workspaceId,
    topicId,
    researchBriefId: null,
    title: `렌더 프로젝트 ${crypto.randomUUID().slice(0, 8)}`,
    targetLanguage: "ko",
    targetDurationSeconds: 8,
    ownerUserId: owner,
    status: "approved_to_render",
  });
  const first = await addScript(project.id, 1, options.caption);
  const approval =
    options.approved === false
      ? null
      : await insertApproval(service, {
          workspaceId,
          entityType: "content_project",
          entityId: project.id,
          entityVersion: first.script.version,
          decision: "approved",
          comment: null,
          decidedBy: owner,
          snapshotHash: `approval-${project.id}`,
        });
  const second = options.secondScript ? await addScript(project.id, 2) : null;
  return { project, approval, first, second };
}

async function enqueue(fixture: Fixture, key: string, overrides = {}) {
  return enqueueProjectRender({
    db: service,
    system: service,
    workspaceId,
    userId: owner,
    projectId: fixture.project.id,
    request: { allowPlaceholder: true, width: 360, height: 640, fps: 24, ...overrides },
    idempotencyKey: `${key}-${suffix}-${fixture.project.id}`,
    video,
  });
}

async function mediaFileCount(): Promise<number> {
  try {
    const entries = await readdir(`${localMediaRoot()}/${workspaceId}`, {
      recursive: true,
      withFileTypes: true,
    });
    return entries.filter((entry) => entry.isFile()).length;
  } catch {
    return 0;
  }
}

describe("Phase 4.1 Demo render integrity", () => {
  it("승인 레코드 없는 프로젝트 렌더를 거부한다", async () => {
    const fixture = await createFixture({ approved: false });
    await expect(enqueue(fixture, "no-approval")).rejects.toMatchObject({
      code: "INVALID_STATE_TRANSITION",
    });
  });

  it("승인되지 않은 다른 Script 렌더를 거부한다", async () => {
    const fixture = await createFixture({ secondScript: true });
    await expect(
      enqueue(fixture, "wrong-script", { scriptId: fixture.second!.script.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("9:16 이외 해상도를 거부한다", async () => {
    const fixture = await createFixture();
    await expect(
      enqueue(fixture, "wrong-ratio", { width: 360, height: 650 }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("미승인 업로드는 파일과 Asset을 남기지 않는다", async () => {
    const fixture = await createFixture({ approved: false });
    const filesBefore = await mediaFileCount();
    await expect(
      saveUploadedClip({
        db: service,
        workspaceId,
        userId: owner,
        projectId: fixture.project.id,
        shotId: fixture.first.shots[0]!.id,
        bytes: Buffer.from("not-a-real-video"),
        mimeType: "video/mp4",
        fileName: "blocked.mp4",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    expect(
      await listMediaAssetsForProject(service, workspaceId, fixture.project.id),
    ).toHaveLength(0);
    expect(await mediaFileCount()).toBe(filesBefore);
  });

  it("Manifest와 command hash가 정확한 승인 ID·snapshot에 묶인다", async () => {
    const fixture = await createFixture();
    const first = await enqueue(fixture, "bound");
    const job = await getRenderJob(service, workspaceId, first.renderJobId);
    const manifest = renderManifestSchema.parse(job!.renderManifest);
    expect(manifest).toMatchObject({
      scriptId: fixture.first.script.id,
      scriptVersion: fixture.first.script.version,
      contentApprovalId: fixture.approval!.id,
      contentApprovalSnapshotHash: fixture.approval!.snapshotHash,
    });
    expect(first.commandHash).toMatch(/^[a-f0-9]{64}$/);
    const duplicate = await enqueue(fixture, "bound-duplicate");
    expect(duplicate).toMatchObject({ reused: true, renderJobId: first.renderJobId });
  });

  it("ASS 자막 합성 실패 시 Job을 failed로 기록한다", async () => {
    const fixture = await createFixture({
      caption:
        "하나 둘 셋 넷 다섯 여섯 일곱 여덟 아홉 열 열하나 열둘 열셋 열넷 열다섯 열여섯",
    });
    const render = await enqueue(fixture, "ass-failure");
    await expect(executeRenderJob(render.renderJobId, service)).rejects.toThrow(
      /3줄 Safe Area/,
    );
    expect((await getRenderJob(service, workspaceId, render.renderJobId))?.status).toBe(
      "failed",
    );
  }, 90_000);

  it("선택하지 않은 성공 Shot Asset을 재사용한다", async () => {
    const longCaption =
      "하나 둘 셋 넷 다섯 여섯 일곱 여덟 아홉 열 열하나 열둘 열셋 열넷 열다섯 열여섯";
    const fixture = await createFixture({ caption: longCaption });
    const first = await enqueue(fixture, "caption-fail");
    await expect(executeRenderJob(first.renderJobId, service)).rejects.toThrow(
      /3줄 Safe Area/,
    );
    const failed = await getRenderJob(service, workspaceId, first.renderJobId);
    expect(failed?.status).toBe("failed");
    const failedManifest = renderManifestSchema.parse(failed!.renderManifest);
    expect(failedManifest.shots.every((shot) => shot.execution.status === "succeeded")).toBe(
      true,
    );

    const selectedId = failedManifest.shots[0]!.shotId;
    const unselected = failedManifest.shots[1]!;
    const retry = await retryFailedShots({
      db: service,
      system: service,
      workspaceId,
      userId: owner,
      renderId: first.renderJobId,
      shotIds: [selectedId],
      video,
      idempotencyKey: `retry-selected-${suffix}-${fixture.project.id}`,
    });
    const retryJob = await getRenderJob(service, workspaceId, retry.renderJobId);
    const retryManifest = renderManifestSchema.parse(retryJob!.renderManifest);
    expect(retryManifest.shots[0]!.execution).toMatchObject({
      status: "pending",
      assetId: null,
    });
    expect(retryManifest.shots[1]!.execution).toMatchObject({
      status: "succeeded",
      assetId: unselected.execution.assetId,
    });
    await expect(executeRenderJob(retry.renderJobId, service)).rejects.toThrow(
      /3줄 Safe Area/,
    );
    const executedRetry = await getRenderJob(service, workspaceId, retry.renderJobId);
    const executedManifest = renderManifestSchema.parse(executedRetry!.renderManifest);
    expect(executedManifest.shots[0]!.execution.assetId).not.toBe(
      failedManifest.shots[0]!.execution.assetId,
    );
    expect(executedManifest.shots[1]!.execution.assetId).toBe(
      unselected.execution.assetId,
    );
  }, 90_000);

  it("동시에 받은 렌더 요청은 하나만 실행 권한을 얻는다", async () => {
    const fixture = await createFixture();
    const render = await enqueue(fixture, "concurrent-claim");
    const claims = await Promise.all([
      claimQueuedRenderJob(service, render.renderJobId),
      claimQueuedRenderJob(service, render.renderJobId),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect((await getRenderJob(service, workspaceId, render.renderJobId))?.status).toBe("running");
  });

  it("정상 Render는 idempotent하고 checksum 승인까지 된다", async () => {
    const fixture = await createFixture();
    const first = await enqueue(fixture, "success");
    const rendered = await executeRenderJob(first.renderJobId, service);
    expect(rendered.status).toBe("succeeded");
    expect(rendered.outputChecksumSha256).toMatch(/^[a-f0-9]{64}$/);
    const again = await executeRenderJob(first.renderJobId, service);
    expect(again.outputChecksumSha256).toBe(rendered.outputChecksumSha256);
    if (first.workflowRunId) {
      expect(await countCostEventsForRun(service, first.workflowRunId)).toBe(0);
    }
    const approval = await approveRenderJob({
      db: service,
      system: service,
      workspaceId,
      userId: owner,
      renderId: first.renderJobId,
    });
    expect(approval.snapshotHash).toBe(rendered.outputChecksumSha256);
  }, 90_000);
});
