import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  closePools,
  decideTopic,
  getContentProject,
  insertNiche,
  listScriptCitations,
  listScripts,
  resolveBriefCitationSources,
  serviceDb,
  withUserSession,
  type Database,
} from "@shorts-os/db";
import { generateResearchSchema, structuredScriptSchema } from "@shorts-os/contracts";
import { MockContentStudioProvider, MockResearchProvider, MockYouTubeProvider } from "@shorts-os/providers";
import { researchTopic } from "../research-topic";
import {
  analyzeReferenceDna,
  createStudioProject,
  decideProjectApproval,
  generateProjectAngles,
  generateProjectScript,
  importReferenceVideo,
  patchDraftScript,
  restoreScriptVersion,
  runProjectQa,
  selectProjectAngle,
} from "../studio";
import type { ResearchProvider } from "@shorts-os/providers";

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
            {
              claimKey: "bad",
              statement: "수익 보장",
              unverified: false,
              citationIndexes: [],
              sourceIds: [],
            },
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
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

function groundedProvider(version: 1 | 2): ResearchProvider {
  return {
    kind: "gemini",
    mode: "live",
    async researchTopic() {
      const suffix = version === 1 ? "v1" : "v2";
      return {
        mode: "live",
        modelName: "fixture-grounded",
        promptVersion: `fixture.${suffix}`,
        content: {
          executiveSummary: `고정 Brief ${suffix}`,
          keyFacts: [
            {
              statement: `두 출처가 지지하는 사실 ${suffix}`,
              // 순서를 의도적으로 뒤집어 Fact 순번과 Citation 순번을 혼동하는 회귀를 잡는다.
              citationIndexes: [1, 0],
            },
          ],
          audienceInsights: [],
          angles: [],
          counterpoints: [],
          unknowns: [],
          citations: [
            {
              url: `https://example.com/${suffix}/alpha`,
              title: `Alpha ${suffix}`,
              publisher: "Example",
              publishedAt: null,
            },
            {
              url: `https://example.com/${suffix}/beta`,
              title: `Beta ${suffix}`,
              publisher: "Example",
              publishedAt: null,
            },
          ],
        },
      };
    },
  };
}

async function createApprovedTopic(label: string) {
  const nicheRows = await service.execute<{ id: string }>(
    sql`select id from niches where workspace_id = ${workspaceId} limit 1`,
  );
  const nicheId = (nicheRows as unknown as { id: string }[])[0]!.id;
  const topicRows = await service.execute<{ id: string }>(sql`
    insert into topics (
      workspace_id, niche_id, title, normalized_title, angle_hint,
      target_country, target_language, decision, discovered_by
    )
    values (
      ${workspaceId}, ${nicheId}, ${label}, ${`${label}-${suffix}`}, '검증용',
      'KR', 'ko', 'approved', 'test'
    )
    returning id
  `);
  return (topicRows as unknown as { id: string }[])[0]!.id;
}

async function createScriptForProject(topic: string) {
  const topicId = await createApprovedTopic(topic);
  const briefV1 = await researchTopic({
    db: service,
    provider: groundedProvider(1),
    workspaceId,
    topicId,
    userId: owner,
    idempotencyKey: `grounded-v1-${topicId}`,
    request: generateResearchSchema.parse({ forceRefresh: true }),
  });
  const created = await createStudioProject({
    db: service,
    workspaceId,
    userId: owner,
    request: {
      topicId,
      researchBriefId: briefV1.brief.id,
      targetLanguage: "ko",
      targetDurationSeconds: 45,
    },
  });
  const angleResult = await generateProjectAngles({
    db: service,
    system: service,
    provider: new MockContentStudioProvider(),
    workspaceId,
    userId: owner,
    projectId: created.project.id,
    idempotencyKey: `integrity-angle-${created.project.id}`,
  });
  if (!("angles" in angleResult) || !angleResult.angles) throw new Error("angles missing");
  await selectProjectAngle({
    db: service,
    workspaceId,
    projectId: created.project.id,
    angleId: angleResult.angles[0]!.id,
  });
  const scriptResult = await generateProjectScript({
    db: service,
    system: service,
    provider: new MockContentStudioProvider(),
    workspaceId,
    userId: owner,
    projectId: created.project.id,
    idempotencyKey: `integrity-script-${created.project.id}`,
  });
  if (!("script" in scriptResult) || !scriptResult.script) throw new Error("script missing");
  return {
    topicId,
    briefV1: briefV1.brief,
    project: created.project,
    script: scriptResult.script,
    claims: scriptResult.claims,
  };
}

