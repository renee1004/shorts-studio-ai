import { createHash } from "node:crypto";
import {
  citationCoverage,
  type GenerateResearchInput,
  type ResearchBriefContent,
} from "@shorts-os/contracts";
import { DomainError } from "@shorts-os/domain";
import {
  addWorkflowStep,
  finishWorkflowRun,
  getLatestResearchBrief,
  getTopicForResearch,
  insertResearchBrief,
  startWorkflowRun,
  upsertCitationSources,
  writeAuditLog,
  type Database,
  type StoredBrief,
} from "@shorts-os/db";
import type { ResearchProvider } from "@shorts-os/providers";
import { createLogger } from "@shorts-os/observability";

export type ResearchTopicOptions = {
  db: Database;
  provider: ResearchProvider;
  workspaceId: string;
  topicId: string;
  userId: string;
  idempotencyKey: string | null;
  request: GenerateResearchInput;
  requestId?: string;
};

export type ResearchTopicResult = {
  runId: string;
  reused: boolean;
  brief: StoredBrief;
  /** 같은 입력이라 새로 만들지 않고 기존 Brief를 돌려준 경우 */
  fromCache: boolean;
  mode: "mock" | "live";
};

/**
 * 같은 주제·같은 프롬프트·같은 언어면 입력 해시가 같다.
 * forceRefresh 없이 다시 부르면 새 버전을 쌓지 않고 기존 Brief를 준다.
 */
export function researchInputHash(input: {
  topicTitle: string;
  language: string;
  promptVersion: string;
  maxSources: number;
}): string {
  return createHash("sha256")
    .update(
      [input.topicTitle, input.language, input.promptVersion, String(input.maxSources)].join("|"),
    )
    .digest("hex")
    .slice(0, 32);
}

/**
 * Phase 2A 수직 슬라이스: Topic → Research Brief.
 *
 * 근거 없는 주장은 저장하지 않는다. Provider가 인용을 주지 못하면
 * keyFacts는 비고 citation_coverage는 0 또는 null로 남는다. 가짜 출처를 만들지 않는다.
 */
