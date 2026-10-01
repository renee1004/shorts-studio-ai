import { creationInputSchema } from "@shorts-os/contracts";
import { and, eq, sql } from "drizzle-orm";
import {
  niches,
  topics,
  contentProjects,
  insertResearchBrief,
} from "@shorts-os/db";
import {
  createStudioProject,
  importProjectScript,
  loadStudioProject,
} from "./studio";
import { DomainError, snapshotHash } from "@shorts-os/domain";

import type { Database } from "@shorts-os/db";

/** Caller supplies a user-scoped transaction. This operation never invokes a provider. */
export async function createCreationProject(options: {
  db: Database;
  workspaceId: string;
  userId: string;
  input: unknown;
}) {
  const { db, workspaceId, userId } = options;
  const user = { id: userId };
  const input = creationInputSchema.parse(options.input);
  const inputHash = snapshotHash({
    mode: input.mode,
    topic: input.topic,
    suppliedText: input.suppliedText,
  });
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${workspaceId + input.operationId}, 0))`,
  );
  const [existing] = await db
    .select()
    .from(contentProjects)
    .where(
      and(
        eq(contentProjects.workspaceId, workspaceId),
        eq(contentProjects.topicId, input.operationId),
      ),
    );
  if (existing) {
    if (existing.creationInputHash !== inputHash)
      throw new DomainError(
        "CONFLICT",
        "이 요청의 기존 입력과 일치하는지 확인할 수 없습니다. 내 작업함에서 저장된 작업을 확인해 주세요.",
      );
    return loadStudioProject(db, workspaceId, existing.id);
  }
  await db
    .insert(niches)
    .values({
      workspaceId,
      slug: "direct-creation",
      name: "직접 입력한 주제",
      targetCountry: "KR",
      targetLanguage: "ko",
      createdBy: user.id,
    })
    .onConflictDoNothing();
  const [niche] = await db
    .select()
    .from(niches)
    .where(
      and(
        eq(niches.workspaceId, workspaceId),
        eq(niches.slug, "direct-creation"),
        eq(niches.targetCountry, "KR"),
        eq(niches.targetLanguage, "ko"),
      ),
    );
  if (!niche)
    throw new DomainError(
      "INTERNAL_ERROR",
      "주제 저장 공간을 만들지 못했습니다.",
    );
  await db.insert(topics).values({
    id: input.operationId,
    workspaceId,
    nicheId: niche.id,
    title: input.topic,
    normalizedTitle: input.operationId,
    targetCountry: "KR",
    targetLanguage: "ko",
    discoveredBy: "user",
    decision: "approved",
    decisionReason:
      "사용자가 제작 시작을 요청한 주제. 사실 검증 및 게시 승인은 별도입니다.",
    decidedBy: user.id,
    decidedAt: new Date(),
  });
  const brief =
    input.mode === "notes"
      ? await insertResearchBrief(db, {
          workspaceId,
          topicId: input.operationId,
          createdBy: user.id,
          content: {
            executiveSummary: input.suppliedText,
            keyFacts: [],
            audienceInsights: [],
            angles: [],
            counterpoints: [],
            unknowns: [
              "사용자가 제공한 자료입니다. 사실관계와 출처를 독립적으로 검증하지 않았습니다.",
            ],
            citations: [],
          },
          citationCoverage: null,
          modelName: "user-import",
          promptVersion: "notes.import.v1",
          inputHash: input.operationId,
          status: "needs_review",
        })
      : null;
  const created = await createStudioProject({
    db,
    workspaceId,
    userId: user.id,
    request: {
      topicId: input.operationId,
      ...(brief ? { researchBriefId: brief.id } : {}),
      targetLanguage: "ko",
      targetDurationSeconds: 45,
    },
  });
  await db
    .update(contentProjects)
    .set({ creationInputHash: inputHash })
    .where(
      and(
        eq(contentProjects.workspaceId, workspaceId),
        eq(contentProjects.id, created.project.id),
      ),
    );
  if (input.mode === "script")
    await importProjectScript({
      db,
      workspaceId,
      userId: user.id,
      projectId: created.project.id,
      text: input.suppliedText,
    });
  return loadStudioProject(db, workspaceId, created.project.id);
}
