import {
  QA_RULE_VERSION,
  type FactualClaim,
  type QaCheckResult,
  type QaCheckType,
  type StructuredScript,
} from "@shorts-os/contracts";
import { maxOverlap, policyRiskPhrases } from "./overlap";

export type QaInput = {
  scriptText: string;
  structured: StructuredScript;
  claims: FactualClaim[];
  citationCount: number;
  targetDurationSeconds: number;
  estimatedDurationSeconds: number;
  referenceTexts: string[];
  hasBrandProfile: boolean;
  checks: QaCheckType[];
};

const ORIGINALITY_WARN = 0.18;
const ORIGINALITY_FAIL = 0.42;
const DURATION_WARN = 0.1;
const DURATION_FAIL = 0.25;

export function runQaChecks(input: QaInput): QaCheckResult[] {
  return input.checks.map((type) => {
    switch (type) {
      case "fact":
        return factCheck(input);
      case "originality":
        return originalityCheck(input);
      case "policy":
        return policyCheck(input);
      case "brand":
        return brandCheck(input);
      case "duration":
        return durationCheck(input);
      case "caption_readability":
        return captionCheck(input);
    }
  });
}

export function qaHasBlocker(checks: QaCheckResult[]): boolean {
  return checks.some((check) => check.severity === "blocker");
}

function factCheck(input: QaInput): QaCheckResult {
  const findings: QaCheckResult["findings"] = [];
  for (const claim of input.claims) {
    const grounded =
      !claim.unverified &&
      claim.citationIndexes.some((index) => index >= 0 && index < input.citationCount);
    if (!grounded && !claim.unverified) {
      findings.push({
        code: "CLAIM_UNMAPPED",
        message: "사실 주장에 출처도 미확인 표시도 없습니다.",
        evidence: claim.statement,
        suggestedFix: "출처를 연결하거나 미확인으로 표시하세요.",
      });
    } else if (claim.unverified) {
      findings.push({
        code: "CLAIM_UNVERIFIED",
        message: "이 주장은 출처가 없어 미확인입니다.",
        evidence: claim.statement,
      });
    }
  }

  const unmapped = findings.some((finding) => finding.code === "CLAIM_UNMAPPED");
  const unverified = findings.some((finding) => finding.code === "CLAIM_UNVERIFIED");
  return {
    type: "fact",
    result: unmapped ? "fail" : unverified ? "warn" : "pass",
    score: unmapped ? 20 : unverified ? 55 : 95,
    severity: unmapped ? "blocker" : unverified ? "medium" : "info",
    findings,
  };
}

function originalityCheck(input: QaInput): QaCheckResult {
  const overlap = maxOverlap(input.scriptText, input.referenceTexts);
  const findings: QaCheckResult["findings"] = [
    {
      code: "NGRAM_OVERLAP",
      message: `참고 텍스트와의 3-gram 겹침은 ${Math.round(overlap * 100)}%입니다. 법률 판단이 아닙니다.`,
      evidence: `jaccard=${overlap}`,
    },
    {
      code: "SEMANTIC_REVIEW_SKIPPED",
      message: "Demo Mode에서는 의미 유사도 모델을 호출하지 않습니다.",
    },
  ];

  if (overlap >= ORIGINALITY_FAIL) {
    return {
      type: "originality",
      result: "fail",
      score: 25,
      severity: "blocker",
      findings: [
        ...findings,
        {
          code: "COPY_RISK",
          message: "문장 겹침이 높아 승인할 수 없습니다. 서술과 순서를 다시 쓰세요.",
        },
      ],
    };
  }

  if (overlap >= ORIGINALITY_WARN) {
    return {
      type: "originality",
      result: "warn",
      score: 60,
      severity: "medium",
      findings,
    };
  }

  return { type: "originality", result: "pass", score: 88, severity: "info", findings };
}

function policyCheck(input: QaInput): QaCheckResult {
  const hits = policyRiskPhrases(input.scriptText);
  if (hits.length > 0) {
    return {
      type: "policy",
      result: "fail",
      score: 15,
      severity: "blocker",
      findings: [
        {
          code: "UNSUPPORTED_EARNINGS",
          message: "근거 없는 수익·성과 표현이 있어 승인을 막습니다.",
          evidence: hits.join(", "),
          suggestedFix: "수치와 보장을 삭제하거나 출처가 있는 주장만 남기세요.",
        },
      ],
    };
  }
  return {
    type: "policy",
    result: "pass",
    score: 92,
    severity: "info",
    findings: [{ code: "POLICY_TEMPLATE", message: "과장 수익 표현은 검출되지 않았습니다." }],
  };
}

function brandCheck(input: QaInput): QaCheckResult {
  if (!input.hasBrandProfile) {
    return {
      type: "brand",
      result: "not_run",
      score: null,
      severity: "info",
      findings: [
        {
          code: "NO_BRAND_PROFILE",
          message: "브랜드 프로필이 없어 Brand QA를 건너뜁니다.",
        },
      ],
    };
  }
  return { type: "brand", result: "pass", score: 80, severity: "info", findings: [] };
}

function durationCheck(input: QaInput): QaCheckResult {
  const delta =
    Math.abs(input.estimatedDurationSeconds - input.targetDurationSeconds) /
    input.targetDurationSeconds;
  if (delta > DURATION_FAIL) {
    return {
      type: "duration",
      result: "fail",
      score: 30,
      severity: "high",
      findings: [
        {
          code: "DURATION_OFF",
          message: `추정 ${input.estimatedDurationSeconds}초, 목표 ${input.targetDurationSeconds}초로 오차가 큽니다.`,
        },
      ],
    };
  }
  if (delta > DURATION_WARN) {
    return {
      type: "duration",
      result: "warn",
      score: 65,
      severity: "low",
      findings: [
        {
          code: "DURATION_DRIFT",
          message: `추정 ${input.estimatedDurationSeconds}초로 목표 ±10%를 벗어났습니다.`,
        },
      ],
    };
  }
  return { type: "duration", result: "pass", score: 90, severity: "info", findings: [] };
}

function captionCheck(input: QaInput): QaCheckResult {
  const long = input.structured.beats.filter((beat) => beat.onScreenText.length > 36);
  if (long.length > 0) {
    return {
      type: "caption_readability",
      result: "warn",
      score: 58,
      severity: "low",
      findings: long.map((beat) => ({
        code: "CAPTION_TOO_LONG",
        message: "화면 문구가 길어 모바일에서 읽기 어렵습니다.",
        evidence: beat.onScreenText,
      })),
    };
  }
  return { type: "caption_readability", result: "pass", score: 91, severity: "info", findings: [] };
}

export const qaRuleVersion = QA_RULE_VERSION;
