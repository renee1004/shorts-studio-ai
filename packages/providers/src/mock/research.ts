import { RESEARCH_PROMPT_VERSION, researchBriefContentSchema } from "@shorts-os/contracts";
import { normalizeProviderError } from "../errors";
import type { ResearchProvider, ResearchTopicInput, ResearchTopicResult } from "../interfaces";

export type MockResearchScenario = {
  failWith?: { status?: number; code?: string; retryAfterSeconds?: number };
  failTimes?: number;
};

export type MockResearchOptions = {
  scenario?: MockResearchScenario;
};

/**
 * Key 없이 Research 흐름을 끝까지 돌리기 위한 Mock.
 *
 * 출처를 만들지 않는다. 웹을 읽지 않았으므로 citations는 항상 비어 있고,
 * 사실 주장도 만들지 않는다. 대신 무엇을 확인해야 하는지 unknowns에 남긴다.
 * 화면은 mode="mock"을 보고 "근거 없음"을 표시한다. (스펙 Master Prompt: 인용을 조작하지 않는다)
 */
export class MockResearchProvider implements ResearchProvider {
  readonly kind = "gemini" as const;
  readonly mode = "mock" as const;

  private failureCount = 0;

  constructor(private readonly options: MockResearchOptions = {}) {}

  private maybeFail(): void {
    const scenario = this.options.scenario;
    if (!scenario?.failWith) return;
    const limit = scenario.failTimes ?? Number.POSITIVE_INFINITY;
    if (this.failureCount >= limit) return;
    this.failureCount += 1;
    throw normalizeProviderError({
      provider: "gemini",
      ...scenario.failWith,
      message: "Mock Gemini 오류",
    });
  }

  async researchTopic(input: ResearchTopicInput): Promise<ResearchTopicResult> {
    this.maybeFail();

    const content = researchBriefContentSchema.parse({
      executiveSummary: [
        `"${input.topicTitle}" 기획을 위한 Demo Brief입니다.`,
        `분야는 ${input.nicheName}이고 출력 언어는 ${input.language}입니다.`,
        "Demo Mode에서는 웹을 읽지 않으므로 사실 주장과 출처를 만들지 않습니다.",
        "GEMINI_API_KEY를 넣고 APP_MODE=live로 두면 같은 코드가 Search Grounding 결과로 채웁니다.",
      ].join(" "),
      keyFacts: [],
      audienceInsights: [
        `${input.nicheName} 시청자가 이 주제를 검색하는 이유를 실제 자료로 확인해야 합니다.`,
      ],
      angles: [
        {
          title: input.angleHint ?? `${input.topicTitle} 기본 구성`,
          hook: `${input.topicTitle}을 60초로 압축하면 무엇을 먼저 말해야 하는가`,
          why: "구성 틀만 제시합니다. 근거는 Live 모드에서 채워집니다.",
        },
      ],
      counterpoints: [],
      unknowns: [
        "핵심 사실과 수치: Demo Mode에서는 확인할 수 없습니다.",
        `출처 ${input.maxSources}건: Live 모드에서 Search Grounding으로 수집합니다.`,
      ],
      citations: [],
    });

    return {
      content,
      modelName: "mock-research",
      promptVersion: RESEARCH_PROMPT_VERSION,
      mode: "mock",
    };
  }
}
