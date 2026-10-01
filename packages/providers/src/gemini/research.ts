import { DomainError } from "@shorts-os/domain";
import {
  RESEARCH_PROMPT_VERSION,
  dropUngroundedFacts,
  researchBriefContentSchema,
  type Citation,
  type ResearchBriefContent,
} from "@shorts-os/contracts";
import {
  normalizeProviderError,
  withTimeout,
  type RetryPolicy,
} from "../errors";
import type {
  ResearchProvider,
  ResearchTopicInput,
  ResearchTopicResult,
} from "../interfaces";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export type LiveResearchOptions = {
  apiKey: string;
  /** 모델명은 설정값이다. 코드에 고정하지 않는다. */
  modelName: string;
  /** Google Search quota가 없는 개발 환경에서는 false로 두고 미확인 초안만 만든다. */
  useSearchGrounding?: boolean;
  retry: RetryPolicy;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type GeminiCandidate = {
  finishReason?: string;
  content?: { parts?: { text?: string; thought?: boolean }[] };
  groundingMetadata?: {
    groundingChunks?: {
      web?: { uri?: string; title?: string; domain?: string };
    }[];
  };
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
};

/**
 * Gemini Search Grounding으로 Research Brief를 만든다. (Phase 2A)
 *
 * 모델이 만든 문장은 groundingMetadata의 실제 URL과 대조한 것만 남긴다.
 * 인용을 만들어내지 않는 것이 이 어댑터의 유일한 불변식이다.
 */
export class LiveResearchProvider implements ResearchProvider {
  readonly kind = "gemini" as const;
  readonly mode = "live" as const;

  constructor(private readonly options: LiveResearchOptions) {}

  async researchTopic(input: ResearchTopicInput): Promise<ResearchTopicResult> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const url = new URL(
      `${API_BASE}/models/${this.options.modelName}:generateContent`,
    );

    const useSearchGrounding = this.options.useSearchGrounding ?? true;
    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: buildPrompt(input, useSearchGrounding) }],
        },
      ],
      ...(useSearchGrounding ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    };

    const body = await withTimeout(
      this.options.timeoutMs ?? 120_000,
      "gemini",
      async (signal) => {
        const response = await fetchImpl(url, {
          method: "POST",
          signal,
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            "x-goog-api-key": this.options.apiKey,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const error = (await response
            .json()
            .catch(() => ({}))) as GeminiResponse;
          const retryAfter = Number(response.headers.get("retry-after") ?? "");
          throw normalizeProviderError({
            provider: "gemini",
            status: response.status,
            ...(error.error?.status ? { code: error.error.status } : {}),
            ...(error.error?.message ? { message: error.error.message } : {}),
            ...(Number.isFinite(retryAfter)
              ? { retryAfterSeconds: retryAfter }
              : {}),
          });
        }

        return (await response.json()) as GeminiResponse;
      },
    );

    const candidate = body.candidates?.[0];
    const text =
      candidate?.content?.parts
        ?.filter((part) => !part.thought)
        .map((part) => part.text ?? "")
        .join("") ?? "";
    const reason = body.promptFeedback?.blockReason ?? candidate?.finishReason;
    // Never log generated text, prompts, credentials, or free-form provider messages.
    const safeReason =
      typeof reason === "string" && /^[A-Z_]{1,64}$/.test(reason)
        ? reason
        : "UNKNOWN";
    if (
      body.promptFeedback?.blockReason ||
      (reason && reason !== "STOP") ||
      !text.trim()
    ) {
      const tokenCounts: Record<string, number> = {};
      for (const key of [
        "promptTokenCount",
        "candidatesTokenCount",
        "thoughtsTokenCount",
        "totalTokenCount",
      ] as const) {
        const count = body.usageMetadata?.[key];
        if (typeof count === "number" && Number.isFinite(count) && count >= 0)
          tokenCounts[key] = count;
      }
      const message =
        safeReason === "MAX_TOKENS"
          ? "Gemini 조사 응답이 출력 한도에 도달해 완성되지 않았습니다."
          : safeReason === "UNKNOWN"
            ? `Gemini 조사 응답에 ${body.candidates?.length ? "읽을 수 있는 본문" : "결과 후보"}가 없습니다. 종료 정보도 없어 원인을 확정할 수 없습니다. NotebookLM 원문 가져오기로 조사를 건너뛸 수 있습니다.`
            : `Gemini가 완성된 조사 결과를 반환하지 않았습니다 (종료 사유: ${safeReason}).`;
      throw new DomainError("PROVIDER_UNAVAILABLE", message, {
        retryable: false,
        details: {
          provider: "gemini",
          providerCode: "INCOMPLETE_RESPONSE",
          model: this.options.modelName,
          finishReason: safeReason,
          candidateCount: body.candidates?.length ?? 0,
          searchGrounding: useSearchGrounding,
          ...tokenCounts,
        },
      });
    }

    const grounded = groundingCitations(candidate);
    const parsed = parseModelJson(text);
    const content = useSearchGrounding
      ? mergeCitations(parsed, grounded)
      : {
          ...parsed,
          citations: [],
          keyFacts: [],
          unknowns: [
            ...new Set([
              ...parsed.unknowns,
              "Google 검색을 사용하지 않은 무료 초안입니다. 게시 전에 사실과 최신 정보를 직접 확인하세요.",
            ]),
          ],
        };

    return {
      // 근거를 붙이지 못한 주장은 저장하지 않는다.
      content: dropUngroundedFacts(content),
      modelName: this.options.modelName,
      promptVersion: useSearchGrounding
        ? RESEARCH_PROMPT_VERSION
        : `${RESEARCH_PROMPT_VERSION}.ungrounded`,
      mode: "live",
    };
  }
}

