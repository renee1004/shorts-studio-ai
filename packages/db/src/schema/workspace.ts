import {
  boolean,
  char,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { integrationStatusEnum, memberRoleEnum } from "./enums";

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerUserId: uuid("owner_user_id").notNull(),
  timezone: text("timezone").notNull().default("Asia/Seoul"),
  defaultLocale: text("default_locale").notNull().default("ko-KR"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    role: memberRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.userId] })],
);

export const workspaceSettings = pgTable("workspace_settings", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  targetCountries: text("target_countries").array().notNull().default(sql`array['KR']`),
  contentLanguages: text("content_languages").array().notNull().default(sql`array['ko']`),
  defaultCurrency: char("default_currency", { length: 3 }).notNull().default("USD"),
  dailyAiBudget: numeric("daily_ai_budget", { precision: 12, scale: 4 }),
  monthlyAiBudget: numeric("monthly_ai_budget", { precision: 12, scale: 4 }),
  featureFlags: jsonb("feature_flags").notNull().default({}),
  providerLimits: jsonb("provider_limits").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    displayName: text("display_name").notNull(),
    status: integrationStatusEnum("status").notNull().default("disconnected"),
    externalAccountId: text("external_account_id"),
    secretRef: text("secret_ref"),
    scopes: text("scopes").array().notNull().default(sql`'{}'`),
    capabilities: jsonb("capabilities").notNull().default({}),
    quotaSnapshot: jsonb("quota_snapshot").notNull().default({}),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.workspaceId, table.provider, table.displayName)],
);

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    integrationId: uuid("integration_id").references(() => integrations.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull().default("youtube"),
    externalChannelId: text("external_channel_id").notNull(),
    channelKind: text("channel_kind").notNull(),
    title: text("title").notNull(),
    handle: text("handle"),
    countryCode: char("country_code", { length: 2 }),
    defaultLanguage: text("default_language"),
    thumbnailUrl: text("thumbnail_url"),
    subscriberCount: integer("subscriber_count"),
    videoCount: integer("video_count"),
    metadata: jsonb("metadata").notNull().default({}),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.workspaceId, table.provider, table.externalChannelId)],
);

export const scoreConfigs = pgTable(
  "score_configs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    weights: jsonb("weights").notNull(),
    thresholds: jsonb("thresholds").notNull(),
    active: boolean("active").notNull().default(false),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.workspaceId, table.version),
    uniqueIndex("score_configs_one_active_idx")
      .on(table.workspaceId)
      .where(sql`active = true`),
  ],
);
