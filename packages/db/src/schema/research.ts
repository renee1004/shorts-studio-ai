import { sql } from "drizzle-orm";
import {
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { researchStatusEnum } from "./enums";
import { referenceVideos, topics } from "./radar";
import { workspaces } from "./workspace";

/** 수집한 원문 출처. 인용은 반드시 이 행을 가리킨다. (스펙 6.3) */
export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  referenceVideoId: uuid("reference_video_id").references(() => referenceVideos.id, {
    onDelete: "set null",
  }),
  sourceType: text("source_type").notNull(),
  provider: text("provider").notNull(),
  canonicalUrl: text("canonical_url"),
  title: text("title"),
  author: text("author"),
  publisher: text("publisher"),
  excerpt: text("excerpt"),
  contentText: text("content_text"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull().defaultNow(),
  qualityScore: numeric("quality_score", { precision: 5, scale: 2 }),
  rightsStatus: text("rights_status").notNull().default("reference_only"),
  contentHash: text("content_hash"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const topicSources = pgTable(
  "topic_sources",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    relevanceScore: numeric("relevance_score", { precision: 5, scale: 2 }),
    relationReason: text("relation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.topicId, table.sourceId] })],
);

export const researchBriefs = pgTable("research_briefs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  topicId: uuid("topic_id")
    .notNull()
    .references(() => topics.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  status: researchStatusEnum("status").notNull().default("draft"),
  executiveSummary: text("executive_summary"),
  keyFacts: jsonb("key_facts").notNull().default([]),
  audienceInsights: jsonb("audience_insights").notNull().default([]),
  angles: jsonb("angles").notNull().default([]),
  counterpoints: jsonb("counterpoints").notNull().default([]),
  unknowns: jsonb("unknowns").notNull().default([]),
  citations: jsonb("citations").notNull().default([]),
  citationCoverage: numeric("citation_coverage", { precision: 5, scale: 2 }),
  modelName: text("model_name"),
  promptVersion: text("prompt_version").notNull(),
  inputHash: text("input_hash").notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  approvedBy: uuid("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
});