describe("Phase 3 승인 무결성", () => {
  it("Project는 선택한 Brief v1에 고정되고 Citation index/source ID를 그대로 보존한다", async () => {
    const fixture = await createScriptForProject("Brief 고정 및 Citation");
    const briefV2 = await researchTopic({
      db: service,
      provider: groundedProvider(2),
      workspaceId,
      topicId: fixture.topicId,
      userId: owner,
      idempotencyKey: `grounded-v2-${fixture.topicId}`,
      request: generateResearchSchema.parse({ forceRefresh: true }),
    });
    expect(briefV2.brief.version).toBe(2);

    const persistedProject = await getContentProject(
      service,
      workspaceId,
      fixture.project.id,
    );
    expect(persistedProject?.researchBriefId).toBe(fixture.briefV1.id);

    // v2가 최신인 상태에서 다시 생성해도 Project에 고정된 v1만 사용해야 한다.
    const pinnedScript = await generateProjectScript({
      db: service,
      system: service,
      provider: new MockContentStudioProvider(),
      workspaceId,
      userId: owner,
      projectId: fixture.project.id,
      idempotencyKey: `pinned-script-${fixture.project.id}`,
    });
    if (!("script" in pinnedScript) || !pinnedScript.script) {
      throw new Error("pinned script missing");
    }
    const claim = pinnedScript.claims[0]!;
    expect(claim.statement).toContain("v1");
    expect(claim.citationIndexes).toStrictEqual([1, 0]);
    const briefSources = await resolveBriefCitationSources(
      service,
      workspaceId,
      fixture.briefV1,
    );
    const expectedSourceIds = [1, 0].map(
      (index) => briefSources.find((source) => source.citationIndex === index)!.sourceId,
    );
    expect(claim.sourceIds).toStrictEqual(expectedSourceIds);

    const mappings = await listScriptCitations(
      service,
      workspaceId,
      pinnedScript.script.id,
    );
    expect(new Set(mappings.map((mapping) => mapping.sourceId))).toStrictEqual(
      new Set(expectedSourceIds),
    );
  });

  it("QA가 없거나 6종 중 일부만 있으면 승인할 수 없다", async () => {
    const fixture = await createScriptForProject("QA 완전성");

    await expect(
      decideProjectApproval({
        db: service,
        system: service,
        workspaceId,
        userId: owner,
        projectId: fixture.project.id,
        request: { decision: "approved", scriptId: fixture.script.id },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await runProjectQa({
      db: service,
      system: service,
      workspaceId,
      userId: owner,
      projectId: fixture.project.id,
      scriptId: fixture.script.id,
      checks: ["fact", "policy"],
      idempotencyKey: `partial-qa-${fixture.project.id}`,
    });
    await expect(
      decideProjectApproval({
        db: service,
        system: service,
        workspaceId,
        userId: owner,
        projectId: fixture.project.id,
        request: { decision: "approved", scriptId: fixture.script.id },
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      options: { details: { missingChecks: expect.arrayContaining(["originality", "duration"]) } },
    });
  });

  it("QA 통과 후 Script 수정은 새 version이며 새 QA 전에는 승인할 수 없다", async () => {
    const fixture = await createScriptForProject("수정 후 QA");
    const fullChecks = [
      "fact",
      "originality",
      "policy",
      "brand",
      "duration",
      "caption_readability",
    ] as const;
    await runProjectQa({
      db: service,
      system: service,
      workspaceId,
      userId: owner,
      projectId: fixture.project.id,
      scriptId: fixture.script.id,
      checks: [...fullChecks],
      idempotencyKey: `full-qa-${fixture.project.id}`,
    });
    const firstApproval = await decideProjectApproval({
      db: service,
      system: service,
      workspaceId,
      userId: owner,
      projectId: fixture.project.id,
      request: { decision: "approved", scriptId: fixture.script.id },
    });

    const edited = await patchDraftScript({
      db: service,
      workspaceId,
      userId: owner,
      scriptId: fixture.script.id,
      title: "수정된 제목",
      scriptText: `${fixture.script.scriptText}\n새로운 마무리 문장`,
    });
    expect(edited.script.version).toBe(fixture.script.version + 1);
    expect(edited.script.id).not.toBe(fixture.script.id);
    expect(edited.shots.every((shot) => shot.scriptId === edited.script.id)).toBe(true);

    await expect(
      decideProjectApproval({
        db: service,
        system: service,
        workspaceId,
        userId: owner,
        projectId: fixture.project.id,
        request: { decision: "approved", scriptId: edited.script.id },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await runProjectQa({
      db: service,
      system: service,
      workspaceId,
      userId: owner,
      projectId: fixture.project.id,
      scriptId: edited.script.id,
      checks: [...fullChecks],
      idempotencyKey: `edited-qa-${fixture.project.id}`,
    });
    const secondApproval = await decideProjectApproval({
      db: service,
      system: service,
      workspaceId,
      userId: owner,
      projectId: fixture.project.id,
      request: { decision: "approved", scriptId: edited.script.id },
    });
    expect(secondApproval.snapshotHash).not.toBe(firstApproval.snapshotHash);
  });

  it("다른 Project의 scriptId는 QA 유무와 관계없이 승인할 수 없다", async () => {
    const first = await createScriptForProject("Project A");
    const second = await createScriptForProject("Project B");
    await expect(
      decideProjectApproval({
        db: service,
        system: service,
        workspaceId,
        userId: owner,
        projectId: second.project.id,
        request: { decision: "approved", scriptId: first.script.id },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("QA 이후 Snapshot 대상 Shot이 바뀌면 stale QA로 승인을 거부하고 hash도 달라진다", async () => {
    const fixture = await createScriptForProject("Snapshot 변경");
    const checks = [
      "fact",
      "originality",
      "policy",
      "brand",
      "duration",
      "caption_readability",
    ] as const;
    await runProjectQa({
      db: service,
      system: service,
      workspaceId,
      userId: owner,
      projectId: fixture.project.id,
      scriptId: fixture.script.id,
      checks: [...checks],
      idempotencyKey: `snapshot-qa-1-${fixture.project.id}`,
    });
    const before = await decideProjectApproval({
      db: service,
      system: service,
      workspaceId,
      userId: owner,
      projectId: fixture.project.id,
      request: { decision: "approved", scriptId: fixture.script.id },
    });

    await service.execute(sql`
      update shots
      set visual_description = visual_description || ' 변경'
      where script_id = ${fixture.script.id} and sequence_no = 1
    `);
    await expect(
      decideProjectApproval({
        db: service,
        system: service,
        workspaceId,
        userId: owner,
        projectId: fixture.project.id,
        request: { decision: "approved", scriptId: fixture.script.id },
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      options: { details: { staleChecks: expect.arrayContaining(["fact", "policy"]) } },
    });

    await runProjectQa({
      db: service,
      system: service,
      workspaceId,
      userId: owner,
      projectId: fixture.project.id,
      scriptId: fixture.script.id,
      checks: [...checks],
      idempotencyKey: `snapshot-qa-2-${fixture.project.id}`,
    });
    const after = await decideProjectApproval({
      db: service,
      system: service,
      workspaceId,
      userId: owner,
      projectId: fixture.project.id,
      request: { decision: "approved", scriptId: fixture.script.id },
    });
    expect(after.snapshotHash).not.toBe(before.snapshotHash);
  });
});

describe("Phase 3.1 수동 수정과 QA hash 우회 방지", () => {
  it("공백, 1개 Beat, 17개 Beat 수동 Script를 저장하지 않는다", async () => {
    const fixture = await createScriptForProject("수동 Script 경계");
    const invalidTexts = [
      "   ",
      "Beat 하나뿐입니다.",
      Array.from({ length: 17 }, (_, index) => `Beat ${index + 1}`).join("\n"),
    ];

    for (const scriptText of invalidTexts) {
      await expect(
        patchDraftScript({
          db: service,
          workspaceId,
          userId: owner,
          scriptId: fixture.script.id,
          scriptText,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    }

    const versions = await listScripts(service, workspaceId, fixture.project.id);
    expect(versions).toHaveLength(1);
  });

  it("수동 추가 문장을 structuredScript와 unverified Claim, Shot에 동기화한다", async () => {
    const fixture = await createScriptForProject("수동 Claim 보존");
    const manualSentence = "수동으로 추가한 검토 필요 사실입니다.";
    const edited = await patchDraftScript({
      db: service,
      workspaceId,
      userId: owner,
      scriptId: fixture.script.id,
      scriptText: `${fixture.script.scriptText}\n${manualSentence}`,
    });

    const structured = structuredScriptSchema.parse(edited.script.structuredScript);
    expect(structured.beats).toHaveLength(5);
    expect(structured.beats.at(-1)?.narration).toBe(manualSentence);
    const manualClaim = structured.factualClaims.find(
      (claim) => claim.statement === manualSentence,
    );
    expect(manualClaim).toMatchObject({
      unverified: true,
      citationIndexes: [],
      sourceIds: [],
    });
    expect(
      edited.shots.some((shot) => shot.narration === manualSentence),
    ).toBe(true);

    const qa = await runProjectQa({
      db: service,
      system: service,
      workspaceId,
      userId: owner,
      projectId: fixture.project.id,
      scriptId: edited.script.id,
      checks: ["fact"],
      idempotencyKey: `manual-claim-qa-${fixture.project.id}`,
    });
    if (!("checks" in qa) || !qa.checks) throw new Error("QA missing");
    expect(
      qa.checks[0]?.findings.some(
        (finding) =>
          finding.code === "CLAIM_UNVERIFIED" &&
          finding.evidence === manualSentence,
      ),
    ).toBe(true);
  });

  it("QA rule, 목표 길이, Brand, 정렬된 Reference text 변경은 QA를 stale로 만든다", async () => {
    const fixture = await createScriptForProject("QA context hash");
    const checks = [
      "fact",
      "originality",
      "policy",
      "brand",
      "duration",
      "caption_readability",
    ] as const;
    let run = 0;
    const runFullQa = () =>
      runProjectQa({
        db: service,
        system: service,
        workspaceId,
        userId: owner,
        projectId: fixture.project.id,
        scriptId: fixture.script.id,
        checks: [...checks],
        idempotencyKey: `phase31-context-${fixture.project.id}-${++run}`,
      });
    const expectStale = () =>
      expect(
        decideProjectApproval({
          db: service,
          system: service,
          workspaceId,
          userId: owner,
          projectId: fixture.project.id,
          request: { decision: "approved", scriptId: fixture.script.id },
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        options: {
          details: {
            staleChecks: expect.arrayContaining(["fact", "originality", "policy"]),
          },
        },
      });

    await runFullQa();
    await service.execute(sql`
      update content_projects
      set target_duration_seconds = 50
      where id = ${fixture.project.id}
    `);
    await expectStale();

    await runFullQa();
    const brandRows = await service.execute<{ id: string }>(sql`
      insert into brand_profiles (workspace_id, name)
      values (${workspaceId}, 'Phase 3.1 Brand')
      returning id
    `);
    const brandId = (brandRows as unknown as { id: string }[])[0]!.id;
    await service.execute(sql`
      update content_projects set brand_profile_id = ${brandId}
      where id = ${fixture.project.id}
    `);
    await expectStale();

    await runFullQa();
    const videoRows = await service.execute<{ id: string }>(sql`
      insert into reference_videos (
        workspace_id, provider, external_video_id, external_channel_id, url, title, description
      )
      values (
        ${workspaceId}, 'youtube', ${`phase31_${suffix}`}, 'phase31_channel',
        'https://www.youtube.com/watch?v=phase31test', 'A sorted title', 'Reference body'
      )
      returning id
    `);
    const referenceVideoId = (videoRows as unknown as { id: string }[])[0]!.id;
    await service.execute(sql`
      insert into topic_reference_videos (
        workspace_id, topic_id, reference_video_id, relation_type
      )
      values (${workspaceId}, ${fixture.topicId}, ${referenceVideoId}, 'manual')
    `);
    await expectStale();

    await runFullQa();
    await service.execute(sql`
      update qa_reviews
      set rule_version = 'content.qa.tampered'
      where content_project_id = ${fixture.project.id}
        and script_id = ${fixture.script.id}
    `);
    await expectStale();
  });
});
