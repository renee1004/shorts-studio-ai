import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { notebookDocumentSchema } from "@shorts-os/contracts";
import { notebookImports, type Database } from "@shorts-os/db";
import { DomainError } from "@shorts-os/domain";

/** Stores a selected remote snapshot without any provider generation or text rewriting. */
export async function saveNotebookImport(
  db: Database,
  workspaceId: string,
  userId: string,
  document: unknown,
) {
  const source = notebookDocumentSchema.parse(document);
  const contentHash = createHash("sha256")
    .update(JSON.stringify([source.title, source.text]))
    .digest("hex");
  const values = {
    workspaceId,
    importedBy: userId,
    notebookId: source.notebookId,
    itemId: source.itemId,
    kind: source.kind,
    title: source.title,
    originalText: source.text,
    contentHash,
  };
  const [saved] = await db
    .insert(notebookImports)
    .values(values)
    .onConflictDoNothing()
    .returning();
  if (saved) return { document: saved, reused: false };
  const [existing] = await db
    .select()
    .from(notebookImports)
    .where(
      and(
        eq(notebookImports.workspaceId, workspaceId),
        eq(notebookImports.importedBy, userId),
        eq(notebookImports.notebookId, source.notebookId),
        eq(notebookImports.itemId, source.itemId),
        eq(notebookImports.kind, source.kind),
        eq(notebookImports.contentHash, contentHash),
      ),
    );
  if (!existing)
    throw new DomainError(
      "CONFLICT",
      "저장 결과를 확인하지 못했습니다. 저장한 원문 목록을 확인해 주세요.",
    );
  return { document: existing, reused: true };
}

export function listNotebookImports(
  db: Database,
  workspaceId: string,
  userId: string,
) {
  return db
    .select({
      id: notebookImports.id,
      title: notebookImports.title,
      kind: notebookImports.kind,
      importedAt: notebookImports.importedAt,
    })
    .from(notebookImports)
    .where(
      and(
        eq(notebookImports.workspaceId, workspaceId),
        eq(notebookImports.importedBy, userId),
      ),
    )
    .orderBy(desc(notebookImports.importedAt))
    .limit(100);
}

export async function getNotebookImport(
  db: Database,
  workspaceId: string,
  userId: string,
  id: string,
) {
  const [document] = await db
    .select()
    .from(notebookImports)
    .where(
      and(
        eq(notebookImports.workspaceId, workspaceId),
        eq(notebookImports.importedBy, userId),
        eq(notebookImports.id, id),
      ),
    );
  if (!document)
    throw new DomainError("NOT_FOUND", "저장한 원문을 찾을 수 없습니다.");
  return document;
}
