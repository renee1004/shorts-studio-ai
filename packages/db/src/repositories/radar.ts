import { and, asc, desc, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import type { ScoreResult, TopicDecision, TopicListQuery } from "@shorts-os/contracts";
import { canTransitionTopic } from "@shorts-os/contracts";
import { DomainError, type NormalizedVideo } from "@shorts-os/domain";
import type { Database } from "../client";
import {
  nicheMetricSnapshots,
  niches,
  referenceVideos,
  topicReferenceVideos,
  topicScoreSnapshots,
  topicSignals,
  topics,
  videoMetricSnapshots,
} from "../schema";

export type NicheRow = typeof niches.$inferSelect;

export async function listNiches(db: Database, workspaceId: string) {
  const rows = await db
    .select()
    .from(niches)
    .where(eq(niches.workspaceId, workspaceId))
    .orderBy(asc(niches.createdAt));

  if (rows.length === 0) return [];

  const snapshots = await db
    .select()
    .from(nicheMetricSnapshots)
    .where(
      and(
        eq(nicheMetricSnapshots.workspaceId, workspaceId),
        inArray(
          nicheMetricSnapshots.nicheId,
          rows.map((row) => row.id),
        ),
      ),
    )
    .orderBy(desc(nicheMetricSnapshots.calculatedAt));

  const latest = new Map<string, (typeof snapshots)[number]>();
  const history = new Map<string, (typeof snapshots)[number][]>();
  for (const snapshot of snapshots) {
    if (!latest.has(snapshot.nicheId)) latest.set(snapshot.nicheId, snapshot);
    const bucket = history.get(snapshot.nicheId) ?? [];
    bucket.push(snapshot);
    history.set(snapshot.nicheId, bucket);
  }

  return rows.map((niche) => ({
    niche,
    latest: latest.get(niche.id) ?? null,
    history: (history.get(niche.id) ?? []).slice(0, 30),
  }));
}

export async function getNiche(db: Database, workspaceId: string, nicheId: string) {
  const rows = await db
    .select()
    .from(niches)
    .where(and(eq(niches.workspaceId, workspaceId), eq(niches.id, nicheId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertNiche(
  db: Database,
  input: {
    workspaceId: string;
    createdBy: string;
    slug: string;
    name: string;
    description?: string | undefined;
    targetCountry: string;
    targetLanguage: string;
    seedKeywords: string[];
    includeTerms: string[];
    excludeTerms: string[];
  },
) {
  const rows = await db
    .insert(niches)
    .values({
      workspaceId: input.workspaceId,
      createdBy: input.createdBy,
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      targetCountry: input.targetCountry,
      targetLanguage: input.targetLanguage,
      seedKeywords: input.seedKeywords,
      includeTerms: input.includeTerms,
      excludeTerms: input.excludeTerms,
    })
    .returning();

  const created = rows[0];
  if (!created) throw new DomainError("INTERNAL_ERROR", "Niche 생성에 실패했습니다.");
  return created;
}

export async function upsertReferenceVideos(
  db: Database,
  workspaceId: string,
  videos: NormalizedVideo[],
  options: { now: Date },
): Promise<Map<string, string>> {
  if (videos.length === 0) return new Map();

  const rows = await db
    .insert(referenceVideos)
    .values(
      videos.map((video) => ({
        workspaceId,
        provider: "youtube",
        externalVideoId: video.externalVideoId,
        externalChannelId: video.externalChannelId,
        url: video.url,
        title: video.title,
        description: video.description,
        publishedAt: video.publishedAt,
        durationSeconds: video.durationSeconds,
        viewCount: video.viewCount,
        likeCount: video.likeCount,
        commentCount: video.commentCount,
        shortCandidate: video.durationSeconds !== null && video.durationSeconds <= 180,
        // 공개 API만으로는 확정할 수 없으므로 null을 유지한다. (스펙 5.5)
        isShort: null,
        metadata: { channelTitle: video.channelTitle },
        lastCollectedAt: options.now,
      })),
    )
    .onConflictDoUpdate({
      target: [
        referenceVideos.workspaceId,
        referenceVideos.provider,
        referenceVideos.externalVideoId,
      ],
      set: {
        title: sql`excluded.title`,
        viewCount: sql`excluded.view_count`,
        likeCount: sql`excluded.like_count`,
        commentCount: sql`excluded.comment_count`,
        durationSeconds: sql`excluded.duration_seconds`,
        lastCollectedAt: sql`excluded.last_collected_at`,
      },
    })
    .returning({ id: referenceVideos.id, externalVideoId: referenceVideos.externalVideoId });

  return new Map(rows.map((row) => [row.externalVideoId, row.id]));
}

export async function insertNicheMetricSnapshot(
  db: Database,
  input: {
    workspaceId: string;
    nicheId: string;
    scoreConfigId: string;
    score: ScoreResult;
    sampleSize: number;
    collectedAt: Date;
  },
) {
  await db.insert(nicheMetricSnapshots).values({
    workspaceId: input.workspaceId,
    nicheId: input.nicheId,
    scoreConfigId: input.scoreConfigId,
    opportunityScore: String(input.score.score),
    confidenceScore: String(input.score.confidence),
    decisionBand: input.score.decision,
    signalValues: Object.fromEntries(
      input.score.signals.map((signal) => [signal.key, signal.normalizedScore]),
    ),
    scoreBreakdown: input.score,
    sampleSize: input.sampleSize,
    collectedAt: input.collectedAt,
  });
}

export async function insertVideoMetricSnapshots(
  db: Database,
  workspaceId: string,
  entries: {
    referenceVideoId: string;
    viewCount: number | null;
    likeCount: number | null;
    commentCount: number | null;
    viewVelocity: number | null;
    breakoutRatio: number | null;
    snapshotAgeHours: number | null;
    collectedAt: Date;
  }[],
) {
  if (entries.length === 0) return;
  await db
    .insert(videoMetricSnapshots)
    .values(
      entries.map((entry) => ({
        workspaceId,
        referenceVideoId: entry.referenceVideoId,
        viewCount: entry.viewCount,
        likeCount: entry.likeCount,
        commentCount: entry.commentCount,
        viewVelocity: entry.viewVelocity === null ? null : String(entry.viewVelocity),
        breakoutRatio: entry.breakoutRatio === null ? null : String(entry.breakoutRatio),
        snapshotAgeHours: entry.snapshotAgeHours === null ? null : String(entry.snapshotAgeHours),
        collectedAt: entry.collectedAt,
      })),
    )
    .onConflictDoNothing();
}

export type TopicUpsert = {
  nicheId: string;
  title: string;
  normalizedTitle: string;
  angleHint: string;
  targetCountry: string;
  targetLanguage: string;
  discoveredBy: string;
  score: ScoreResult;
  scoreConfigId: string;
  videoIds: string[];
  collectedAt: Date;
};

export async function upsertTopicWithScore(
  db: Database,
  workspaceId: string,
  input: TopicUpsert,
  referenceVideoIdByExternalId: Map<string, string>,
): Promise<{ topicId: string; created: boolean }> {
  const existing = await db
    .select({ id: topics.id })
    .from(topics)
    .where(
      and(
        eq(topics.workspaceId, workspaceId),
        eq(topics.nicheId, input.nicheId),
        eq(topics.normalizedTitle, input.normalizedTitle),
        eq(topics.targetCountry, input.targetCountry),
        eq(topics.targetLanguage, input.targetLanguage),
      ),
    )
    .limit(1);

  let topicId = existing[0]?.id;
  const created = topicId === undefined;

  if (topicId === undefined) {
    const inserted = await db
      .insert(topics)
      .values({
        workspaceId,
        nicheId: input.nicheId,
        title: input.title,
        normalizedTitle: input.normalizedTitle,
        angleHint: input.angleHint,
        targetCountry: input.targetCountry,
        targetLanguage: input.targetLanguage,
        discoveredBy: input.discoveredBy,
        lastSeenAt: input.collectedAt,
      })
      .returning({ id: topics.id });
    topicId = inserted[0]?.id;
  } else {
    await db
      .update(topics)
      .set({ lastSeenAt: input.collectedAt, angleHint: input.angleHint })
      .where(eq(topics.id, topicId));
  }

  if (!topicId) throw new DomainError("INTERNAL_ERROR", "Topic 저장에 실패했습니다.");

  // 신호는 덮어쓰지 않고 매번 새 행으로 쌓는다. (스펙 6.1)
  await db.insert(topicSignals).values(
    input.score.signals.map((signal) => ({
      workspaceId,
      topicId,
      signalKey: signal.key,
      provider: signal.available ? "youtube_data" : "none",
      rawNumeric: signal.rawValue === null ? null : String(signal.rawValue),
      normalizedScore: signal.normalizedScore === null ? null : String(signal.normalizedScore),
      signalConfidence: null,
      unit: signal.key === "youtube_velocity" ? "views_per_hour" : null,
      sampleSize: signal.sourceCount,
      freshnessHours: signal.freshnessHours === null ? null : String(signal.freshnessHours),
      rawPayload: signal.reason ? { reason: signal.reason } : {},
      collectedAt: input.collectedAt,
    })),
  );

  await db.insert(topicScoreSnapshots).values({
    workspaceId,
    topicId,
    scoreConfigId: input.scoreConfigId,
    opportunityScore: String(input.score.score),
    confidenceScore: String(input.score.confidence),
    decisionBand: input.score.decision,
    availableWeight: String(input.score.availableWeight),
    scoreBreakdown: input.score,
    penalties: input.score.penalties,
  });

  const links = input.videoIds
    .map((externalId) => referenceVideoIdByExternalId.get(externalId))
    .filter((id): id is string => id !== undefined)
    .map((referenceVideoId) => ({
      workspaceId,
      topicId: topicId as string,
      referenceVideoId,
      relationType: "discovery",
    }));

  if (links.length > 0) {
    await db.insert(topicReferenceVideos).values(links).onConflictDoNothing();
  }

  return { topicId, created };
}

export type TopicListRow = {
  id: string;
  title: string;
  angleHint: string | null;
  decision: TopicDecision;
  nicheId: string;
  nicheName: string;
  targetCountry: string;
  targetLanguage: string;
  opportunityScore: number | null;
  confidenceScore: number | null;
  decisionBand: string | null;
  scoreBreakdown: ScoreResult | null;
  lastSeenAt: string;
  referenceVideoCount: number;
};

export async function listTopics(
  db: Database,
  workspaceId: string,
  query: TopicListQuery,
): Promise<TopicListRow[]> {
  const latestScore = db.$with("latest_score").as(
    db
      .select({
        topicId: topicScoreSnapshots.topicId,
        opportunityScore: topicScoreSnapshots.opportunityScore,
        confidenceScore: topicScoreSnapshots.confidenceScore,
        decisionBand: topicScoreSnapshots.decisionBand,
        scoreBreakdown: topicScoreSnapshots.scoreBreakdown,
        rowNumber:
          sql<number>`row_number() over (partition by ${topicScoreSnapshots.topicId} order by ${topicScoreSnapshots.calculatedAt} desc)`.as(
            "row_number",
          ),
      })
      .from(topicScoreSnapshots)
      .where(eq(topicScoreSnapshots.workspaceId, workspaceId)),
  );

  const filters: SQL[] = [eq(topics.workspaceId, workspaceId), sql`latest_score.row_number = 1`];
  if (query.nicheId) filters.push(eq(topics.nicheId, query.nicheId));
  if (query.decision) filters.push(eq(topics.decision, query.decision));
  if (query.minScore !== undefined) {
    filters.push(gte(latestScore.opportunityScore, String(query.minScore)));
  }
  if (query.minConfidence !== undefined) {
    filters.push(gte(latestScore.confidenceScore, String(query.minConfidence)));
  }

  const orderBy = (() => {
    switch (query.sort) {
      case "opportunityScore":
        return asc(latestScore.opportunityScore);
      case "-confidenceScore":
        return desc(latestScore.confidenceScore);
      case "-lastSeenAt":
        return desc(topics.lastSeenAt);
      default:
        return desc(latestScore.opportunityScore);
    }
  })();

  const rows = await db
    .with(latestScore)
    .select({
      id: topics.id,
      title: topics.title,
      angleHint: topics.angleHint,
      decision: topics.decision,
      nicheId: topics.nicheId,
      nicheName: niches.name,
      targetCountry: topics.targetCountry,
      targetLanguage: topics.targetLanguage,
      opportunityScore: latestScore.opportunityScore,
      confidenceScore: latestScore.confidenceScore,
      decisionBand: latestScore.decisionBand,
      scoreBreakdown: latestScore.scoreBreakdown,
      lastSeenAt: topics.lastSeenAt,
      referenceVideoCount: sql<number>`(
        select count(*) from topic_reference_videos trv where trv.topic_id = ${topics.id}
      )`,
    })
    .from(topics)
    .innerJoin(niches, eq(niches.id, topics.nicheId))
    .leftJoin(latestScore, eq(latestScore.topicId, topics.id))
    .where(and(...filters))
    .orderBy(orderBy)
    .limit(query.limit);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    angleHint: row.angleHint,
    decision: row.decision as TopicDecision,
    nicheId: row.nicheId,
    nicheName: row.nicheName,
    targetCountry: row.targetCountry,
    targetLanguage: row.targetLanguage,
    opportunityScore: row.opportunityScore === null ? null : Number(row.opportunityScore),
    confidenceScore: row.confidenceScore === null ? null : Number(row.confidenceScore),
    decisionBand: row.decisionBand,
    scoreBreakdown: (row.scoreBreakdown as ScoreResult | null) ?? null,
    lastSeenAt: row.lastSeenAt.toISOString(),
    referenceVideoCount: Number(row.referenceVideoCount),
  }));
}

export async function getTopicDetail(db: Database, workspaceId: string, topicId: string) {
  const topicRows = await db
    .select()
    .from(topics)
    .where(and(eq(topics.workspaceId, workspaceId), eq(topics.id, topicId)))
    .limit(1);
  const topic = topicRows[0];
  if (!topic) return null;

  const [scoreRows, videoRows] = await Promise.all([
    db
      .select()
      .from(topicScoreSnapshots)
      .where(eq(topicScoreSnapshots.topicId, topicId))
      .orderBy(desc(topicScoreSnapshots.calculatedAt))
      .limit(10),
    db
      .select({
        video: referenceVideos,
        relation: topicReferenceVideos.relationType,
      })
      .from(topicReferenceVideos)
      .innerJoin(referenceVideos, eq(referenceVideos.id, topicReferenceVideos.referenceVideoId))
      .where(eq(topicReferenceVideos.topicId, topicId))
      .orderBy(desc(referenceVideos.viewCount))
      .limit(10),
  ]);

  return { topic, scores: scoreRows, videos: videoRows };
}

/** 상태 전이는 Domain이 검증한다. UI가 decision 값을 직접 덮어쓰지 않는다. (스펙 4.5) */
export async function decideTopic(
  db: Database,
  input: {
    workspaceId: string;
    topicId: string;
    userId: string;
    decision: TopicDecision;
    reason: string;
    now: Date;
  },
) {
  const rows = await db
    .select({ id: topics.id, decision: topics.decision })
    .from(topics)
    .where(and(eq(topics.workspaceId, input.workspaceId), eq(topics.id, input.topicId)))
    .limit(1);

  const current = rows[0];
  if (!current) throw new DomainError("NOT_FOUND", "Topic을 찾을 수 없습니다.");

  const from = current.decision as TopicDecision;
  if (from === input.decision) {
    return { topicId: input.topicId, from, to: input.decision, changed: false };
  }
  if (!canTransitionTopic(from, input.decision)) {
    throw new DomainError(
      "INVALID_STATE_TRANSITION",
      `${from} 상태에서 ${input.decision}로 바꿀 수 없습니다.`,
      { details: { from, to: input.decision } },
    );
  }

  await db
    .update(topics)
    .set({
      decision: input.decision,
      decisionReason: input.reason,
      decidedBy: input.userId,
      decidedAt: input.now,
    })
    .where(eq(topics.id, input.topicId));

  return { topicId: input.topicId, from, to: input.decision, changed: true };
}
