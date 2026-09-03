import { describe, expect, it } from "vitest";
import { allowedTopicTransitions, canTransitionTopic, topicListQuerySchema } from "./topic";
import { roleHasPermission } from "./workspace";
import { scoreWeightsSchema } from "./scoring";

describe("topic 상태 전이", () => {
  it("스펙 7.3의 허용 전이만 통과시킨다", () => {
    expect(canTransitionTopic("new", "approved")).toBe(true);
    expect(canTransitionTopic("new", "archived")).toBe(false);
    expect(canTransitionTopic("approved", "rejected")).toBe(false);
    expect(canTransitionTopic("archived", "approved")).toBe(false);
  });

  it("보관 상태는 더 이상 바꿀 수 없다", () => {
    expect(allowedTopicTransitions("archived")).toStrictEqual([]);
  });
});

describe("역할 권한", () => {
  it("Viewer는 읽기만 가능하다", () => {
    expect(roleHasPermission("viewer", "read")).toBe(true);
    expect(roleHasPermission("viewer", "topic:decide")).toBe(false);
    expect(roleHasPermission("viewer", "niche:write")).toBe(false);
  });

  it("Operator는 Niche와 Topic을 쓸 수 있지만 연동은 못 바꾼다", () => {
    expect(roleHasPermission("operator", "niche:write")).toBe(true);
    expect(roleHasPermission("operator", "integration:write")).toBe(false);
  });

  it("Reviewer는 QA와 게시 승인을 한다", () => {
    expect(roleHasPermission("reviewer", "qa:write")).toBe(true);
    expect(roleHasPermission("reviewer", "publish:approve")).toBe(true);
    expect(roleHasPermission("reviewer", "niche:write")).toBe(false);
  });
});

describe("score weights", () => {
  it("합계가 100이 아니면 거절한다", () => {
    const invalid = {
      youtube_velocity: 30,
      search_interest: 15,
      commercial_intent: 15,
      competition_gap: 15,
      shorts_fit: 10,
      repeatability: 8,
      source_quality: 7,
      policy_safety: 5,
    };
    expect(scoreWeightsSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("topic list query", () => {
  it("기본 정렬과 limit을 채운다", () => {
    const parsed = topicListQuerySchema.parse({});
    expect(parsed.limit).toBe(25);
    expect(parsed.sort).toBe("-opportunityScore");
  });

  it("limit 상한을 넘기면 거절한다", () => {
    expect(topicListQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
  });
});
