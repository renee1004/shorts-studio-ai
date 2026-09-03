import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  closePools,
  createMemoryCache,
  createQuotaLedger,
  decideTopic,
  insertNiche,
  listNiches,
  listTopics,
  serviceDb,
  startWorkflowRun,
  withUserSession,
  type Database,
} from "@shorts-os/db";
import { topicListQuerySchema } from "@shorts-os/contracts";
import { MockYouTubeProvider } from "@shorts-os/providers";
import { collectNicheSignals } from "../collect-niche";

/**
 * 실제 PostgreSQL에 붙어 Phase 0-1 완료 조건을 검증한다.
 * - 다른 Workspace 데이터 접근 차단 (RLS)
 * - Viewer 역할의 쓰기 차단
 * - 같은 Idempotency Key 재호출이 중복 Run을 만들지 않음
 * - 수집 → 점수 → 승인 수직 슬라이스
 */
const serviceUrl = process.env.DATABASE_URL;
const appUrl = process.env.DATABASE_APP_URL ?? serviceUrl;

const alice = "00000000-0000-4000-8000-0000000000a1";
const bob = "00000000-0000-4000-8000-0000000000b1";
const viewer = "00000000-0000-4000-8000-0000000000c1";

let service: Database;
let aliceWorkspace: string;
let bobWorkspace: string;
const suffix = Date.now().toString(36);

async function createWorkspaceAs(userId: string, name: string, slug: string): Promise<string> {
  return withUserSession(appUrl as string, userId, async (db) => {
    const rows = (await db.execute<{ create_workspace_with_owner: string }>(
      sql`select create_workspace_with_owner(${name}, ${slug}, 'Asia/Seoul', 'ko-KR')`,
    )) as unknown as { create_workspace_with_owner: string }[];
    const id = rows[0]?.create_workspace_with_owner;
    if (!id) throw new Error("워크스페이스 생성 실패");
    return id;
  });
}

beforeAll(async () => {
  if (!serviceUrl) throw new Error("DATABASE_URL이 필요합니다.");
  service = serviceDb(serviceUrl);

  aliceWorkspace = await createWorkspaceAs(alice, "Alice Studio", `alice-${suffix}`);
  bobWorkspace = await createWorkspaceAs(bob, "Bob Studio", `bob-${suffix}`);

  await service.execute(sql`
    insert into workspace_members (workspace_id, user_id, role)
    values (${aliceWorkspace}, ${viewer}, 'viewer')
    on conflict do nothing
  `);
});

afterAll(async () => {
  await service.execute(sql`delete from workspaces where id in (${aliceWorkspace}, ${bobWorkspace})`);
  await closePools();
});

