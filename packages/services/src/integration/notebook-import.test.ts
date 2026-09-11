import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  closePools,
  serviceDb,
  withUserSession,
  type Database,
} from "@shorts-os/db";
import {
  saveNotebookImport,
  listNotebookImports,
  getNotebookImport,
} from "../notebook-import";

const owner = "00000000-0000-4000-8000-0000000000f1";
const member = "00000000-0000-4000-8000-0000000000f2";
let service: Database;
let workspaceId: string;
const appUrl = process.env.DATABASE_APP_URL ?? process.env.DATABASE_URL;
beforeAll(async () => {
  if (!process.env.DATABASE_URL || !appUrl)
    throw new Error("An isolated test database is required.");
  service = serviceDb(process.env.DATABASE_URL);
  workspaceId = await withUserSession(appUrl, owner, async (db) => {
    const rows = await db.execute<{ id: string }>(
      sql`select create_workspace_with_owner('Notebook import test', ${`notebook-${crypto.randomUUID()}`}, 'Asia/Seoul', 'ko-KR') as id`,
    );
    return rows[0]!.id;
  });
  await service.execute(
    sql`insert into workspace_members (workspace_id, user_id, role) values (${workspaceId}, ${member}, 'operator')`,
  );
});
afterAll(async () => {
  if (workspaceId)
    await service.execute(
      sql`delete from workspaces where id = ${workspaceId}`,
    );
  await closePools();
});
const document = () => ({
  notebookId: crypto.randomUUID(),
  itemId: crypto.randomUUID(),
  kind: "note" as const,
  title: " 원문 제목 ",
  text: ` \r\n# 원문\r\n${"가나다 ".repeat(5000)}\n\n `,
});
const session = <T>(fn: (db: Database) => Promise<T>, userId = owner) =>
  withUserSession(appUrl!, userId, fn);

describe("immutable NotebookLM originals", () => {
  it("preserves long text and whitespace; concurrent duplicate saves reuse one revision", async () => {
    const input = document();
    const results = await Promise.all(
      [1, 2].map(() =>
        session((db) => saveNotebookImport(db, workspaceId, owner, input)),
      ),
    );
    expect(results[0]!.document.id).toBe(results[1]!.document.id);
    expect(results.filter((r) => r.reused)).toHaveLength(1);
    expect(results[0]!.document.originalText).toBe(input.text);
    expect(results[0]!.document.title).toBe(input.title);
    const next = await session((db) =>
      saveNotebookImport(db, workspaceId, owner, {
        ...input,
        text: input.text + "수정",
      }),
    );
    expect(next.document.id).not.toBe(results[0]!.document.id);
    expect(
      (
        await session((db) =>
          getNotebookImport(db, workspaceId, owner, results[0]!.document.id),
        )
      ).originalText,
    ).toBe(input.text);
  });
  it("hides private originals from another member, including raw SQL and forged owner ids", async () => {
    const result = await session((db) =>
      saveNotebookImport(db, workspaceId, owner, document()),
    );
    expect(
      await session(
        (db) => listNotebookImports(db, workspaceId, member),
        member,
      ),
    ).toEqual([]);
    expect(
      await session(
        (db) => listNotebookImports(db, workspaceId, owner),
        member,
      ),
    ).toEqual([]);
    await expect(
      session(
        (db) => getNotebookImport(db, workspaceId, member, result.document.id),
        member,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const rows = await session(
      (db) =>
        db.execute(
          sql`select * from notebook_imports where id = ${result.document.id}`,
        ),
      member,
    );
    expect(rows).toHaveLength(0);
    await expect(
      session(
        (db) => saveNotebookImport(db, workspaceId, owner, document()),
        member,
      ),
    ).rejects.toThrow();
  });
  it("does not permit modifying a stored original", async () => {
    const result = await session((db) =>
      saveNotebookImport(db, workspaceId, owner, document()),
    );
    await session((db) =>
      db.execute(
        sql`update notebook_imports set original_text = 'changed' where id = ${result.document.id}`,
      ),
    );
    expect(
      (
        await session((db) =>
          getNotebookImport(db, workspaceId, owner, result.document.id),
        )
      ).originalText,
    ).toBe(result.document.originalText);
  });
});
