import { and, eq, sql } from "drizzle-orm";
import type { MemberRole } from "@shorts-os/contracts";
import type { Database } from "../client";
import { scoreConfigs, workspaceMembers, workspaceSettings, workspaces } from "../schema";

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  role: MemberRole;
  timezone: string;
  defaultLocale: string;
};

/**
 * 워크스페이스 생성은 스펙의 create_workspace_with_owner RPC를 그대로 호출한다.
 * 멤버 등록과 기본 Score Config가 한 트랜잭션에서 만들어진다.
 */
export async function createWorkspaceWithOwner(
  db: Database,
  userId: string,
  input: { name: string; slug: string; timezone: string; defaultLocale: string },
): Promise<string> {
  const result = await db.execute<{ create_workspace_with_owner: string }>(sql`
    select create_workspace_with_owner(
      ${input.name},
      ${input.slug},
      ${input.timezone},
      ${input.defaultLocale}
    )
  `);

  const rows = result as unknown as { create_workspace_with_owner: string }[];
  const id = rows[0]?.create_workspace_with_owner;
  if (!id) throw new Error("워크스페이스 생성 결과를 읽지 못했습니다.");
  return id;
}

export async function listWorkspacesForUser(
  db: Database,
  userId: string,
): Promise<WorkspaceSummary[]> {
  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      role: workspaceMembers.role,
      timezone: workspaces.timezone,
      defaultLocale: workspaces.defaultLocale,
    })
    .from(workspaces)
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(workspaces.createdAt);

  return rows.map((row) => ({ ...row, role: row.role as MemberRole }));
}

export async function getMembership(
  db: Database,
  workspaceId: string,
  userId: string,
): Promise<MemberRole | null> {
  const rows = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
    )
    .limit(1);
  return (rows[0]?.role as MemberRole | undefined) ?? null;
}

export async function getActiveScoreConfig(db: Database, workspaceId: string) {
  const rows = await db
    .select()
    .from(scoreConfigs)
    .where(and(eq(scoreConfigs.workspaceId, workspaceId), eq(scoreConfigs.active, true)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getWorkspaceSettings(db: Database, workspaceId: string) {
  const rows = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .limit(1);
  return rows[0] ?? null;
}
