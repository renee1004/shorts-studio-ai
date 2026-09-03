import { pgEnum } from "drizzle-orm/pg-core";

export const memberRoleEnum = pgEnum("member_role", [
  "owner",
  "operator",
  "reviewer",
  "viewer",
]);

export const integrationStatusEnum = pgEnum("integration_status", [
  "disconnected",
  "pending",
  "connected",
  "degraded",
  "error",
  "revoked",
]);

export const nicheStatusEnum = pgEnum("niche_status", ["active", "paused", "archived"]);

export const topicDecisionEnum = pgEnum("topic_decision", [
  "new",
  "watch",
  "approved",
  "rejected",
  "archived",
]);

export const runStatusEnum = pgEnum("run_status", [
  "queued",
  "running",
  "waiting",
  "succeeded",
  "failed",
  "cancelled",
]);

export const approvalDecisionEnum = pgEnum("approval_decision", [
  "approved",
  "rejected",
  "changes_requested",
]);
