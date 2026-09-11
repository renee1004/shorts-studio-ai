import { generateNarration, findNarration } from "../narration";
import { pcmToWave } from "@shorts-os/providers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { readdir, rm, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCommand, probeMedia } from "../render-engine";
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
import {
  renderManifestSchema,
  structuredScriptSchema,
} from "@shorts-os/contracts";
import { UnavailableVideoGenerationProvider } from "@shorts-os/providers";
import {
  approveRenderJob,
  enqueueProjectRender,
  executeRenderJob,
  localMediaRoot,
  retryFailedShots,
  saveUploadedClip,
  generateShotImage,
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
  await rm(`${localMediaRoot()}/${workspaceId}`, {
    recursive: true,
    force: true,
  });
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

async function createFixture(
  options: {
    approved?: boolean;
    caption?: string;
    secondScript?: boolean;
  } = {},
) {
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
    request: {
      allowPlaceholder: true,
      width: 360,
      height: 640,
      fps: 24,
      ...overrides,
    },
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
  it("다른 요청이 장면 잠금을 가진 동안 유료 호출을 시작하지 않는다", async () => {
    const fixture = await createFixture();
    const shotId = fixture.first.shots[0]!.id;
    let release!: () => void;
    let acquired!: () => void;
    const ready = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holder = withUserSession(appUrl as string, owner, async (db) => {
      await db.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`image:${workspaceId}:${shotId}`}, 0))`,
      );
      acquired();
      await hold;
    });
    await ready;
    let calls = 0;
    try {
      await expect(
        withUserSession(appUrl as string, owner, (db) =>
          generateShotImage({
            db,
            workspaceId,
            userId: owner,
            projectId: fixture.project.id,
            shotId,
            model: "fixture",
            provider: {
              generate: async () => {
                calls++;
                return { bytes: Buffer.from("bad"), mimeType: "image/png" };
              },
            },
          }),
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(calls).toBe(0);
    } finally {
      release();
      await holder;
    }
  });

  it("변환 실패 후 재시도에서도 받은 이미지를 재사용한다", async () => {
    const fixture = await createFixture();
    let calls = 0;
    const generate = () =>
      withUserSession(appUrl as string, owner, (db) =>
        generateShotImage({
          db,
          workspaceId,
          userId: owner,
          projectId: fixture.project.id,
          shotId: fixture.first.shots[0]!.id,
          model: "fixture",
          provider: {
            generate: async () => {
              calls++;
              return {
                bytes: Buffer.from("invalid-image-fixture"),
                mimeType: "image/png",
              };
            },
          },
        }),
      );
    await expect(generate()).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(generate()).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(calls).toBe(1);
  }, 60_000);
  it("Gemini 이미지를 저장한 뒤 같은 장면은 유료 호출 없이 재사용한다", async () => {
    const fixture = await createFixture();
    const temp = await mkdtemp(path.join(os.tmpdir(), "shorts-gemini-"));
    try {
      const imagePath = path.join(temp, "scene.png");
      await runCommand("ffmpeg", [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=64x96",
        "-frames:v",
        "1",
        "-threads",
        "1",
        imagePath,
      ]);
      let calls = 0;
      const provider = {
        generate: async () => {
          calls++;
          return { bytes: await readFile(imagePath), mimeType: "image/png" };
        },
      };
      const generate = () =>
        withUserSession(appUrl as string, owner, (db) =>
          generateShotImage({
            db,
            workspaceId,
            userId: owner,
            projectId: fixture.project.id,
            shotId: fixture.first.shots[0]!.id,
            model: "fixture-image",
            provider,
          }),
        );
      const first = await generate();
      const second = await generate();
      expect(second).toEqual({ assetId: first.assetId, reused: true });
      expect(calls).toBe(1);
      const asset = (
        await listMediaAssetsForProject(
          service,
          workspaceId,
          fixture.project.id,
        )
      ).find((item) => item.id === first.assetId)!;
      expect(asset.provider).toBe("gemini_image");
      expect(asset.mimeType).toBe("video/mp4");
      expect(asset.generationParameters).toMatchObject({
        model: "fixture-image",
      });
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }, 60_000);

  it("승인 없는 장면은 Gemini를 호출하기 전에 거절한다", async () => {
    const fixture = await createFixture({ approved: false });
    let calls = 0;
    await expect(
      withUserSession(appUrl as string, owner, (db) =>
        generateShotImage({
          db,
          workspaceId,
          userId: owner,
          projectId: fixture.project.id,
          shotId: fixture.first.shots[0]!.id,
          model: "fixture-image",
          provider: {
            generate: async () => {
              calls++;
              return { bytes: Buffer.from("bad"), mimeType: "image/png" };
            },
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    expect(calls).toBe(0);
  });
  it("업로드한 이미지를 장면 길이의 영상으로 변환하고 새 합성에서 재사용한다", async () => {
    const fixture = await createFixture();
    const before = await enqueue(fixture, "before-image");
    await executeRenderJob(before.renderJobId, service);
    const temp = await mkdtemp(path.join(os.tmpdir(), "shorts-image-"));
    try {
      const imagePath = path.join(temp, "scene.png");
      await runCommand("ffmpeg", [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=64x96",
        "-frames:v",
        "1",
        "-threads",
        "1",
        imagePath,
      ]);
      const shot = fixture.first.shots[0]!;
      const asset = await saveUploadedClip({
        db: service,
        workspaceId,
        userId: owner,
        projectId: fixture.project.id,
        shotId: shot.id,
        bytes: await readFile(imagePath),
        mimeType: "image/png",
        fileName: "scene.png",
      });
      expect(asset.mimeType).toBe("video/mp4");
      const probe = await probeMedia(asset.storageUri!);
      expect(probe.width).toBe(1080);
      expect(probe.height).toBe(1920);
      expect(probe.durationSeconds).toBeCloseTo(
        Number(shot.endSeconds) - Number(shot.startSeconds),
        1,
      );
      const after = await enqueue(fixture, "after-image");
      expect(after.commandHash).not.toBe(before.commandHash);
      const job = await getRenderJob(service, workspaceId, after.renderJobId);
      expect(
        renderManifestSchema.parse(job!.renderManifest).shots[0],
      ).toMatchObject({ clipAssetId: asset.id, strategy: "user_upload" });
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }, 60_000);

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
    expect(duplicate).toMatchObject({
      reused: true,
      renderJobId: first.renderJobId,
    });
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
    expect(
      (await getRenderJob(service, workspaceId, render.renderJobId))?.status,
    ).toBe("failed");
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
    expect(
      failedManifest.shots.every(
        (shot) => shot.execution.status === "succeeded",
      ),
    ).toBe(true);

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
    const retryJob = await getRenderJob(
      service,
      workspaceId,
      retry.renderJobId,
    );
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
    const executedRetry = await getRenderJob(
      service,
      workspaceId,
      retry.renderJobId,
    );
    const executedManifest = renderManifestSchema.parse(
      executedRetry!.renderManifest,
    );
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
    expect(
      (await getRenderJob(service, workspaceId, render.renderJobId))?.status,
    ).toBe("running");
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

describe("Narration and render integration", () => {
  it("saves voice once, pins it to matching shots, and renders an audible track", async () => {
    const fixture = await createFixture();
    const pcm = Buffer.alloc(24000);
    for (let i = 0; i < pcm.length / 2; i++)
      pcm.writeInt16LE(
        Math.round(6000 * Math.sin((2 * Math.PI * 440 * i) / 24000)),
        i * 2,
      );
    let calls = 0;
    const options = {
      db: service,
      workspaceId,
      projectId: fixture.project.id,
      shots: fixture.first.shots,
      model: "test",
      voice: "test",
      provider: {
        synthesize: async () => {
          calls++;
          return pcmToWave(pcm);
        },
      },
    };
    const voice = await generateNarration(options);
    expect((await generateNarration(options)).id).toBe(voice.id);
    expect(calls).toBe(2);
    const changedVoice = await generateNarration({
      ...options,
      voice: "another-voice",
    });
    expect(changedVoice.id).not.toBe(voice.id);
    expect(calls).toBe(4);
    const queued = await enqueue(fixture, "with-narration");
    const rendered = await executeRenderJob(queued.renderJobId, service);
    expect(rendered.status).toBe("succeeded");
    expect(rendered.probe).toMatchObject({ hasNarration: true });
    expect(Number(rendered.loudnessLufs)).toBeGreaterThan(-30);
    const changed = fixture.first.shots.map((s) => ({
      ...s,
      narration: "바뀐 대본",
    }));
    expect(
      await findNarration(service, workspaceId, fixture.project.id, changed),
    ).toBeNull();
  });
});
