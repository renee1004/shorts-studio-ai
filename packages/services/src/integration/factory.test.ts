import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  closePools,
  countCostEventsForRun,
  insertContentProject,
  insertNiche,
  insertScript,
  replaceShots,
  serviceDb,
  withUserSession,
  type Database,
} from "@shorts-os/db";
import { structuredScriptSchema } from "@shorts-os/contracts";
import { UnavailableVideoGenerationProvider } from "@shorts-os/providers";
import {
  approveRenderJob,
  enqueueProjectRender,
  executeRenderJob,
} from "../factory";
import { ffmpegAvailable } from "../render-engine";
import { DomainError } from "@shorts-os/domain";

const serviceUrl = process.env.DATABASE_URL;
const appUrl = process.env.DATABASE_APP_URL ?? serviceUrl;
const owner = "00000000-0000-4000-8000-0000000000d4";
const suffix = Date.now().toString(36);

let service: Database;
let workspaceId: string;
let topicId: string;
let projectId: string;

beforeAll(async () => {
  if (!serviceUrl) throw new Error("DATABASE_URL이 필요합니다.");
  service = serviceDb(serviceUrl);

  workspaceId = await withUserSession(appUrl as string, owner, async (db) => {
    const rows = await db.execute<{ create_workspace_with_owner: string }>(
      sql`select create_workspace_with_owner(${"Factory WS"}, ${`factory-${suffix}`}, 'Asia/Seoul', 'ko-KR')`,
    );
    const created = rows as unknown as { create_workspace_with_owner: string }[];
    return created[0]!.create_workspace_with_owner;
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

  const topicRows = await service.execute<{ id: string }>(sql`
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
  topicId = (topicRows as unknown as { id: string }[])[0]!.id;

  const project = await insertContentProject(service, {
    workspaceId,
    topicId,
    researchBriefId: null,
    title: "렌더 프로젝트",
    targetLanguage: "ko",
    targetDurationSeconds: 8,
    ownerUserId: owner,
    status: "approved_to_render",
  });
  projectId = project.id;

  const structured = structuredScriptSchema.parse({
    title: "렌더 대본",
    hook: "첫 문장",
    targetDurationSeconds: 8,
    estimatedDurationSeconds: 8,
    cta: { type: "follow", text: "구독" },
    beats: [
      {
        beatId: "b1",
        startSeconds: 0,
        endSeconds: 1,
        purpose: "hook",
        narration: "첫 장면입니다.",
        onScreenText: "첫 장면",
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
    version: 1,
    structured,
    scriptText: structured.beats.map((beat) => beat.narration).join("\n"),
    wordCount: 8,
    estimatedDurationSeconds: 2,
    claims: [],
    originalitySummary: {},
    modelName: "test",
    promptVersion: "test",
    inputHash: `factory-${suffix}`,
    createdBy: owner,
    status: "approved",
  });

  await replaceShots(
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
});

afterAll(async () => {
  await service.execute(sql`delete from workspaces where id = ${workspaceId}`);
  await closePools();
});

describe("Phase 4 Video Factory", () => {
  it("클립이 없고 Placeholder를 끄면 저장하지 않는다", async () => {
    await expect(
      enqueueProjectRender({
        db: service,
        system: service,
        workspaceId,
        userId: owner,
        projectId,
        request: {
          allowPlaceholder: false,
          width: 360,
          height: 640,
          fps: 24,
        },
        idempotencyKey: `no-ph-${suffix}`,
        video: new UnavailableVideoGenerationProvider(),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("같은 명령은 Render Job과 비용을 다시 만들지 않는다", async () => {
    const video = new UnavailableVideoGenerationProvider();
    const first = await enqueueProjectRender({
      db: service,
      system: service,
      workspaceId,
      userId: owner,
      projectId,
      request: { allowPlaceholder: true, width: 360, height: 640, fps: 24 },
      idempotencyKey: `ren-${suffix}`,
      video,
    });
    expect(first.reused).toBe(false);

    const second = await enqueueProjectRender({
      db: service,
      system: service,
      workspaceId,
      userId: owner,
      projectId,
      request: { allowPlaceholder: true, width: 360, height: 640, fps: 24 },
      idempotencyKey: `ren-${suffix}-b`,
      video,
    });
    expect(second.reused).toBe(true);
    expect(second.renderJobId).toBe(first.renderJobId);

    if (!(await ffmpegAvailable())) {
      await expect(executeRenderJob(first.renderJobId, service)).rejects.toBeInstanceOf(DomainError);
      return;
    }

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
    const approvalAgain = await approveRenderJob({
      db: service,
      system: service,
      workspaceId,
      userId: owner,
      renderId: first.renderJobId,
    });
    expect(approvalAgain.reused).toBe(true);
  }, 90_000);
});
