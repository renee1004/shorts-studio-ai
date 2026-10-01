import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { projectStatusEnum, qaResultEnum } from "./enums";
import { referenceVideos, topics } from "./radar";
import { researchBriefs, sources } from "./research";
import { workspaces } from "./workspace";

export const dnaPatterns = pgTable("dna_patterns", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  nicheId: uuid("niche_id"),
  referenceVideoId: uuid("reference_video_id").references(() => referenceVideos.id, {
    onDelete: "set null",
  }),
  patternType: text("pattern_type").notNull(),
  name: text("name").notNull(),
  abstractionLevel: text("abstraction_level").notNull().default("structural"),
  structuredPattern: jsonb("structured_pattern").notNull(),
  evidence: jsonb("evidence").notNull().default([]),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }),
  safeToReuse: boolean("safe_to_reuse").notNull().default(true),
  modelName: text("model_name"),
  promptVersion: text("prompt_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contentProjects = pgTable("content_projects", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  topicId: uuid("topic_id")
    .notNull()
    .references(() => topics.id),
  researchBriefId: uuid("research_brief_id").references(() => researchBriefs.id),
  channelId: uuid("channel_id"),
  brandProfileId: uuid("brand_profile_id"),
  title: text("title").notNull(),
  targetLanguage: text("target_language").notNull(),
  targetDurationSeconds: integer("target_duration_seconds").notNull(),
  status: projectStatusEnum("status").notNull().default("draft"),
  ownerUserId: uuid("owner_user_id").notNull(),
  selectedAngleId: uuid("selected_angle_id"),
  creationInputHash: text("creation_input_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contentAngles = pgTable(
  "content_angles",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contentProjectId: uuid("content_project_id")
      .notNull()
      .references(() => contentProjects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    hook: text("hook").notNull(),
    promise: text("promise").notNull(),
    outline: jsonb("outline").notNull(),
    noveltyRationale: text("novelty_rationale"),
    scoreBreakdown: jsonb("score_breakdown").notNull().default({}),
    selected: boolean("selected").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.contentProjectId, table.version, table.title)],
);

export const scripts = pgTable(
  "scripts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contentProjectId: uuid("content_project_id")
      .notNull()
      .references(() => contentProjects.id, { onDelete: "cascade" }),
    contentAngleId: uuid("content_angle_id").references(() => contentAngles.id, {
      onDelete: "set null",
    }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    hook: text("hook").notNull(),
    scriptText: text("script_text").notNull(),
    structuredScript: jsonb("structured_script").notNull(),
    wordCount: integer("word_count").notNull(),
    estimatedDurationSeconds: numeric("estimated_duration_seconds", {
      precision: 7,
      scale: 2,
    }).notNull(),
    factualClaims: jsonb("factual_claims").notNull().default([]),
    originalitySummary: jsonb("originality_summary").notNull().default({}),
    modelName: text("model_name"),
    promptVersion: text("prompt_version").notNull(),
    inputHash: text("input_hash").notNull(),
    status: text("status").notNull().default("draft"),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.contentProjectId, table.version)],
);

export const scriptCitations = pgTable(
  "script_citations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    scriptId: uuid("script_id")
      .notNull()
      .references(() => scripts.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    claimKey: text("claim_key").notNull(),
    quoteExcerpt: text("quote_excerpt"),
    supportLevel: text("support_level").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.scriptId, table.sourceId, table.claimKey)],
);

export const shots = pgTable(
  "shots",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    scriptId: uuid("script_id")
      .notNull()
      .references(() => scripts.id, { onDelete: "cascade" }),
    sequenceNo: integer("sequence_no").notNull(),
    startSeconds: numeric("start_seconds", { precision: 7, scale: 2 }).notNull(),
    endSeconds: numeric("end_seconds", { precision: 7, scale: 2 }).notNull(),
    narration: text("narration"),
    onScreenText: text("on_screen_text"),
    visualDescription: text("visual_description").notNull(),
    cameraDirection: text("camera_direction"),
    generationPrompt: text("generation_prompt"),
    negativePrompt: text("negative_prompt"),
    assetStrategy: text("asset_strategy").notNull(),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.scriptId, table.sequenceNo)],
);

export const qaReviews = pgTable("qa_reviews", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  contentProjectId: uuid("content_project_id")
    .notNull()
    .references(() => contentProjects.id, { onDelete: "cascade" }),
  scriptId: uuid("script_id").references(() => scripts.id, { onDelete: "cascade" }),
  renderJobId: uuid("render_job_id"),
  checkType: text("check_type").notNull(),
  result: qaResultEnum("result").notNull(),
  score: numeric("score", { precision: 5, scale: 2 }),
  severity: text("severity").notNull().default("info"),
  findings: jsonb("findings").notNull().default([]),
  modelName: text("model_name"),
  ruleVersion: text("rule_version").notNull(),
  inputHash: text("input_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
