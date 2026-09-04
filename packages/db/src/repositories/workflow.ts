import { and, desc, eq, sql } from "drizzle-orm";
import { DomainError } from "@shorts-os/domain";
import type { Database } from "../client";
import { auditLogs, costEvents, workflowRuns, workflowSteps } from "../schema";

export type RunStatus = "queued" | "running" | "waiting" | "succeeded" | "failed" | "cancelled";

export type StartRunInput = {
  workspaceId: string;
  workflowType: string;
  entityType?: string | undefined;
  entityId?: string | undefined;
  requestedBy: string;
  idempotencyKey: string | null;
  input: Record<string, unknown>;
};

export type StartRunResult = {
  runId: string;
  reused: boolean;
  status: RunStatus;
};

/**
 * 같은 Idempotency Key로 다시 호출하면 새 Run을 만들지 않고 기존 Run을 돌려준다.
 * (스펙 Phase 1 완료 조건)
 */
export async function startWorkflowRun(
  db: Database,
  input: StartRunInput,
): Promise<StartRunResult> {
  if (input.idempotencyKey) {
    const existing = await db
      .select({ id: workflowRuns.id, status: workflowRuns.status })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.workspaceId, input.workspaceId),
          eq(workflowRuns.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);

    const found = existing[0];
    if (found) {
      return { runId: found.id, reused: true, status: found.status as RunStatus };
    }
  }

  try {
    const rows = await db
      .insert(workflowRuns)
      .values({
        workspaceId: input.workspaceId,
        workflowType: input.workflowType,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        requestedBy: input.requestedBy,
        idempotencyKey: input.idempotencyKey,
        input: input.input,
        status: "running",
        startedAt: sql`now()`,
      })
      .returning({ id: workflowRuns.id, status: workflowRuns.status });

    const created = rows[0];
    if (!created) throw new DomainError("INTERNAL_ERROR", "Workflow Run 생성에 실패했습니다.");
    return { runId: created.id, reused: false, status: created.status as RunStatus };
  } catch (error) {
    // 동시 요청이 같은 키로 들어온 경우에도 중복 Run을 만들지 않는다.
    if (input.idempotencyKey && isUniqueViolation(error)) {
      const existing = await db
        .select({ id: workflowRuns.id, status: workflowRuns.status })
        .from(workflowRuns)
        .where(
          and(
            eq(workflowRuns.workspaceId, input.workspaceId),
            eq(workflowRuns.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      const found = existing[0];
      if (found) return { runId: found.id, reused: true, status: found.status as RunStatus };
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export async function addWorkflowStep(
  db: Database,
  input: {
    workspaceId: string;
    runId: string;
    sequenceNo: number;
    stepKey: string;
    provider?: string | undefined;
    status: RunStatus;
    inputSummary?: Record<string, unknown>;
    outputSummary?: Record<string, unknown>;
    errorCode?: string | undefined;
    errorMessage?: string | undefined;
    providerRequestId?: string | null | undefined;
    attemptCount?: number;
  },
) {
  await db
    .insert(workflowSteps)
    .values({
      workspaceId: input.workspaceId,
      workflowRunId: input.runId,
      sequenceNo: input.sequenceNo,
      stepKey: input.stepKey,
      provider: input.provider ?? null,
      status: input.status,
      providerRequestId: input.providerRequestId ?? null,
      attemptCount: input.attemptCount ?? 1,
      inputSummary: input.inputSummary ?? {},
      outputSummary: input.outputSummary ?? {},
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      startedAt: sql`now()`,
      completedAt: sql`now()`,
    })
    .onConflictDoNothing();
}

export async function finishWorkflowRun(
  db: Database,
  input: {
    runId: string;
    status: Extract<RunStatus, "succeeded" | "failed" | "cancelled">;
    output?: Record<string, unknown>;
    errorCode?: string | undefined;
    errorMessage?: string | undefined;
  },
) {
  await db
    .update(workflowRuns)
    .set({
      status: input.status,
      output: input.output ?? {},
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      progress: input.status === "succeeded" ? "100" : sql`progress`,
      completedAt: sql`now()`,
    })
    .where(eq(workflowRuns.id, input.runId));
}

export async function listWorkflowRuns(db: Database, workspaceId: string, limit = 20) {
  return db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.workspaceId, workspaceId))
    .orderBy(desc(workflowRuns.createdAt))
    .limit(limit);
}

export async function listWorkflowSteps(db: Database, runId: string) {
  return db
    .select()
    .from(workflowSteps)
    .where(eq(workflowSteps.workflowRunId, runId))
    .orderBy(workflowSteps.sequenceNo);
}

export async function insertCostEvent(
  db: Database,
  input: {
    workspaceId: string;
    workflowRunId?: string | null;
    provider: string;
    service: string;
    modelName?: string | null;
    quantity?: string | null;
    unit?: string | null;
    estimatedCost?: string | null;
    actualCost?: string | null;
    currency?: string;
    providerRequestId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(costEvents).values({
    workspaceId: input.workspaceId,
    workflowRunId: input.workflowRunId ?? null,
    provider: input.provider,
    service: input.service,
    modelName: input.modelName ?? null,
    quantity: input.quantity ?? null,
    unit: input.unit ?? null,
    estimatedCost: input.estimatedCost ?? null,
    actualCost: input.actualCost ?? null,
    currency: input.currency ?? "USD",
    providerRequestId: input.providerRequestId ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function countCostEventsForRun(db: Database, workflowRunId: string): Promise<number> {
  const rows = await db
    .select({ id: costEvents.id })
    .from(costEvents)
    .where(eq(costEvents.workflowRunId, workflowRunId));
  return rows.length;
}

export async function writeAuditLog(
  db: Database,
  input: {
    workspaceId: string;
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId?: string | undefined;
    beforeState?: Record<string, unknown> | undefined;
    afterState?: Record<string, unknown> | undefined;
    requestId?: string | undefined;
  },
) {
  await db.insert(auditLogs).values({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    beforeState: input.beforeState ?? null,
    afterState: input.afterState ?? null,
    requestId: input.requestId ?? null,
  });
}
