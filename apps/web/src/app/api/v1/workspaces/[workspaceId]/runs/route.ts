import { listWorkflowRuns, listWorkflowSteps } from "@shorts-os/db";
import { ok, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const GET = route<{ workspaceId: string }>(async ({ requestId, params }) => {
  const { workspaceId } = params;
  const context = await workspaceContext(workspaceId);

  const runs = await context.run(async ({ db }) => {
    const rows = await listWorkflowRuns(db, workspaceId, 20);
    return Promise.all(
      rows.map(async (run) => ({
        id: run.id,
        workflowType: run.workflowType,
        status: run.status,
        entityType: run.entityType,
        entityId: run.entityId,
        errorCode: run.errorCode,
        errorMessage: run.errorMessage,
        idempotencyKey: run.idempotencyKey,
        createdAt: run.createdAt.toISOString(),
        completedAt: run.completedAt?.toISOString() ?? null,
        output: run.output,
        steps: (await listWorkflowSteps(db, run.id)).map((step) => ({
          sequenceNo: step.sequenceNo,
          stepKey: step.stepKey,
          provider: step.provider,
          status: step.status,
          errorCode: step.errorCode,
          outputSummary: step.outputSummary,
        })),
      })),
    );
  });

  return ok({ runs }, requestId);
});
