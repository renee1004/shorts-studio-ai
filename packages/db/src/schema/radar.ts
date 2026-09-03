import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { nicheStatusEnum, topicDecisionEnum } from "./enums";
import { channels, scoreConfigs, workspaces } from "./workspace";

export const niches = pgTable(
  "niches",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: nicheStatusEnum("status").notNull().default("active"),
    targetCountry: char("target_country", { length: 2 }).notNull(),
    targetLanguage: text("target_language").notNull(),
    seedKeywords: text("seed_keywords").array().notNull().default(sql`'{}'`),
    includeTerms: text("include_terms").array().notNull().default(sql`'{}'`),
    excludeTerms: text("exclude_terms").array().notNull().default(sql`'{}'`),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.workspaceId, table.slug, table.targetCountry, table.targetLanguage),
  ],
);

export const nicheMetricSnapshots = pgTable(
  "niche_metric_snapshots",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    nicheId: uuid("niche_id")
      .notNull()
      .references(() => niches.id, { onDelete: "cascade" }),
    scoreConfigId: uuid("score_config_id")
      .notNull()
      .references(() => scoreConfigs.id),
    opportunityScore: numeric("opportunity_score", { precision: 5, scale: 2 }),
    confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }),
    decisionBand: text("decision_band"),
    signalValues: jsonb("signal_values").notNull().default({}),
    scoreBreakdown: jsonb("score_breakdown").notNull().default({}),
    sampleSize: integer("sample_size").notNull().default(0),
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull(),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("niche_metric_latest_idx").on(table.nicheId, table.calculatedAt)],
);

export const topics = pgTable(
  "topics",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    nicheId: uuid("niche_id")
      .notNull()
      .references(() => niches.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    angleHint: text("angle_hint"),
    targetCountry: char("target_country", { length: 2 }).notNull(),
    targetLanguage: text("target_language").notNull(),
    decision: topicDecisionEnum("decision").notNull().default("new"),
    decisionReason: text("decision_reason"),
    decidedBy: uuid("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    discoveredBy: text("discovered_by").notNull(),
    firstDiscoveredAt: timestamp("first_discovered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(
      table.workspaceId,
      table.nicheId,
      table.normalizedTitle,
      table.targetCountry,
      table.targetLanguage,
    ),
    index("topics_queue_idx").on(table.workspaceId, table.decision, table.lastSeenAt),
  ],
);

export const topicSignals = pgTable(
  "topic_signals",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    signalKey: text("signal_key").notNull(),
    provider: text("provider").notNull(),
    rawNumeric: numeric("raw_numeric"),
    rawText: text("raw_text"),
    normalizedScore: numeric("normalized_score", { precision: 5, scale: 2 }),
    signalConfidence: numeric("signal_confidence", { precision: 5, scale: 2 }),
    unit: text("unit"),
    sampleSize: integer("sample_size").notNull().default(0),
    freshnessHours: numeric("freshness_hours", { precision: 10, scale: 2 }),
    rawPayload: jsonb("raw_payload").notNull().default({}),
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("topic_signals_latest_idx").on(table.topicId, table.signalKey, table.collectedAt),
  ],
);

export const topicScoreSnapshots = pgTable(
  "topic_score_snapshots",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    scoreConfigId: uuid("score_config_id")
      .notNull()
      .references(() => scoreConfigs.id),
    opportunityScore: numeric("opportunity_score", { precision: 5, scale: 2 }).notNull(),
    confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }).notNull(),
    decisionBand: text("decision_band").notNull(),
    availableWeight: numeric("available_weight", { precision: 5, scale: 2 }).notNull(),
    scoreBreakdown: jsonb("score_breakdown").notNull(),
    penalties: jsonb("penalties").notNull().default([]),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("topic_scores_latest_idx").on(table.topicId, table.calculatedAt)],
);

export const referenceVideos = pgTable(
  "reference_videos",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id").references(() => channels.id, { onDelete: "set null" }),
    provider: text("provider").notNull().default("youtube"),
    externalVideoId: text("external_video_id").notNull(),
    externalChannelId: text("external_channel_id").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
    viewCount: bigint("view_count", { mode: "number" }),
    likeCount: bigint("like_count", { mode: "number" }),
    commentCount: bigint("comment_count", { mode: "number" }),
    shortCandidate: boolean("short_candidate").notNull().default(false),
    isShort: boolean("is_short"),
    shortClassificationSource: text("short_classification_source"),
    metadata: jsonb("metadata").notNull().default({}),
    firstCollectedAt: timestamp("first_collected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastCollectedAt: timestamp("last_collected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.workspaceId, table.provider, table.externalVideoId)],
);

export const topicReferenceVideos = pgTable(
  "topic_reference_videos",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    referenceVideoId: uuid("reference_video_id")
      .notNull()
      .references(() => referenceVideos.id, { onDelete: "cascade" }),
    relevanceScore: numeric("relevance_score", { precision: 5, scale: 2 }),
    relationType: text("relation_type").notNull().default("discovery"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.topicId, table.referenceVideoId] }),
    index("topic_reference_videos_video_idx").on(table.referenceVideoId, table.topicId),
  ],
);

export const videoMetricSnapshots = pgTable(
  "video_metric_snapshots",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    referenceVideoId: uuid("reference_video_id")
      .notNull()
      .references(() => referenceVideos.id, { onDelete: "cascade" }),
    viewCount: bigint("view_count", { mode: "number" }),
    likeCount: bigint("like_count", { mode: "number" }),
    commentCount: bigint("comment_count", { mode: "number" }),
    viewVelocity: numeric("view_velocity"),
    breakoutRatio: numeric("breakout_ratio"),
    snapshotAgeHours: numeric("snapshot_age_hours"),
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull(),
  },
  (table) => [unique().on(table.referenceVideoId, table.collectedAt)],
);
