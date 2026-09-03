import { bulkTopicDecisionSchema } from "@shorts-os/contracts";
import { decideTopic, writeAuditLog } from "@shorts-os/db";
import { isDomainError } from "@shorts-os/domain";
import { ok, parseBody, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

/** 최대 50건. 일부가 실패해도 나머지를 처리하고 결과를 그대로 보여준다. (스펙 8.5) */
export const POST = route<{ workspaceId: string }>(async ({ request, requestId, params }) => {
  const { workspaceId } = params;
  const context = await workspaceContext(workspaceId);
  const input = await parseBody(request, bulkTopicDecisionSchema);

  const result = await context.run(async ({ db, system, requireRole, user }) => {
    requireRole("topic:decide");

    const succeeded: string[] = [];
    const failed: { topicId: string; code: string; message: string }[] = [];

    for (const topicId of input.topicIds) {
      try {
        const decided = await decideTopic(db, {
          workspaceId,
          topicId,
          userId: user.id,
          decision: input.decision,
          reason: input.reason,
          now: new Date(),
        });
        if (decided.changed) succeeded.push(topicId);
      } catch (error) {
        failed.push({
          topicId,
          code: isDomainError(error) ? error.code : "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (succeeded.length > 0) {
      await writeAuditLog(system, {
        workspaceId,
        actorUserId: user.id,
        action: "topic.bulk_decide",
        entityType: "topic",
        afterState: { decision: input.decision, count: succeeded.length, reason: input.reason },
        requestId,
      });
    }

    return { succeeded, failed };
  });

  return ok(result, requestId);
});
