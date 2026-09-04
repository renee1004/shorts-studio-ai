import { roleHasPermission } from "@shorts-os/contracts";
import { loadFactoryBoard } from "@shorts-os/services";
import { workspaceContext } from "@/server/context";
import { requireProductWorkspace } from "@/server/page-context";
import { FactoryBoardClient } from "@/components/product/factory-board-client";

export const dynamic = "force-dynamic";

export default async function FactoryPage() {
  const workspace = await requireProductWorkspace();
  const context = await workspaceContext(workspace.id);
  const board = await context.run(async ({ db, registry }) =>
    loadFactoryBoard(db, workspace.id, registry.videoGeneration()),
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-black">Video Factory</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          승인한 대본을 9:16으로 합성합니다. 생성 모델이 없어도 클립을 올리거나 자막 카드
          Placeholder로 렌더할 수 있습니다. 게시는 Phase 5입니다.
        </p>
      </header>
      <FactoryBoardClient
        workspaceId={workspace.id}
        canWrite={roleHasPermission(workspace.role, "topic:write")}
        board={board}
      />
    </div>
  );
}
