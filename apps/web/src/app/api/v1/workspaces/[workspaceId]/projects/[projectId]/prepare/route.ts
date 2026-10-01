import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { contentProjects, getLatestResearchBrief } from "@shorts-os/db";
import { generateResearchSchema } from "@shorts-os/contracts";
import { DomainError } from "@shorts-os/domain";
import {
  loadStudioProject,
  researchTopic,
  generateProjectAngles,
  selectProjectAngle,
  generateProjectScript,
} from "@shorts-os/services";
import { ok, parseBody, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const POST = route<{ workspaceId: string; projectId: string }>(
  async ({ request, requestId, params }) => {
    const { workspaceId, projectId } = params;
    const { stage } = await parseBody(
      request,
      z.object({ stage: z.enum(["research", "angles", "script"]) }),
    );
    const context = await workspaceContext(workspaceId);
    await context.run(async ({ db, system, registry, user, requireRole }) => {
      requireRole("topic:write");
      // A nonblocking transaction lock serializes generation across tabs and workers.
      const lock = await db.execute(
        sql`select pg_try_advisory_xact_lock(hashtextextended(${workspaceId + projectId}, 0)) as acquired`,
      );
      if (!lock[0]?.acquired)
        throw new DomainError(
          "CONFLICT",
          "이 영상의 제작이 이미 진행 중입니다. 잠시 후 이어서 진행하세요.",
        );
      const detail = await loadStudioProject(db, workspaceId, projectId);
      const options = {
        db,
        system,
        workspaceId,
        projectId,
        userId: user.id,
        idempotencyKey: `prepare:${projectId}:${stage}:${randomUUID()}`,
      };
      if (stage === "research") {
        if (detail.project.researchBriefId || detail.latestScript) return;
        const cached = await getLatestResearchBrief(
          db,
          workspaceId,
          detail.project.topicId,
        );
        const brief =
          cached ??
          (
            await researchTopic({
              db: system,
              provider: registry.research(),
              workspaceId,
              topicId: detail.project.topicId,
              userId: user.id,
              idempotencyKey: options.idempotencyKey,
              request: generateResearchSchema.parse({}),
              requestId,
            })
          ).brief;
        await db
          .update(contentProjects)
          .set({
            researchBriefId: brief.id,
            status: "research_ready",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(contentProjects.workspaceId, workspaceId),
              eq(contentProjects.id, projectId),
            ),
          );
      } else if (stage === "angles") {
        if (!detail.project.researchBriefId)
          throw new DomainError(
            "INVALID_STATE_TRANSITION",
            "자료 조사를 먼저 완료해 주세요.",
          );
        if (!detail.angles.length)
          await generateProjectAngles({
            ...options,
            provider: registry.contentStudio(),
          });
      } else {
        if (detail.latestScript) return;
        if (!detail.angles.length)
          throw new DomainError(
            "INVALID_STATE_TRANSITION",
            "구성안 생성을 먼저 완료해 주세요.",
          );
        if (!detail.project.selectedAngleId) {
          await selectProjectAngle({
            db,
            workspaceId,
            projectId,
            angleId: detail.angles[0]!.id,
          });
        }
        await generateProjectScript({
          ...options,
          provider: registry.contentStudio(),
        });
      }
    });
    return ok(
      await context.run(({ db }) =>
        loadStudioProject(db, workspaceId, projectId),
      ),
      requestId,
    );
  },
);
