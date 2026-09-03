import {
  ANGLE_PROMPT_VERSION,
  DNA_PROMPT_VERSION,
  SCRIPT_PROMPT_VERSION,
  dnaPatternContentSchema,
  structuredScriptSchema,
  type ContentAngleDraft,
} from "@shorts-os/contracts";
import { estimateSpokenSeconds } from "@shorts-os/domain";
import { normalizeProviderError } from "../errors";
import type {
  AngleGeneratorInput,
  ContentStudioProvider,
  DnaAnalyzerInput,
  DnaAnalyzerResult,
  ScriptGeneratorInput,
} from "../interfaces";

export type MockStudioScenario = {
  failWith?: { status?: number; code?: string; retryAfterSeconds?: number };
  failTimes?: number;
};

/**
 * Phase 3 Demo Provider.
 *
 * - 대본이 입력에 없으면 transcript evidence를 만들지 않고, 대본을 봤다고 쓰지 않는다.
 * - 출처가 없으면 사실 주장에 unverified를 붙인다. URL을 만들지 않는다.
 * - 문장을 복제하지 않고 Hook 유형·정보 배열 같은 추상 패턴만 남긴다.
 */
export class MockContentStudioProvider implements ContentStudioProvider {
  readonly kind = "gemini" as const;
  readonly mode = "mock" as const;

  private failureCount = 0;

  constructor(private readonly options: { scenario?: MockStudioScenario } = {}) {}

  private maybeFail(): void {
    const scenario = this.options.scenario;
    if (!scenario?.failWith) return;
    const limit = scenario.failTimes ?? Number.POSITIVE_INFINITY;
    if (this.failureCount >= limit) return;
    this.failureCount += 1;
    throw normalizeProviderError({
      provider: "gemini",
      ...scenario.failWith,
      message: "Mock Content Studio 오류",
    });
  }

  async analyzeDna(input: DnaAnalyzerInput): Promise<DnaAnalyzerResult> {
    this.maybeFail();
    const transcriptIncluded = Boolean(input.transcript && input.transcript.trim().length > 0);
    const durationHint =
      input.durationSeconds !== null ? `${input.durationSeconds}초 공개 길이` : "길이 정보 없음";

    const evidence: Array<{
      evidenceType: "public_metadata" | "user_supplied_transcript";
      field: string;
      note: string;
    }> = [
      {
        evidenceType: "public_metadata",
        field: "title",
        note: "제목에서 문제 제기 또는 결과 약속 유형을 분류했습니다. 원문 문장은 복제하지 않습니다.",
      },
      {
        evidenceType: "public_metadata",
        field: "duration",
        note: durationHint,
      },
    ];

    if (transcriptIncluded) {
      evidence.push({
        evidenceType: "user_supplied_transcript",
        field: "transcript",
        note: "사용자가 제공한 대본이 있어 정보 배열만 추상화했습니다. 고유 표현은 저장하지 않습니다.",
      });
    }

    const content = dnaPatternContentSchema.parse({
      patternType: "hook_pacing_cta",
      name: transcriptIncluded
        ? "사용자 대본 기반 구조 패턴"
        : "공개 메타데이터 기반 구조 패턴",
      abstractionLevel: "structural",
      structuredPattern: {
        hookCategory: "problem_promise",
        pacing: input.durationSeconds !== null && input.durationSeconds <= 60 ? "front_loaded" : "steady",
        beatPurposes: ["hook", "context", "one_step", "cta"],
        informationOrder: ["problem", "mechanism", "proof_gap", "next_action"],
        emotionalCurve: "curiosity_to_clarity",
        ctaCategory: "save_or_try",
        visualChangeRhythm: null,
        hypotheses: [
          "초반 3초에 시청자 작업을 지칭하면 유지율이 나을 수 있습니다. 가설이며 성과 데이터가 아닙니다.",
        ],
        transcriptIncluded,
      },
      evidence,
      confidenceScore: transcriptIncluded ? 62 : 38,
      safeToReuse: true,
    });

    return {
      content,
      modelName: "mock-dna",
      promptVersion: DNA_PROMPT_VERSION,
      mode: "mock",
    };
  }