export async function researchTopic(
  options: ResearchTopicOptions,
): Promise<ResearchTopicResult> {
  const logger = createLogger({
    workspaceId: options.workspaceId,
    ...(options.requestId ? { requestId: options.requestId } : {}),
    provider: "gemini",
  });

  const topic = await getTopicForResearch(options.db, options.workspaceId, options.topicId);
  if (!topic) throw new DomainError("NOT_FOUND", "Topic을 찾을 수 없습니다.");

  const run = await startWorkflowRun(options.db, {
    workspaceId: options.workspaceId,
    workflowType: "topic.research",
    entityType: "topic",
    entityId: options.topicId,
    requestedBy: options.userId,
    idempotencyKey: options.idempotencyKey,
    input: { ...options.request, topicId: options.topicId },
  });

  if (run.reused) {
    const existing = await getLatestResearchBrief(
      options.db,
      options.workspaceId,
      options.topicId,
    );
    if (!existing) {
      throw new DomainError(
        "CONFLICT",
        "같은 Idempotency Key의 Run이 있지만 Brief가 없습니다. 새 키로 다시 실행하세요.",
      );
    }
    logger.info({ runId: run.runId }, "동일 Idempotency Key로 기존 Run을 재사용했습니다.");
    return {
      runId: run.runId,
      reused: true,
      brief: existing,
      fromCache: true,
      mode: options.provider.mode,
    };
  }

  try {
    const latest = await getLatestResearchBrief(options.db, options.workspaceId, options.topicId);

    if (!options.request.forceRefresh && latest) {
      const sameInput =
        latest.inputHash ===
        researchInputHash({
          topicTitle: topic.title,
          language: options.request.language,
          promptVersion: latest.promptVersion,
          maxSources: options.request.maxSources,
        });

      if (sameInput) {
        await addWorkflowStep(options.db, {
          workspaceId: options.workspaceId,
          runId: run.runId,
          sequenceNo: 1,
          stepKey: "research:reuse",
          provider: "gemini",
          status: "succeeded",
          inputSummary: { topicId: options.topicId, inputHash: latest.inputHash },
          outputSummary: { briefId: latest.id, version: latest.version, reason: "SAME_INPUT" },
        });
        await finishWorkflowRun(options.db, {
          runId: run.runId,
          status: "succeeded",
          output: { briefId: latest.id, version: latest.version, reused: true },
        });

        return {
          runId: run.runId,
          reused: false,
          brief: latest,
          fromCache: true,
          mode: options.provider.mode,
        };
      }
    }

    const generated = await options.provider.researchTopic({
      workspaceId: options.workspaceId,
      topicTitle: topic.title,
      nicheName: topic.nicheName,
      angleHint: topic.angleHint,
      language: options.request.language,
      maxSources: options.request.maxSources,
    });

    const content: ResearchBriefContent = generated.content;
    const coverage = citationCoverage(content);

    await addWorkflowStep(options.db, {
      workspaceId: options.workspaceId,
      runId: run.runId,
      sequenceNo: 1,
      stepKey: "research:generate",
      provider: "gemini",
      status: "succeeded",
      inputSummary: {
        topicId: options.topicId,
        language: options.request.language,
        maxSources: options.request.maxSources,
      },
      outputSummary: {
        mode: generated.mode,
        modelName: generated.modelName,
        citations: content.citations.length,
        keyFacts: content.keyFacts.length,
        citationCoverage: coverage,
      },
    });

    // 인용이 없으면 사람이 확인해야 한다. mock은 항상 여기에 해당한다.
    const status = content.citations.length === 0 ? "needs_review" : "ready";

    const brief = await insertResearchBrief(options.db, {
      workspaceId: options.workspaceId,
      topicId: options.topicId,
      createdBy: options.userId,
      content,
      citationCoverage: coverage,
      modelName: generated.modelName,
      promptVersion: generated.promptVersion,
      inputHash: researchInputHash({
        topicTitle: topic.title,
        language: options.request.language,
        promptVersion: generated.promptVersion,
        maxSources: options.request.maxSources,
      }),
      status,
    });

    const { linked } = await upsertCitationSources(options.db, {
      workspaceId: options.workspaceId,
      topicId: options.topicId,
      citations: content.citations,
    });

    await addWorkflowStep(options.db, {
      workspaceId: options.workspaceId,
      runId: run.runId,
      sequenceNo: 2,
      stepKey: "research:sources",
      provider: "gemini",
      status: "succeeded",
      inputSummary: { citations: content.citations.length },
      outputSummary: { linkedSources: linked },
    });

    await finishWorkflowRun(options.db, {
      runId: run.runId,
      status: "succeeded",
      output: { briefId: brief.id, version: brief.version, citationCoverage: coverage },
    });

    await writeAuditLog(options.db, {
      workspaceId: options.workspaceId,
      actorUserId: options.userId,
      action: "research.brief.created",
      entityType: "research_brief",
      entityId: brief.id,
      afterState: {
        topicId: options.topicId,
        version: brief.version,
        status,
        mode: generated.mode,
        citations: content.citations.length,
      },
      ...(options.requestId ? { requestId: options.requestId } : {}),
    });

    logger.info(
      {
        runId: run.runId,
        briefId: brief.id,
        version: brief.version,
        mode: generated.mode,
        citations: content.citations.length,
      },
      "Research Brief를 만들었습니다.",
    );

    return { runId: run.runId, reused: false, brief, fromCache: false, mode: generated.mode };
  } catch (error) {
    const isDomain = error instanceof DomainError;
    await finishWorkflowRun(options.db, {
      runId: run.runId,
      status: "failed",
      errorCode: isDomain ? error.code : "INTERNAL_ERROR",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
