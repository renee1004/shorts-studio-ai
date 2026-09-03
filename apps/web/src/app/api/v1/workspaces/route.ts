import { createWorkspaceSchema } from "@shorts-os/contracts";
import { createWorkspaceWithOwner, listWorkspacesForUser, withUserSession } from "@shorts-os/db";
import { DomainError } from "@shorts-os/domain";
import { ok, parseBody, route } from "@/server/api";
import { requireUser } from "@/server/auth";
import { appDatabaseUrl } from "@/server/env";

export const GET = route(async ({ requestId }) => {
  const user = await requireUser();
  const workspaces = await withUserSession(appDatabaseUrl(), user.id, (db) =>
    listWorkspacesForUser(db, user.id),
  );
  return ok({ workspaces }, requestId);
});

export const POST = route(async ({ request, requestId }) => {
  const user = await requireUser();
  const input = await parseBody(request, createWorkspaceSchema);

  const workspaceId = await withUserSession(appDatabaseUrl(), user.id, async (db) => {
    try {
      return await createWorkspaceWithOwner(db, user.id, {
        name: input.name,
        slug: input.slug,
        timezone: input.timezone,
        defaultLocale: input.defaultLocale,
      });
    } catch (error) {
      if (typeof error === "object" && error && "code" in error) {
        const code = (error as { code?: string }).code;
        if (code === "23505") {
          throw new DomainError("CONFLICT", "이미 쓰이고 있는 slug입니다.");
        }
      }
      throw error;
    }
  });

  return ok({ id: workspaceId }, requestId, 201);
});
