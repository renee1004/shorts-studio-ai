import { sql } from "drizzle-orm";
import { MockYouTubeProvider } from "@shorts-os/providers";
import { createMemoryCache, createQuotaLedger, insertNiche, type Database } from "@shorts-os/db";
import { collectNicheSignals } from "./collect-niche";

/** Demo 계정은 고정 UUID를 쓴다. 시드를 다시 돌려도 같은 워크스페이스에 붙는다. */
export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";
export const DEMO_USER_EMAIL = "demo@shorts-os.local";
export const DEMO_WORKSPACE_SLUG = "demo-studio";

/** 시드 시각을 고정해 Snapshot과 점수가 매번 같게 만든다. (스펙 6.5) */
const SEED_NOW = new Date("2026-09-03T00:00:00Z");

const demoNiches = [
  {
    slug: "ai-automation",
    name: "AI Automation",
    description: "업무 자동화와 AI 도구",
    targetCountry: "US",
    targetLanguage: "en",
    seedKeywords: ["AI automation", "workflow automation", "AI agents"],
    excludeTerms: [] as string[],
    maxVideosPerKeyword: 25,
  },
  {
    slug: "career-ai",
    name: "Career AI",
    description: "AI 시대의 커리어 전환",
    targetCountry: "US",
    targetLanguage: "en",
    seedKeywords: ["AI career change", "resume AI"],
    excludeTerms: ["get rich quick"],
    maxVideosPerKeyword: 12,
  },
  {
    // 표본을 일부러 적게 줘서 낮은 Confidence 사례를 만든다.
    slug: "productivity",
    name: "Productivity",
    description: "생산성 루틴과 도구",
    targetCountry: "KR",
    targetLanguage: "ko",
    seedKeywords: ["시간관리"],
    excludeTerms: [] as string[],
    maxVideosPerKeyword: 6,
  },
];

export type SeedResult = {
  workspaceId: string;
  userId: string;
  niches: { id: string; name: string; topicsCreated: number; videos: number; reused: boolean }[];
};

/**
 * 외부 Key 없이 Demo Mode를 채운다.
 * 숫자를 직접 써넣지 않고 실제 수집·점수 코드를 그대로 통과시킨다.
 */
export async function seedDemoWorkspace(db: Database): Promise<SeedResult> {
  await db.execute(sql`select set_config('app.current_user_id', ${DEMO_USER_ID}, false)`);

  const existing = await db.execute<{ id: string }>(
    sql`select id from workspaces where slug = ${DEMO_WORKSPACE_SLUG} limit 1`,
  );
  const existingRows = existing as unknown as { id: string }[];

  let workspaceId = existingRows[0]?.id;

  if (!workspaceId) {
    const created = await db.execute<{ create_workspace_with_owner: string }>(sql`
      select create_workspace_with_owner('Demo Studio', ${DEMO_WORKSPACE_SLUG}, 'Asia/Seoul', 'ko-KR')
    `);
    const createdRows = created as unknown as { create_workspace_with_owner: string }[];
    workspaceId = createdRows[0]?.create_workspace_with_owner;
  }

  if (!workspaceId) throw new Error("Demo 워크스페이스를 만들지 못했습니다.");

  // 쿼터 회계가 붙을 자리를 만들어 둔다. Demo에서는 Mock Provider가 채운다.
  await db.execute(sql`
    insert into integrations (workspace_id, provider, display_name, status, capabilities, created_by)
    values (
      ${workspaceId}, 'youtube_data', 'YouTube Data (Demo)', 'connected',
      '{"mode":"mock"}'::jsonb, ${DEMO_USER_ID}
    )
    on conflict (workspace_id, provider, display_name) do nothing
  `);

  const quota = createQuotaLedger({
    db,
    limits: { searchCallsLimit: 100, unitsLimit: 10000 },
    now: () => SEED_NOW,
  });
  const cache = createMemoryCache(() => SEED_NOW);
  const result: SeedResult["niches"] = [];

  for (const definition of demoNiches) {
    const existingNiche = await db.execute<{ id: string }>(sql`
      select id from niches
      where workspace_id = ${workspaceId} and slug = ${definition.slug}
      limit 1
    `);
    const existingNicheRows = existingNiche as unknown as { id: string }[];

    let nicheId = existingNicheRows[0]?.id;
    if (!nicheId) {
      const created = await insertNiche(db, {
        workspaceId,
        createdBy: DEMO_USER_ID,
        slug: definition.slug,
        name: definition.name,
        description: definition.description,
        targetCountry: definition.targetCountry,
        targetLanguage: definition.targetLanguage,
        seedKeywords: definition.seedKeywords,
        includeTerms: [],
        excludeTerms: definition.excludeTerms,
      });
      nicheId = created.id;
    }

    const provider = new MockYouTubeProvider({ seed: 20260903, now: SEED_NOW });
    void cache;

    const collected = await collectNicheSignals({
      db,
      provider,
      quotaLedger: quota,
      workspaceId,
      nicheId,
      userId: DEMO_USER_ID,
      idempotencyKey: `seed-${definition.slug}-${SEED_NOW.toISOString().slice(0, 10)}`,
      request: {
        providers: ["youtube_data", "google_trends"],
        lookbackDays: 45,
        maxVideosPerKeyword: definition.maxVideosPerKeyword,
        forceRefresh: false,
        maxTopics: 8,
      },
      velocityReferencePerHour: 2000,
      now: SEED_NOW,
    });

    result.push({
      id: nicheId,
      name: definition.name,
      topicsCreated: collected.topicsCreated,
      videos: collected.videosCollected,
      reused: collected.reused,
    });
  }

  return { workspaceId, userId: DEMO_USER_ID, niches: result };
}
