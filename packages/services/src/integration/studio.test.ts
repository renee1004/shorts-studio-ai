import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  closePools,
  decideTopic,
  insertNiche,
  listScripts,
  serviceDb,
  withUserSession,
  type Database,
} from "@shorts-os/db";
import { generateResearchSchema } from "@shorts-os/contracts";
import { MockContentStudioProvider, MockResearchProvider, MockYouTubeProvider } from "@shorts-os/providers";
import { researchTopic } from "../research-topic";
import {
  analyzeReferenceDna,
  createStudioProject,
  decideProjectApproval,
  generateProjectAngles,
  generateProjectScript,
  importReferenceVideo,
  restoreScriptVersion,
  runProjectQa,
  selectProjectAngle,
} from "../studio";

const serviceUrl = process.env.DATABASE_URL;
const appUrl = process.env.DATABASE_APP_URL ?? serviceUrl;
const owner = "00000000-0000-4000-8000-0000000000d2";
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
      sql`select create_workspace_with_owner(${"Studio WS"}, ${`studio-${suffix}`}, 'Asia/Seoul', 'ko-KR')`,
    );
    const created = rows as unknown as { create_workspace_with_owner: string }[];
    return created[0]!.create_workspace_with_owner;
  });

  const niche = await withUserSession(appUrl as string, owner, (db) =>
    insertNiche(db, {
      workspaceId,
      createdBy: owner,
      slug: `studio-niche-${suffix}`,
      name: "Studio Niche",
      targetCountry: "KR",
      targetLanguage: "ko",
      seedKeywords: ["주간보고"],
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
      ${workspaceId}, ${niche.id}, '주간 보고 자동화', '주간 보고 자동화', '초보자용',
      'KR', 'ko', 'test'
    )
    returning id
  `);
  topicId = (topicRows as unknown as { id: string }[])[0]!.id;
});

afterAll(async () => {
  await service.execute(sql`delete from workspaces where id = ${workspaceId}`);
  await closePools();
});

describe("Phase 3 Demo Content Studio", () => {
  it("대본 없이 Import하면 transcriptProvided가 false다", async () => {
    const result = await importReferenceVideo({
      db: service,
      system: service,
      youtube: new MockYouTubeProvider({ seed: 9, now: new Date("2026-09-03T00:00:00Z") }),
      workspaceId,
      userId: owner,
      request: { url: "https://www.youtube.com/watch?v=dQw4w9wgGcQ" },
      idempotencyKey: `imp-${suffix}`,
    });

    expect(result.reused).toBe(false);
    if (!("video" in result) || !result.video) throw new Error("video missing");
    const meta = result.video.metadata as { transcriptProvided?: boolean };
    expect(meta.transcriptProvided).toBe(false);

    const dna = await analyzeReferenceDna({
      db: service,
      system: service,
      provider: new MockContentStudioProvider(),
      workspaceId,
      userId: owner,
      referenceVideoId: result.video.id,
      idempotencyKey: `dna-${suffix}`,
    });
    expect(dna.reused).toBe(false);
    if (!("transcriptProvided" in dna)) throw new Error("pattern missing");
    expect(dna.transcriptProvided).toBe(false);
    if ("pattern" in dna && dna.pattern) {
      const evidence = dna.pattern.evidence as { evidenceType: string }[];
      expect(evidence.every((item) => item.evidenceType !== "user_supplied_transcript")).toBe(true);
    }
  });

  it("승인 Topic에서 Angle·Script·QA·승인이 이어진다", async () => {
    await researchTopic({
      db: service,
      provider: new MockResearchProvider(),
      workspaceId,
      topicId,
      userId: owner,
      idempotencyKey: `res-${suffix}`,
      request: generateResearchSchema.parse({}),
    });

    await decideTopic(service, {
      workspaceId,
      topicId,
      userId: owner,
      decision: "approved",
      reason: "테스트 승인",
      now: new Date("2026-09-03T00:00:00Z"),
    });

    const created = await createStudioProject({
      db: service,
      workspaceId,
      userId: owner,
      request: {
        topicId,
        targetLanguage: "ko",
        targetDurationSeconds: 45,
      },
    });
    projectId = created.project.id;

    const angles = await generateProjectAngles({
      db: service,
      system: service,
      provider: new MockContentStudioProvider(),
      workspaceId,
      userId: owner,
      projectId,
      idempotencyKey: `ang-${suffix}`,
    });
    expect(angles.reused).toBe(false);
    if (!("angles" in angles) || !angles.angles) throw new Error("angles missing");
    expect(angles.angles).toHaveLength(3);

    const selected = angles.angles[0]!;
    await selectProjectAngle({
      db: service,
      workspaceId,
      projectId,
      angleId: selected.id,
    });

    const script = await generateProjectScript({
      db: service,
      system: service,
      provider: new MockContentStudioProvider(),
      workspaceId,
      userId: owner,
      projectId,
      idempotencyKey: `scr-${suffix}`,
    });
    expect(script.reused).toBe(false);
    if (!("claims" in script) || !script.script) throw new Error("script missing");
    expect(script.claims.every((claim) => claim.unverified || claim.citationIndexes.length > 0)).toBe(
      true,
    );
    expect(script.shots.length).toBeGreaterThan(1);

    const firstId = script.script.id;
    const restored = await restoreScriptVersion({
      db: service,
      workspaceId,
      userId: owner,
      projectId,
      fromScriptId: firstId,
    });
    expect(restored.version).toBe(script.script.version + 1);
    const versions = await listScripts(service, workspaceId, projectId);
    expect(versions).toHaveLength(2);

    const qa = await runProjectQa({
      db: service,
      system: service,
      workspaceId,
      userId: owner,
      projectId,
      scriptId: restored.id,
      checks: ["fact", "originality", "policy", "brand", "duration", "caption_readability"],
      idempotencyKey: `qa-${suffix}`,
    });
    expect(qa.reused).toBe(false);
    if (!("blocking" in qa)) throw new Error("qa missing");
    expect(qa.blocking).toBe(false);

    const approval = await decideProjectApproval({
      db: service,
      system: service,
      workspaceId,
      userId: owner,
      projectId,
      request: { decision: "approved", scriptId: restored.id },
    });
    expect(approval.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(approval.approval.decision).toBe("approved");
  });

  it("Blocker QA가 있으면 승인을 거절한다", async () => {
    const risky = await generateProjectScript({
      db: service,
      system: service,
      provider: {
        kind: "gemini",
        mode: "mock",
        analyzeDna: async () => {
          throw new Error("unused");
        },
        generateAngles: async () => {
          throw new Error("unused");
        },
        generateScript: async () => {
          const { MockContentStudioProvider } = await import("@shorts-os/providers");
          const inner = new MockContentStudioProvider();
          const generated = await inner.generateScript({
            topicTitle: "수익 보장",
            language: "ko",
            targetDurationSeconds: 45,
            angle: {
              title: "수익 보장",
              hook: "이 방법으로 수익 보장합니다 월 1 억",
              promise: "수익 보장",
              outline: ["수익 보장", "월 1", "구독자 10000"],
            },
            keyFacts: [],
            citationCount: 0,
          });
          generated.structured.beats[0]!.narration = "이 방법으로 수익 보장합니다";
          generated.structured.factualClaims = [
            { claimKey: "bad", statement: "수익 보장", unverified: false, citationIndexes: [] },
          ];
          return generated;
        },
      },
      workspaceId,
      userId: owner,
      projectId,
      idempotencyKey: `scr-bad-${suffix}`,
    });
    if (!("script" in risky) || !risky.script) throw new Error("risky script missing");

    const qa = await runProjectQa({
      db: service,
      system: service,
      workspaceId,
      userId: owner,
      projectId,
      scriptId: risky.script.id,
      checks: ["fact", "policy"],
      idempotencyKey: `qa-bad-${suffix}`,
    });
    if (!("blocking" in qa)) throw new Error("qa missing");
    expect(qa.blocking).toBe(true);

    await expect(
      decideProjectApproval({
        db: service,
        system: service,
        workspaceId,
        userId: owner,
        projectId,
        request: { decision: "approved", scriptId: risky.script.id },
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });
});