describe("워크스페이스 격리", () => {
  it("소유자는 자기 워크스페이스만 본다", async () => {
    await withUserSession(appUrl as string, alice, async (db) => {
      await insertNiche(db, {
        workspaceId: aliceWorkspace,
        createdBy: alice,
        slug: "alice-niche",
        name: "Alice Niche",
        targetCountry: "KR",
        targetLanguage: "ko",
        seedKeywords: ["시간관리"],
        includeTerms: [],
        excludeTerms: [],
      });
    });

    const aliceRows = await withUserSession(appUrl as string, alice, (db) =>
      listNiches(db, aliceWorkspace),
    );
    expect(aliceRows).toHaveLength(1);
  });

  it("다른 사용자는 남의 Niche를 읽지 못한다", async () => {
    const rows = await withUserSession(appUrl as string, bob, (db) =>
      listNiches(db, aliceWorkspace),
    );
    expect(rows).toHaveLength(0);
  });

  it("다른 사용자는 남의 워크스페이스에 쓰지 못한다", async () => {
    await expect(
      withUserSession(appUrl as string, bob, (db) =>
        insertNiche(db, {
          workspaceId: aliceWorkspace,
          createdBy: bob,
          slug: "intruder",
          name: "Intruder",
          targetCountry: "KR",
          targetLanguage: "ko",
          seedKeywords: ["x"],
          includeTerms: [],
          excludeTerms: [],
        }),
      ),
    ).rejects.toThrow();
  });

  it("Viewer는 읽을 수 있지만 쓸 수 없다", async () => {
    const rows = await withUserSession(appUrl as string, viewer, (db) =>
      listNiches(db, aliceWorkspace),
    );
    expect(rows.length).toBeGreaterThan(0);

    await expect(
      withUserSession(appUrl as string, viewer, (db) =>
        insertNiche(db, {
          workspaceId: aliceWorkspace,
          createdBy: viewer,
          slug: "viewer-niche",
          name: "Viewer Niche",
          targetCountry: "KR",
          targetLanguage: "ko",
          seedKeywords: ["x"],
          includeTerms: [],
          excludeTerms: [],
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("Idempotency", () => {
  it("같은 키로 두 번 호출해도 Run이 하나만 생긴다", async () => {
    const key = `test-run-${suffix}`;

    // Run 기록은 시스템 쓰기다.
    const first = await (async () =>
      startWorkflowRun(service, {
        workspaceId: aliceWorkspace,
        workflowType: "niche.collect",
        requestedBy: alice,
        idempotencyKey: key,
        input: {},
      }))();
    const second = await (async () =>
      startWorkflowRun(service, {
        workspaceId: aliceWorkspace,
        workflowType: "niche.collect",
        requestedBy: alice,
        idempotencyKey: key,
        input: {},
      }))();

    expect(second.reused).toBe(true);
    expect(second.runId).toBe(first.runId);

    const rows = (await service.execute<{ count: string }>(
      sql`select count(*)::text as count from workflow_runs where workspace_id = ${aliceWorkspace} and idempotency_key = ${key}`,
    )) as unknown as { count: string }[];
    expect(Number(rows[0]?.count)).toBe(1);
  });
});

describe("수집 → 점수 → 승인 수직 슬라이스", () => {
  it("Mock Provider로 주제와 점수를 만들고 승인까지 이어진다", async () => {
    const now = new Date("2026-09-03T00:00:00Z");
    const niche = await withUserSession(appUrl as string, alice, (db) =>
      insertNiche(db, {
        workspaceId: aliceWorkspace,
        createdBy: alice,
        slug: `slice-${suffix}`,
        name: "Slice Niche",
        targetCountry: "US",
        targetLanguage: "en",
        seedKeywords: ["AI automation", "workflow automation"],
        includeTerms: [],
        excludeTerms: [],
      }),
    );

    // 쿼터 원장은 integrations 행에 누적한다. 없으면 저장할 곳이 없다.
    await service.execute(sql`
      insert into integrations (workspace_id, provider, display_name, status, capabilities, created_by)
      values (${aliceWorkspace}, 'youtube_data', 'YouTube Data (Test)', 'connected', '{"mode":"mock"}'::jsonb, ${alice})
      on conflict (workspace_id, provider, display_name) do nothing
    `);

    const quota = createQuotaLedger({
      db: service,
      limits: { searchCallsLimit: 100, unitsLimit: 10000 },
      now: () => now,
    });
    void createMemoryCache(() => now);

    // 수집은 시스템 작업이므로 Service Role로 실행한다. 권한 검사는 API 계층에서 사용자 세션으로 한다.
    const result = await (async () =>
      collectNicheSignals({
        db: service,
        provider: new MockYouTubeProvider({ seed: 4242, now }),
        quotaLedger: quota,
        workspaceId: aliceWorkspace,
        nicheId: niche.id,
        userId: alice,
        idempotencyKey: `slice-collect-${suffix}`,
        request: {
          providers: ["youtube_data", "google_ads"],
          lookbackDays: 30,
          maxVideosPerKeyword: 20,
          forceRefresh: false,
          maxTopics: 8,
        },
        velocityReferencePerHour: 2000,
        now,
      }))();

    expect(result.videosCollected).toBeGreaterThan(0);
    expect(result.topicsCreated).toBeGreaterThan(0);
    expect(result.skippedProviders.map((entry) => entry.provider)).toContain("google_ads");

    // 사용량은 Provider 메모리가 아니라 DB에 남아야 재시작 후에도 유지된다.
    expect(result.quota.searchCallsUsed).toBe(niche.seedKeywords.length);
    const persisted = await quota.read(aliceWorkspace);
    expect(persisted.searchCallsUsed).toBe(result.quota.searchCallsUsed);
    expect(persisted.unitsUsed).toBe(result.quota.unitsUsed);
    expect(persisted.unitsUsed).toBeGreaterThan(0);

    const topics = await withUserSession(appUrl as string, alice, (db) =>
      listTopics(db, aliceWorkspace, topicListQuerySchema.parse({ nicheId: niche.id, limit: "50" })),
    );

    expect(topics.length).toBe(result.topicsCreated);
    const first = topics[0];
    expect(first?.opportunityScore).not.toBeNull();
    expect(first?.scoreBreakdown?.missingSignals).toContain("search_interest");
    // 결측 신호가 0점으로 저장되지 않았는지 확인한다.
    const searchSignal = first?.scoreBreakdown?.signals.find(
      (signal) => signal.key === "search_interest",
    );
    expect(searchSignal?.normalizedScore).toBeNull();

    const decided = await withUserSession(appUrl as string, alice, (db) =>
      decideTopic(db, {
        workspaceId: aliceWorkspace,
        topicId: first!.id,
        userId: alice,
        decision: "approved",
        reason: "테스트 승인",
        now: new Date(),
      }),
    );
    expect(decided.changed).toBe(true);

    await expect(
      withUserSession(appUrl as string, alice, (db) =>
        decideTopic(db, {
          workspaceId: aliceWorkspace,
          topicId: first!.id,
          userId: alice,
          decision: "rejected",
          reason: "허용되지 않는 전이",
          now: new Date(),
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });
});
