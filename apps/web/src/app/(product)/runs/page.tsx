import { listWorkflowRuns, listWorkflowSteps } from "@shorts-os/db";
import { listMyWorkspaces, workspaceContext } from "@/server/context";

export const dynamic = "force-dynamic";

const statusTone: Record<string, string> = {
  succeeded: "text-success",
  failed: "text-destructive",
  running: "text-primary",
  queued: "text-muted-foreground",
  cancelled: "text-muted-foreground",
  waiting: "text-muted-foreground",
};

export default async function RunsPage() {
  const workspaces = await listMyWorkspaces();
  const workspace = workspaces[0]!;
  const context = await workspaceContext(workspace.id);

  const runs = await context.run(async ({ db }) => {
    const rows = await listWorkflowRuns(db, workspace.id, 20);
    return Promise.all(
      rows.map(async (run) => ({ run, steps: await listWorkflowSteps(db, run.id) })),
    );
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-black">Workflow Runs</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          모든 비동기 작업은 Run과 Step으로 남습니다. Provider 오류 코드와 쿼터 사용량을 그대로
          보여줍니다.
        </p>
      </header>

      {runs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="font-bold">실행 기록이 없습니다</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Niche Radar에서 신호 수집을 실행하면 여기에 남습니다.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {runs.map(({ run, steps }) => (
            <li key={run.id} className="rounded-2xl border border-border/70 bg-card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-bold">{run.workflowType}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {run.createdAt.toISOString().replace("T", " ").slice(0, 19)} · 재시도{" "}
                    {run.retryCount}회
                  </p>
                </div>
                <span
                  className={`shrink-0 font-mono text-[12px] font-bold ${statusTone[run.status] ?? ""}`}
                >
                  {run.status}
                </span>
              </div>

              {run.idempotencyKey && (
                <p className="mt-2 truncate font-mono text-[10px] text-muted-foreground">
                  key {run.idempotencyKey}
                </p>
              )}

              {run.errorCode && (
                <p className="mt-2 rounded-lg border border-destructive/30 bg-destructive/[0.07] px-3 py-2 text-[12px]">
                  <span className="font-mono font-bold">{run.errorCode}</span> {run.errorMessage}
                </p>
              )}

              {steps.length > 0 && (
                <ol className="mt-3 space-y-1">
                  {steps.map((step) => (
                    <li
                      key={step.id}
                      className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground"
                    >
                      <span className="w-5 text-right">{step.sequenceNo}</span>
                      <span className="min-w-0 flex-1 truncate">{step.stepKey}</span>
                      <span className={statusTone[step.status] ?? ""}>{step.status}</span>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
