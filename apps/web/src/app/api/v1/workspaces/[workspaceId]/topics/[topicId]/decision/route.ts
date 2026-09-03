import { topicDecisionRequestSchema } from "@shorts-os/contracts";
import { decideTopic, writeAuditLog } from "@shorts-os/db";
import { ok, parseBody, route } from "@/server/api";
import { workspaceContext } from "@/server/context";

export const POST = route<{ workspaceId: string; topicId: string }>(
  async ({ request, requestId, params }) => {
    const { workspaceId, topicId } = params;
    const context = await workspaceContext(workspaceId);
    const input = await parseBody(request, topicDecisionRequestSchema);

    const result = await context.run(async ({ db, system, requireRole, user }) => {
      requireRole("topic:decide");

      const decided = await decideTopic(db, {
        workspaceId,
        topicId,
        userId: user.id,
        decision: input.decision,
        reason: input.reason,
        now: new Date(),
      });

      if (decided.changed) {
        await writeAuditLog(system, {
          workspaceId,
          actorUserId: user.id,
          action: "topic.decide",
          entityType: "topic",
          entityId: topicId,
          beforeState: { decision: decided.from },
          afterState: { decision: decided.to, reason: input.reason },
          requestId,
        });
      }

      return decided;
    });

    return ok(result, requestId);
  },
);
