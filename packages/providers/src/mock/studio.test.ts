import { describe, expect, it } from "vitest";
import { MockContentStudioProvider } from "./studio";

describe("MockContentStudioProvider DNA", () => {
  const provider = new MockContentStudioProvider();

  it("대본이 없으면 transcript evidence를 만들지 않는다", async () => {
    const result = await provider.analyzeDna({
      workspaceId: "ws",
      title: "weekly reporting in 60 seconds",
      description: "공개 설명",
      durationSeconds: 58,
      transcript: null,
    });

    expect(result.mode).toBe("mock");
    expect(result.content.structuredPattern.transcriptIncluded).toBe(false);
    expect(result.content.evidence.every((item) => item.evidenceType !== "user_supplied_transcript")).toBe(
      true,
    );
    expect(result.content.evidence.some((item) => /대본을 확인|transcript text/i.test(item.note))).toBe(
      false,
    );
  });

  it("사용자가 대본을 넣으면 evidence type이 바뀐다", async () => {
    const result = await provider.analyzeDna({
      workspaceId: "ws",
      title: "weekly reporting",
      description: null,
      durationSeconds: 40,
      transcript: "First say the problem. Then show one step. Then ask them to save it.",
    });

    expect(result.content.structuredPattern.transcriptIncluded).toBe(true);
    expect(result.content.evidence.some((item) => item.evidenceType === "user_supplied_transcript")).toBe(
      true,
    );
    expect(JSON.stringify(result.content)).not.toMatch(/First say the problem/);
  });
});

describe("MockContentStudioProvider script", () => {
  it("출처가 없으면 모든 사실 주장에 unverified를 붙인다", async () => {
    const provider = new MockContentStudioProvider();
    const result = await provider.generateScript({
      topicTitle: "주간 보고 자동화",
      language: "ko",
      targetDurationSeconds: 45,
      angle: {
        title: "한 가지 실수",
        hook: "매주 같은 보고를 다시 씁니까",
        promise: "한 단계만 바꿉니다",
        outline: ["문제", "한 단계", "확인"],
      },
      keyFacts: [],
      citationCount: 0,
    });

    expect(result.structured.factualClaims.length).toBeGreaterThan(0);
    expect(result.structured.factualClaims.every((claim) => claim.unverified)).toBe(true);
    expect(result.structured.factualClaims.every((claim) => claim.citationIndexes.length === 0)).toBe(
      true,
    );
  });
});
