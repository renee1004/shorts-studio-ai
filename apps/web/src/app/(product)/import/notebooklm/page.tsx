import { roleHasPermission } from "@shorts-os/contracts";
import { requireProductWorkspace } from "@/server/page-context";
import { NotebookImportClient } from "@/components/product/notebook-import-client";

export const dynamic = "force-dynamic";
export default async function NotebookImportPage() {
  const workspace = await requireProductWorkspace();
  return (
    <NotebookImportClient
      workspaceId={workspace.id}
      canWrite={roleHasPermission(workspace.role, "topic:write")}
    />
  );
}
