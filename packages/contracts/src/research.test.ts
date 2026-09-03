import { describe, expect, it } from "vitest";
import {
  citationCoverage,
  dropUngroundedFacts,
  researchBriefContentSchema,
  type ResearchBriefContent,
} from "./research";

function brief(overrides: Partial<ResearchBriefContent> = {}): ResearchBriefContent {
  return researchBriefContentSchema.parse({
    executiveSummary: "요약",
    ...overrides,
  });
}

const citation = {
  url: "https://example.com/a",
  title: "A",
  publisher: null,
  publishedAt: null,
};

describe("citationCoverage", () => {
  it("사실 항목이 없으면 계산하지 않고 null을 준다", () => {
    expect(citationCoverage(brief())).toBeNull();
  });

  it("모든 사실이 실제 citation을 가리키면 100이다", () => {
    const content = brief({
      citations: [citation],
      keyFacts: [{ statement: "사실", citationIndexes: [0] }],
    });

    expect(citationCoverage(content)).toBe(100);
  });

  it("존재하지 않는 인덱스는 근거로 세지 않는다", () => {
    const content = brief({
      citations: [citation],
      keyFacts: [
        { statement: "근거 있음", citationIndexes: [0] },
        { statement: "근거 없음", citationIndexes: [7] },
      ],
    });

    expect(citationCoverage(content)).toBe(50);
  });
});

describe("dropUngroundedFacts", () => {
  it("근거 없는 주장은 저장하지 않는다", () => {
    const content = brief({
      citations: [citation],
      keyFacts: [
        { statement: "유지", citationIndexes: [0] },
        { statement: "삭제", citationIndexes: [3] },
      ],
    });

    const cleaned = dropUngroundedFacts(content);

    expect(cleaned.keyFacts).toHaveLength(1);
    expect(cleaned.keyFacts[0]?.statement).toBe("유지");
    expect(citationCoverage(cleaned)).toBe(100);
  });
});