  async generateAngles(input: AngleGeneratorInput) {
    this.maybeFail();
    const evidenceCoverage = input.keyFacts.some((fact) => !fact.unverified) ? 55 : 12;

    const angles: ContentAngleDraft[] = [
      {
        title: `${input.topicTitle} · 한 가지 실수`,
        hook: `${input.topicTitle}에서 사람들이 반복하는 한 가지`,
        promise: "한 장면으로 실패 지점만 보여줍니다.",
        outline: ["문제 장면", "왜 반복되는지", "다음에 바꿀 한 가지"],
        noveltyRationale: "실패 패턴을 분해합니다. 참고 영상의 문장이나 순서를 따르지 않습니다.",
        expectedClaimKeys: input.keyFacts.slice(0, 2).map((fact) =>
          fact.statement.slice(0, 24).replace(/\s+/g, "_"),
        ),
        scoreBreakdown: {
          hookStrength: 78,
          audienceFit: 74,
          novelty: 70,
          evidenceCoverage,
          productionFeasibility: 82,
          policySafety: 88,
          notes: {
            evidenceCoverage: "Demo Brief에는 확인된 출처가 거의 없습니다.",
          },
        },
      },
      {
        title: `${input.topicTitle} · 60초 절차`,
        hook: `${input.targetDurationSeconds}초 안에 끝내는 절차`,
        promise: "순서를 세 단계로 압축합니다.",
        outline: ["목표 한 줄", "세 단계", "빠뜨리면 안 되는 확인"],
        noveltyRationale: "절차를 재구성합니다. 수치를 새로 만들지 않습니다.",
        expectedClaimKeys: [],
        scoreBreakdown: {
          hookStrength: 72,
          audienceFit: 80,
          novelty: 64,
          evidenceCoverage,
          productionFeasibility: 86,
          policySafety: 90,
          notes: {},
        },
      },
      {
        title: `${input.topicTitle} · 질문으로 시작`,
        hook: "이 작업을 아직도 손으로 하고 있습니까",
        promise: "시청자 질문으로 시작하고 한 가지 실험만 제안합니다.",
        outline: ["질문", "흔한 오해", "실험 한 가지"],
        noveltyRationale: "질문 각도는 참고 영상의 훅을 복제하지 않습니다.",
        expectedClaimKeys: [],
        scoreBreakdown: {
          hookStrength: 81,
          audienceFit: 71,
          novelty: 76,
          evidenceCoverage,
          productionFeasibility: 80,
          policySafety: 87,
          notes: {},
        },
      },
    ];

    return {
      angles,
      modelName: "mock-angles",
      promptVersion: ANGLE_PROMPT_VERSION,
      mode: "mock" as const,
    };
  }

  async generateScript(input: ScriptGeneratorInput) {
    this.maybeFail();
    const facts = input.keyFacts.slice(0, 3);
    const unverifiedOnly = facts.length === 0;

    const claims = unverifiedOnly
      ? [
          {
            claimKey: "structure_only",
            statement: `${input.topicTitle}의 공개 자료는 Demo에서 확인하지 못했습니다.`,
            unverified: true,
            citationIndexes: [] as number[],
          },
        ]
      : facts.map((fact, index) => ({
          claimKey: fact.claimKey || `fact_${index + 1}`,
          statement: fact.statement,
          unverified: fact.unverified || input.citationCount === 0,
          citationIndexes:
            !fact.unverified && input.citationCount > 0 ? [Math.min(index, input.citationCount - 1)] : [],
        }));

    const beats = [
      {
        beatId: "b1",
        startSeconds: 0,
        endSeconds: 5,
        purpose: "hook",
        narration: input.angle.hook,
        onScreenText: input.angle.title.slice(0, 28),
        claimKeys: [] as string[],
      },
      {
        beatId: "b2",
        startSeconds: 5,
        endSeconds: 18,
        purpose: "context",
        narration: input.angle.promise,
        onScreenText: "한 가지 약속",
        claimKeys: claims[0] ? [claims[0].claimKey] : [],
      },
      {
        beatId: "b3",
        startSeconds: 18,
        endSeconds: 34,
        purpose: "one_step",
        narration: input.angle.outline[1] ?? "다음 한 단계를 보여줍니다.",
        onScreenText: "다음 한 단계",
        claimKeys: claims.slice(1, 2).map((claim) => claim.claimKey),
      },
      {
        beatId: "b4",
        startSeconds: 34,
        endSeconds: Math.max(40, Math.min(input.targetDurationSeconds, 55)),
        purpose: "cta",
        narration: "저장해 두고 내일 한 가지만 바꿔 보세요.",
        onScreenText: "저장",
        claimKeys: [],
      },
    ];

    const scriptText = beats.map((beat) => beat.narration).join(" ");
    const structured = structuredScriptSchema.parse({
      title: input.angle.title,
      hook: input.angle.hook,
      targetDurationSeconds: input.targetDurationSeconds,
      beats,
      cta: { type: "save", text: "저장해 두고 내일 한 가지만 바꿔 보세요." },
      factualClaims: claims,
      estimatedDurationSeconds: estimateSpokenSeconds(scriptText),
    });

    return {
      structured,
      modelName: "mock-script",
      promptVersion: SCRIPT_PROMPT_VERSION,
      mode: "mock" as const,
    };
  }
}
