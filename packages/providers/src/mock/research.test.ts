import { describe, expect, it } from "vitest";
import { citationCoverage } from "@shorts-os/contracts";
import { DomainError } from "@shorts-os/domain";
import { MockResearchProvider } from "./research";
import { withRetry } from "../errors";

const input = {
  workspaceId: "ws",
  topicTitle: "연말정산 절세",
  nicheName: "Money",
  angleHint: null,
  language: "ko",
  maxSources: 8,
};

describe("MockResearchProvider", () => {
  it("출처를 만들어내지 않는다", async () => {
    const provider = new MockResearchProvider();
    const result = await provider.researchTopic(input);

    expect(result.mode).toBe("mock");
    expect(result.content.citations).toHaveLength(0);
    // 근거가 없으면 사실 주장도 없어야 한다.
    expect(result.content.keyFacts).toHaveLength(0);
    expect(citationCoverage(result.content)).toBeNull();
  });

  it("확인이 필요한 항목을 남긴다", async () => {
    const result = await new MockResearchProvider().researchTopic(input);

    expect(result.content.unknowns.length).toBeGreaterThan(0);
    expect(result.content.executiveSummary).toContain("Demo");
  });

  it("같은 입력이면 같은 결과를 낸다", async () => {
    const a = await new MockResearchProvider().researchTopic(input);
    const b = await new MockResearchProvider().researchTopic(input);

    expect(a.content).toStrictEqual(b.content);
  });

  it("429는 재시도 가능한 오류로 정규화된다", async () => {
    const provider = new MockResearchProvider({
      scenario: { failWith: { status: 429, retryAfterSeconds: 20 } },
    });

    await expect(provider.researchTopic(input)).rejects.toMatchObject({
      code: "PROVIDER_RATE_LIMITED",
      retryable: true,
    });
  });

  it("5xx는 재시도 후 성공한다", async () => {
    const provider = new MockResearchProvider({
      scenario: { failWith: { status: 503 }, failTimes: 2 },
    });

    const result = await withRetry(
      { maxAttempts: 3, baseDelayMs: 0, timeoutMs: 1000 },
      () => provider.researchTopic(input),
      async () => {},
    );

    expect(result.modelName).toBe("mock-research");
  });

  it("401은 재시도하지 않는다", async () => {
    const provider = new MockResearchProvider({ scenario: { failWith: { status: 401 } } });
    let attempts = 0;

    await expect(
      withRetry(
        { maxAttempts: 3, baseDelayMs: 0, timeoutMs: 1000 },
        () => {
          attempts += 1;
          return provider.researchTopic(input);
        },
        async () => {},
      ),
    ).rejects.toBeInstanceOf(DomainError);

    expect(attempts).toBe(1);
  });
});