export function buildPrompt(
  input: ResearchTopicInput,
  useSearchGrounding = true,
): string {
  return [
    "You are a research analyst preparing a short-form video brief.",
    useSearchGrounding
      ? "Use Google Search grounding. Every factual claim must come from a source you actually retrieved."
      : "Do not use web search. Create a clearly unverified planning draft from general knowledge only.",
    useSearchGrounding
      ? "If you cannot ground a claim, omit it and list it under unknowns instead."
      : "Return empty keyFacts and citations arrays. Put every fact that needs verification under unknowns.",
    "Never invent statistics, revenue figures, CPC values, or URLs.",
    "",
    `Topic: ${input.topicTitle}`,
    `Niche: ${input.nicheName}`,
    input.angleHint ? `Angle hint: ${input.angleHint}` : "",
    `Write executiveSummary, audienceInsights, angles, counterpoints and unknowns in ${input.language}.`,
    `Cite at most ${input.maxSources} sources.`,
    "",
    "Return only JSON with this shape:",
    JSON.stringify(
      {
        executiveSummary: "string",
        keyFacts: [{ statement: "string", citationIndexes: [0] }],
        audienceInsights: ["string"],
        angles: [{ title: "string", hook: "string", why: "string" }],
        counterpoints: ["string"],
        unknowns: ["string"],
        citations: [
          {
            url: "string",
            title: "string",
            publisher: "string|null",
            publishedAt: null,
          },
        ],
      },
      null,
      2,
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

/** 모델이 코드 펜스를 붙여도 파싱한다. 형식이 깨지면 조용히 넘기지 않고 오류로 만든다. */
export function parseModelJson(text: string): ResearchBriefContent {
  const withoutFence = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  let raw: unknown;
  try {
    raw = JSON.parse(withoutFence);
  } catch {
    throw normalizeProviderError({
      provider: "gemini",
      code: "INVALID_JSON",
      message: "Gemini 응답을 JSON으로 읽을 수 없습니다.",
    });
  }

  const parsed = researchBriefContentSchema.safeParse(raw);
  if (!parsed.success) {
    throw normalizeProviderError({
      provider: "gemini",
      code: "SCHEMA_MISMATCH",
      message: `Gemini 응답이 Brief 형식과 다릅니다: ${parsed.error.issues[0]?.message ?? ""}`,
    });
  }

  return parsed.data;
}

/** groundingMetadata에 실제로 들어온 URL만 인용으로 인정한다. */
export function groundingCitations(
  candidate: GeminiCandidate | undefined,
): Citation[] {
  const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
  const seen = new Set<string>();
  const citations: Citation[] = [];

  for (const chunk of chunks) {
    const uri = chunk.web?.uri;
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    citations.push({
      url: uri,
      title: chunk.web?.title ?? uri,
      publisher: chunk.web?.domain ?? null,
      publishedAt: null,
    });
  }

  return citations;
}

/**
 * 모델이 적어낸 citations 중 grounding에 없는 URL은 버리고,
 * keyFacts의 인덱스를 살아남은 인용 위치로 다시 매핑한다.
 */
export function mergeCitations(
  content: ResearchBriefContent,
  grounded: Citation[],
): ResearchBriefContent {
  if (grounded.length === 0) {
    return { ...content, citations: [], keyFacts: [] };
  }

  const indexByUrl = new Map(
    grounded.map((citation, index) => [citation.url, index]),
  );

  const keyFacts = content.keyFacts
    .map((fact) => {
      const remapped = fact.citationIndexes
        .map((index) => content.citations[index]?.url)
        .filter((url): url is string => url !== undefined)
        .map((url) => indexByUrl.get(url))
        .filter((index): index is number => index !== undefined);

      return {
        statement: fact.statement,
        citationIndexes: [...new Set(remapped)],
      };
    })
    .filter((fact) => fact.citationIndexes.length > 0);

  return { ...content, citations: grounded, keyFacts };
}
