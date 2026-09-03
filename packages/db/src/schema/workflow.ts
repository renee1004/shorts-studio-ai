import { sql } from "drizzle-orm";
import {
  char,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { approvalDecisionEnum, runStatusEnum } from "./enums";
import { workspaces } from "./workspace";

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    workflowType: text("workflow_type").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    status: runStatusEnum("status").notNull().default("queued"),
    idempotencyKey: text("idempotency_key"),
    requestedBy: uuid("requested_by").notNull(),
    input: jsonb("input").notNull().default({}),
    output: jsonb("output").notNull().default({}),
    progress: numeric("progress", { precision: 5, scale: 2 }).notNull().default("0"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("workflow_runs_idempotency_idx")
      .on(table.workspaceId, table.idempotencyKey)
      .where(sql`idempotency_key is not null`),
    index("workflow_runs_queue_idx").on(table.workspaceId, table.status, table.createdAt),
  ],
);

export const workflowSteps = pgTable(
  "workflow_steps",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    workflowRunId: uuid("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    sequenceNo: integer("sequence_no").notNull(),
    stepKey: text("step_key").notNull(),
    provider: text("provider"),
    status: runStatusEnum("status").notNull().default("queued"),
    providerRequestId: text("provider_request_id"),
    attemptCount: integer("attempt_count").notNull().default(0),
    inputSummary: jsonb("input_summary").notNull().default({}),
    outputSummary: jsonb("output_summary").notNull().default({}),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("workflow_steps_run_seq_idx").on(table.workflowRunId, table.sequenceNo)],
);

export const costEvents = pgTable("cost_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  workflowRunId: uuid("workflow_run_id").references(() => workflowRuns.id, {
    onDelete: "set null",
  }),
  provider: text("provider").notNull(),
  service: text("service").notNull(),
  modelName: text("model_name"),
  quantity: numeric("quantity", { precision: 18, scale: 6 }),
  unit: text("unit"),
  estimatedCost: numeric("estimated_cost", { precision: 14, scale: 6 }),
  actualCost: numeric("actual_cost", { precision: 14, scale: 6 }),
  currency: char("currency", { length: 3 }).notNull().default("USD"),
  providerRequestId: text("provider_request_id"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb("metadata").notNull().default({}),
});

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    entityVersion: integer("entity_version"),
    decision: approvalDecisionEnum("decision").notNull(),
    comment: text("comment"),
    decidedBy: uuid("decided_by").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
    snapshotHash: text("snapshot_hash").notNull(),
  },
  (table) => [
    index("approvals_entity_idx").on(
      table.workspaceId,
      table.entityType,
      table.entityId,
      table.decidedAt,
    ),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    beforeState: jsonb("before_state"),
    afterState: jsonb("after_state"),
    requestId: text("request_id"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_entity_idx").on(
      table.workspaceId,
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
  ],
);
