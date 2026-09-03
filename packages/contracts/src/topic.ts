import { z } from "zod";
import { cursorPageSchema } from "./common";

export const topicDecisions = ["new", "watch", "approved", "rejected", "archived"] as const;
export const topicDecisionSchema = z.enum(topicDecisions);
export type TopicDecision = z.infer<typeof topicDecisionSchema>;

/** 스펙 7.3의 허용 상태 전이. UI가 아니라 Domain이 검증한다. */
const allowedTransitions: Record<TopicDecision, TopicDecision[]> = {
  new: ["watch", "approved", "rejected"],
  watch: ["approved", "rejected", "archived"],
  approved: ["watch", "archived"],
  rejected: ["watch", "archived"],
  archived: [],
};

export function canTransitionTopic(from: TopicDecision, to: TopicDecision): boolean {
  return allowedTransitions[from].includes(to);
}

export function allowedTopicTransitions(from: TopicDecision): TopicDecision[] {
  return [...allowedTransitions[from]];
}

export const topicListQuerySchema = cursorPageSchema.extend({
  nicheId: z.string().uuid().optional(),
  decision: topicDecisionSchema.optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  minConfidence: z.coerce.number().min(0).max(100).optional(),
  hasMissingSignals: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  sort: z
    .enum(["-opportunityScore", "opportunityScore", "-confidenceScore", "-lastSeenAt"])
    .default("-opportunityScore"),
});

export type TopicListQuery = z.infer<typeof topicListQuerySchema>;

export const topicDecisionRequestSchema = z.object({
  decision: topicDecisionSchema,
  reason: z.string().min(1).max(1000),
});

export const bulkTopicDecisionSchema = z.object({
  topicIds: z.array(z.string().uuid()).min(1).max(50),
  decision: topicDecisionSchema,
  reason: z.string().min(1).max(1000),
});
