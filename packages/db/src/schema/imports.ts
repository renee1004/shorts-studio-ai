import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspace";

export const notebookImports = pgTable(
  "notebook_imports",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    importedBy: uuid("imported_by").notNull(),
    notebookId: text("notebook_id").notNull(),
    itemId: text("item_id").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    originalText: text("original_text").notNull(),
    contentHash: text("content_hash").notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("notebook_imports_revision_idx").on(
      table.workspaceId,
      table.importedBy,
      table.notebookId,
      table.itemId,
      table.kind,
      table.contentHash,
    ),
  ],
);
