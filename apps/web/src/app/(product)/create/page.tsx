import { roleHasPermission } from "@shorts-os/contracts";
import { requireProductWorkspace } from "@/server/page-context";
import { workspaceContext } from "@/server/context";
import { loadStudioProject, getNotebookImport } from "@shorts-os/services";
import { z } from "zod";
import { DomainError } from "@shorts-os/domain";
import { env } from "@/server/env";
import {
  CreationClient,
  type CreationDetail,
} from "@/components/product/creation-client";

export const dynamic = "force-dynamic";
export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; import?: string }>;
}) {
  const workspace = await requireProductWorkspace();
  const query = await searchParams;
  let initialProject: { id: string; title: string } | undefined;
  let initialDetail: CreationDetail | undefined;
  let initialImport: { title: string; text: string } | undefined;
  if (query.import && !query.project) {
    const id = z.string().uuid().parse(query.import);
    const context = await workspaceContext(workspace.id);
    if (context.user.provider !== "supabase")
      throw new DomainError("PERMISSION_DENIED", "이메일 로그인이 필요합니다.");
    const document = await context.run(({ db, user }) =>
      getNotebookImport(db, workspace.id, user.id, id),
    );
    initialImport = { title: document.title, text: document.originalText };
  }
  if (query.project) {
    const id = z.string().uuid().parse(query.project);
    const context = await workspaceContext(workspace.id);
    const detail = await context.run(({ db }) =>
      loadStudioProject(db, workspace.id, id),
    );
    initialProject = { id: detail.project.id, title: detail.project.title };
    initialDetail = detail;
  }
  return (
    <CreationClient
      key={initialProject?.id ?? query.import ?? "new"}
      {...(initialImport ? { initialImport } : {})}
      {...(initialProject ? { initialProject } : {})}
      {...(initialDetail ? { initialDetail } : {})}
      narrationEnabled={
        env().APP_MODE === "live" &&
        Boolean(env().GEMINI_API_KEY && env().GEMINI_TTS_MODEL)
      }
      workspaceId={workspace.id}
      canWrite={roleHasPermission(workspace.role, "topic:write")}
      demo={env().APP_MODE === "demo"}
    />
  );
}
