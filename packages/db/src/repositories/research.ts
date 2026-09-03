import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Citation, ResearchBriefContent } from "@shorts-os/contracts";
import { DomainError } from "@shorts-os/domain";
import type { Database } from "../client";
import { researchBriefs, sources, topicSources } from "../schema";

export type ResearchBriefRow = typeof researchBriefs.$inferSelect;

export type StoredBrief = {
  id: string;
  topicId: string;
  version: number;
  status: string;
  content: ResearchBriefContent;
  citationCoverage: number | null;
  modelName: string | null;
  promptVersion: string;
  inputHash: string;
  createdAt: Date;
};

function toContent(row: ResearchBriefRow): ResearchBriefContent {
  return {
    executiveSummary: row.executiveSummary ?? "",
    keyFacts: (row.keyFacts ?? []) as ResearchBriefContent["keyFacts"],
    audienceInsights: (row.audienceInsights ?? []) as string[],
    angles: (row.angles ?? []) as ResearchBriefContent["angles"],
    counterpoints: (row.counterpoints ?? []) as string[],
    unknowns: (row.unknowns ?? []) as string[],
    citations: (row.citations ?? []) as Citation[],
  };
}

function toStored(row: ResearchBriefRow): StoredBrief {
  return {
    id: row.id,
    topicId: row.topicId,
    version: row.version,
    status: row.status,
    content: toContent(row),
    citationCoverage: row.citationCoverage === null ? null : Number(row.citationCoverage),
    modelName: row.modelName,
    promptVersion: row.promptVersion,
    inputHash: row.inputHash,
    createdAt: row.createdAt,
  };
}

/** 같은 Topic의 Brief는 덮어쓰지 않고 version을 올려 쌓는다. (스펙 6.3 unique(topic_id, version)) */
export async function insertResearchBrief(
  db: Database,
  input: {
    workspaceId: string;
    topicId: string;
    createdBy: string;
    content: ResearchBriefContent;
    citationCoverage: number | null;
    modelName: string;
    promptVersion: string;
    inputHash: string;
    status: "draft" | "ready" | "needs_review";
  },
): Promise<StoredBrief> {
  const previous = await db
    .select({ version: researchBriefs.version })
    .from(researchBriefs)
    .where(
      and(
        eq(researchBriefs.workspaceId, input.workspaceId),
        eq(researchBriefs.topicId, input.topicId),
      ),
    )
    .orderBy(desc(researchBriefs.version))
    .limit(1);

  const version = (previous[0]?.version ?? 0) + 1;

  const rows = await db
    .insert(researchBriefs)
    .values({
      workspaceId: input.workspaceId,
      topicId: input.topicId,
      version,
      status: input.status,
      executiveSummary: input.content.executiveSummary,
      keyFacts: input.content.keyFacts,
      audienceInsights: input.content.audienceInsights,
      angles: input.content.angles,
      counterpoints: input.content.counterpoints,
      unknowns: input.content.unknowns,
      citations: input.content.citations,
      citationCoverage:
        input.citationCoverage === null ? null : input.citationCoverage.toFixed(2),
      modelName: input.modelName,
      promptVersion: input.promptVersion,
      inputHash: input.inputHash,
      createdBy: input.createdBy,
    })
    .returning();

  const row = rows[0];
  if (!row) throw new DomainError("INTERNAL_ERROR", "Research Brief를 저장하지 못했습니다.");
  return toStored(row);
}

export async function getLatestResearchBrief(
  db: Database,
  workspaceId: string,
  topicId: string,
): Promise<StoredBrief | null> {
  const rows = await db
    .select()
    .from(researchBriefs)
    .where(and(eq(researchBriefs.workspaceId, workspaceId), eq(researchBriefs.topicId, topicId)))
    .orderBy(desc(researchBriefs.version))
    .limit(1);

  const row = rows[0];
  return row ? toStored(row) : null;
}

export async function listResearchBriefVersions(
  db: Database,
  workspaceId: string,
  topicId: string,
): Promise<StoredBrief[]> {
  const rows = await db
    .select()
    .from(researchBriefs)
    .where(and(eq(researchBriefs.workspaceId, workspaceId), eq(researchBriefs.topicId, topicId)))
    .orderBy(desc(researchBriefs.version));

  return rows.map(toStored);
}

export type ResearchOverviewRow = {
  topicId: string;
  topicTitle: string;
  nicheName: string;
  decision: string;
  brief: StoredBrief | null;
  versionCount: number;
};

