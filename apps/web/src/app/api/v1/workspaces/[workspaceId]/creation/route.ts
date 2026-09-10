import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { niches, topics, contentProjects } from "@shorts-os/db";
import { createStudioProject } from "@shorts-os/services";
import { DomainError } from "@shorts-os/domain";
import { ok, parseBody, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const POST = route<{ workspaceId: string }>(
  async ({ request, requestId, params }) => {
    const input = await parseBody(
      request,
      z.object({
        topic: z.string().trim().min(2).max(200),
        operationId: z.string().uuid(),
      }),
    );
    const context = await workspaceContext(params.workspaceId);
    const result = await context.run(
      async ({ db, workspaceId, user, requireRole, registry }) => {
        requireRole("topic:write");
        registry.contentStudio(); // Fail before saving when live configuration is incomplete.
        registry.research();
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
          if (existing.title !== input.topic)
            throw new DomainError(
              "CONFLICT",
              "같은 요청으로 다른 주제를 만들 수 없습니다.",
            );
          return { project: existing };
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
        await db
          .insert(topics)
          .values({
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
        return createStudioProject({
          db,
          workspaceId,
          userId: user.id,
          request: {
            topicId: input.operationId,
            targetLanguage: "ko",
            targetDurationSeconds: 45,
          },
        });
      },
    );
    return ok(result, requestId, 201);
  },
);
