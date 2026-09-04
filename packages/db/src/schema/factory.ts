import { sql } from "drizzle-orm";
import {
  bigint,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { assetTypeEnum, runStatusEnum } from "./enums";
import { contentProjects, shots } from "./studio";
import { workflowRuns } from "./workflow";
import { workspaces } from "./workspace";

export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  contentProjectId: uuid("content_project_id")
    .notNull()
    .references(() => contentProjects.id, { onDelete: "cascade" }),
  shotId: uuid("shot_id").references(() => shots.id, { onDelete: "set null" }),
  assetType: assetTypeEnum("asset_type").notNull(),
  provider: text("provider").notNull(),
  providerOperationId: text("provider_operation_id"),
  storageUri: text("storage_uri"),
  previewUri: text("preview_uri"),
  mimeType: text("mime_type"),
  byteSize: bigint("byte_size", { mode: "number" }),
  checksumSha256: text("checksum_sha256"),
  promptText: text("prompt_text"),
  generationParameters: jsonb("generation_parameters").notNull().default({}),
  rightsMetadata: jsonb("rights_metadata").notNull().default({}),
  status: runStatusEnum("status").notNull().default("queued"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const renderJobs = pgTable(
  "render_jobs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contentProjectId: uuid("content_project_id")
      .notNull()
      .references(() => contentProjects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: runStatusEnum("status").notNull().default("queued"),
    renderManifest: jsonb("render_manifest").notNull(),
    outputAssetId: uuid("output_asset_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    outputChecksumSha256: text("output_checksum_sha256"),
    durationSeconds: numeric("duration_seconds", { precision: 7, scale: 2 }),
    width: integer("width"),
    height: integer("height"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    workflowRunId: uuid("workflow_run_id").references(() => workflowRuns.id, {
      onDelete: "set null",
    }),
    commandHash: text("command_hash"),
    loudnessLufs: numeric("loudness_lufs", { precision: 6, scale: 2 }),
    probe: jsonb("probe").notNull().default({}),
  },
  (table) => [
    unique().on(table.contentProjectId, table.version),
    uniqueIndex("render_jobs_command_hash_idx")
      .on(table.workspaceId, table.commandHash)
      .where(
        sql`command_hash is not null and status in ('queued', 'running', 'waiting', 'succeeded')`,
      ),
  ],
);