/**
 * Research 화면용 목록. 승인된 Topic이 먼저 온다.
 * Brief가 없는 Topic도 보여야 무엇을 생성할지 고를 수 있다.
 */
export async function listResearchOverview(
  db: Database,
  workspaceId: string,
  limit = 50,
): Promise<ResearchOverviewRow[]> {
  const topicRows = await db.execute<{
    id: string;
    title: string;
    niche_name: string;
    decision: string;
  }>(sql`
    select t.id, t.title, n.name as niche_name, t.decision::text as decision
    from topics t
    join niches n on n.id = t.niche_id
    where t.workspace_id = ${workspaceId}
    order by
      case t.decision when 'approved' then 0 when 'watch' then 1 when 'new' then 2 else 3 end,
      t.created_at desc
    limit ${limit}
  `);

  const rows = topicRows as unknown as {
    id: string;
    title: string;
    niche_name: string;
    decision: string;
  }[];
  if (rows.length === 0) return [];

  const briefs = await db
    .select()
    .from(researchBriefs)
    .where(
      and(
        eq(researchBriefs.workspaceId, workspaceId),
        inArray(
          researchBriefs.topicId,
          rows.map((row) => row.id),
        ),
      ),
    )
    .orderBy(desc(researchBriefs.version));

  const latest = new Map<string, ResearchBriefRow>();
  const counts = new Map<string, number>();
  for (const brief of briefs) {
    if (!latest.has(brief.topicId)) latest.set(brief.topicId, brief);
    counts.set(brief.topicId, (counts.get(brief.topicId) ?? 0) + 1);
  }

  return rows.map((row) => {
    const brief = latest.get(row.id);
    return {
      topicId: row.id,
      topicTitle: row.title,
      nicheName: row.niche_name,
      decision: row.decision,
      brief: brief ? toStored(brief) : null,
      versionCount: counts.get(row.id) ?? 0,
    };
  });
}

/**
 * 인용을 sources 행으로 남긴다. 같은 URL은 워크스페이스에서 한 행만 유지한다.
 * rights_status는 reference_only로 둔다. 원문을 재사용할 권리를 주장하지 않는다.
 */
export async function upsertCitationSources(
  db: Database,
  input: { workspaceId: string; topicId: string; citations: Citation[] },
): Promise<{ linked: number }> {
  if (input.citations.length === 0) return { linked: 0 };

  let linked = 0;

  for (const citation of input.citations) {
    const inserted = await db
      .insert(sources)
      .values({
        workspaceId: input.workspaceId,
        sourceType: "web",
        provider: "gemini_search_grounding",
        canonicalUrl: citation.url,
        title: citation.title,
        publisher: citation.publisher,
        publishedAt: citation.publishedAt ? new Date(citation.publishedAt) : null,
        rightsStatus: "reference_only",
      })
      .onConflictDoNothing()
      .returning({ id: sources.id });

    let sourceId = inserted[0]?.id;
    if (!sourceId) {
      const existing = await db
        .select({ id: sources.id })
        .from(sources)
        .where(
          and(eq(sources.workspaceId, input.workspaceId), eq(sources.canonicalUrl, citation.url)),
        )
        .limit(1);
      sourceId = existing[0]?.id;
    }
    if (!sourceId) continue;

    await db
      .insert(topicSources)
      .values({
        workspaceId: input.workspaceId,
        topicId: input.topicId,
        sourceId,
        relationReason: "research_citation",
      })
      .onConflictDoNothing();

    linked += 1;
  }

  return { linked };
}

export async function getTopicForResearch(
  db: Database,
  workspaceId: string,
  topicId: string,
): Promise<{ id: string; title: string; angleHint: string | null; nicheName: string } | null> {
  const rows = await db.execute<{
    id: string;
    title: string;
    angle_hint: string | null;
    niche_name: string;
  }>(sql`
    select t.id, t.title, t.angle_hint, n.name as niche_name
    from topics t
    join niches n on n.id = t.niche_id
    where t.workspace_id = ${workspaceId} and t.id = ${topicId}
    limit 1
  `);

  const row = (rows as unknown as {
    id: string;
    title: string;
    angle_hint: string | null;
    niche_name: string;
  }[])[0];

  return row
    ? { id: row.id, title: row.title, angleHint: row.angle_hint, nicheName: row.niche_name }
    : null;
}
