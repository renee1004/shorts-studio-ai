import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  closePools,
  getLatestResearchBrief,
  insertNiche,
  listResearchBriefVersions,
  listResearchOverview,
  serviceDb,
  withUserSession,
  type Database,
} from "@shorts-os/db";
import { generateResearchSchema } from "@shorts-os/contracts";
import { MockResearchProvider } from "@shorts-os/providers";
import { researchTopic } from "../research-topic";

/**
 * Phase 2A 완료 조건 검증.
 * - Brief는 덮어쓰지 않고 version이 쌓인다
 * - 같은 Idempotency Key는 Run을 늘리지 않는다
 * - 인용이 없으면 needs_review로 남고 가짜 출처를 만들지 않는다
 */
const serviceUrl = process.env.DATABASE_URL;
const appUrl = process.env.DATABASE_APP_URL ?? serviceUrl;

const owner = "00000000-0000-4000-8000-0000000000d1";
const suffix = Date.now().toString(36);

let service: Database;
let workspaceId: string;
let topicId: string;

beforeAll(async () => {
  if (!serviceUrl) throw new Error("DATABASE_URL이 필요합니다.");
  service = serviceDb(serviceUrl);

  workspaceId = await withUserSession(appUrl as string, owner, async (db) => {
    const rows = await db.execute<{ create_workspace_with_owner: string }>(
      sql`select create_workspace_with_owner(${"Research WS"}, ${`research-${suffix}`}, 'Asia/Seoul', 'ko-KR')`,
    );
    const created = rows as unknown as { create_workspace_with_owner: string }[];
    return created[0]!.create_workspace_with_owner;
  });

  const niche = await withUserSession(appUrl as string, owner, (db) =>
    insertNiche(db, {
      workspaceId,
      createdBy: owner,
      slug: `research-niche-${suffix}`,
      name: "Research Niche",
      targetCountry: "KR",
      targetLanguage: "ko",
      seedKeywords: ["연말정산"],
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
      ${workspaceId}, ${niche.id}, '연말정산 절세', '연말정산 절세', '초보자용',
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

const request = generateResearchSchema.parse({});

describe("Research Brief", () => {
  it("인용이 없으면 사실 주장을 만들지 않고 needs_review로 남는다", async () => {
    const result = await researchTopic({
      db: service,
      provider: new MockResearchProvider(),
      workspaceId,
      topicId,
      userId: owner,
      idempotencyKey: `research-${suffix}-1`,
      request,
    });

    expect(result.mode).toBe("mock");
    expect(result.brief.version).toBe(1);
    expect(result.brief.status).toBe("needs_review");
    expect(result.brief.content.citations).toHaveLength(0);
    expect(result.brief.content.keyFacts).toHaveLength(0);
    expect(result.brief.citationCoverage).toBeNull();
    expect(result.brief.content.unknowns.length).toBeGreaterThan(0);
  });

  it("같은 Idempotency Key는 새 Run이나 새 version을 만들지 않는다", async () => {
    const again = await researchTopic({
      db: service,
      provider: new MockResearchProvider(),
      workspaceId,
      topicId,
      userId: owner,
      idempotencyKey: `research-${suffix}-1`,
      request,
    });

    expect(again.reused).toBe(true);
    expect(again.brief.version).toBe(1);

    const runs = await service.execute<{ count: string }>(
      sql`select count(*)::text as count from workflow_runs
          where workspace_id = ${workspaceId} and workflow_type = 'topic.research'`,
    );
    expect((runs as unknown as { count: string }[])[0]?.count).toBe("1");
  });

  it("같은 입력을 새 키로 부르면 기존 Brief를 재사용한다", async () => {
    const result = await researchTopic({
      db: service,
      provider: new MockResearchProvider(),
      workspaceId,
      topicId,
      userId: owner,
      idempotencyKey: `research-${suffix}-2`,
      request,
    });

    expect(result.fromCache).toBe(true);
    expect(result.brief.version).toBe(1);
  });

  it("forceRefresh는 덮어쓰지 않고 version을 올린다", async () => {
    const result = await researchTopic({
      db: service,
      provider: new MockResearchProvider(),
      workspaceId,
      topicId,
      userId: owner,
      idempotencyKey: `research-${suffix}-3`,
      request: { ...request, forceRefresh: true },
    });

    expect(result.fromCache).toBe(false);
    expect(result.brief.version).toBe(2);

    const versions = await listResearchBriefVersions(service, workspaceId, topicId);
    expect(versions.map((brief) => brief.version)).toStrictEqual([2, 1]);

    const latest = await getLatestResearchBrief(service, workspaceId, topicId);
    expect(latest?.version).toBe(2);
  });

  it("Provider 오류는 Run을 failed로 남긴다", async () => {
    const provider = new MockResearchProvider({ scenario: { failWith: { status: 503 } } });

    await expect(
      researchTopic({
        db: service,
        provider,
        workspaceId,
        topicId,
        userId: owner,
        idempotencyKey: `research-${suffix}-fail`,
        request: { ...request, forceRefresh: true },
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });

    const failed = await service.execute<{ count: string }>(
      sql`select count(*)::text as count from workflow_runs
          where workspace_id = ${workspaceId} and status = 'failed'`,
    );
    expect((failed as unknown as { count: string }[])[0]?.count).toBe("1");
  });

  it("Research 목록에 Brief가 붙어서 나온다", async () => {
    const rows = await listResearchOverview(service, workspaceId, 10);
    const row = rows.find((entry) => entry.topicId === topicId);

    expect(row?.versionCount).toBe(2);
    expect(row?.brief?.version).toBe(2);
  });
});
