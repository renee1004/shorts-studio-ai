import { describe, expect, it, vi } from "vitest";
import { researchBriefContentSchema } from "@shorts-os/contracts";
import { LiveResearchProvider, buildPrompt, groundingCitations, mergeCitations, parseModelJson } from "./research";

const grounded = [
  { url: "https://a.example/1", title: "A", publisher: "a.example", publishedAt: null },
  { url: "https://b.example/2", title: "B", publisher: "b.example", publishedAt: null },
];

function content(overrides: Record<string, unknown> = {}) {
  return researchBriefContentSchema.parse({ executiveSummary: "요약", ...overrides });
}

describe("parseModelJson", () => {
  it("코드 펜스가 있어도 읽는다", () => {
    const parsed = parseModelJson('```json\n{"executiveSummary":"요약"}\n```');
    expect(parsed.executiveSummary).toBe("요약");
  });

  it("JSON이 아니면 Provider 오류로 만든다", () => {
    expect(() => parseModelJson("not json")).toThrowError(/JSON/);
  });

  it("Brief 형식이 아니면 거절한다", () => {
    expect(() => parseModelJson('{"wrong":1}')).toThrowError(/형식/);
  });
});

describe("groundingCitations", () => {
  it("groundingMetadata의 URL만 인용으로 인정한다", () => {
    const citations = groundingCitations({
      groundingMetadata: {
        groundingChunks: [
          { web: { uri: "https://a.example/1", title: "A", domain: "a.example" } },
          { web: { uri: "https://a.example/1", title: "중복", domain: "a.example" } },
          { web: {} },
        ],
      },
    });

    expect(citations).toHaveLength(1);
    expect(citations[0]?.url).toBe("https://a.example/1");
  });

  it("grounding이 없으면 빈 배열이다", () => {
    expect(groundingCitations(undefined)).toStrictEqual([]);
  });
});

describe("mergeCitations", () => {
  it("grounding이 없으면 모델이 적은 인용과 사실을 모두 버린다", () => {
    const merged = mergeCitations(
      content({
        citations: [{ url: "https://made-up.example", title: "환각", publisher: null, publishedAt: null }],
        keyFacts: [{ statement: "근거 없는 주장", citationIndexes: [0] }],
      }),
      [],
    );

    expect(merged.citations).toStrictEqual([]);
    expect(merged.keyFacts).toStrictEqual([]);
  });

  it("grounding에 있는 URL만 남기고 인덱스를 다시 매핑한다", () => {
    const merged = mergeCitations(
      content({
        citations: [
          { url: "https://made-up.example", title: "환각", publisher: null, publishedAt: null },
          { url: "https://b.example/2", title: "B", publisher: null, publishedAt: null },
        ],
        keyFacts: [
          { statement: "실제 근거", citationIndexes: [1] },
          { statement: "환각 근거", citationIndexes: [0] },
        ],
      }),
      grounded,
    );

    expect(merged.citations).toStrictEqual(grounded);
    expect(merged.keyFacts).toHaveLength(1);
    expect(merged.keyFacts[0]?.statement).toBe("실제 근거");
    // grounded 배열에서 b.example은 인덱스 1이다.
    expect(merged.keyFacts[0]?.citationIndexes).toStrictEqual([1]);
  });
});

describe("buildPrompt", () => {
  it("출처를 만들지 말라는 지시와 언어를 포함한다", () => {
    const prompt = buildPrompt({
      workspaceId: "ws",
      topicTitle: "연말정산",
      nicheName: "Money",
      angleHint: "초보자용",
      language: "ko",
      maxSources: 5,
    });

    expect(prompt).toContain("Never invent");
    expect(prompt).toContain("ko");
    expect(prompt).toContain("at most 5");
    expect(prompt).toContain("초보자용");
  });

  it("무료 초안에서는 검색과 출처 생성을 요구하지 않는다", () => {
    const prompt = buildPrompt(
      {
        workspaceId: "ws",
        topicTitle: "업무 자동화",
        nicheName: "Work",
        angleHint: null,
        language: "ko",
        maxSources: 5,
      },
      false,
    );

    expect(prompt).toContain("Do not use web search");
    expect(prompt).toContain("empty keyFacts and citations arrays");
  });
});


describe("research request budget", () => {
  const input = { workspaceId: "ws", topicTitle: "work", nicheName: "Work", angleHint: null, language: "ko", maxSources: 5 };
  it("allows responses beyond the old 15 second limit", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 20_000);
          init?.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("aborted")); }, { once: true });
        });
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"executiveSummary":"summary"}' }] } }] }));
      });
      const provider = new LiveResearchProvider({ apiKey: "test", modelName: "test", retry: { timeoutMs: 15000, maxAttempts: 3, baseDelayMs: 0 }, fetchImpl });
      const result = provider.researchTopic(input);
      await vi.advanceTimersByTimeAsync(20_000);
      await expect(result).resolves.toBeDefined();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it("does not resubmit a timed-out paid request", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    const provider = new LiveResearchProvider({ apiKey: "test", modelName: "test", timeoutMs: 5, retry: { timeoutMs: 15000, maxAttempts: 3, baseDelayMs: 0 }, fetchImpl });
    await expect(provider.researchTopic(input)).rejects.toMatchObject({ code: "PROVIDER_TIMEOUT" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
