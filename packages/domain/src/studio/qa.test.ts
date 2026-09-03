import { describe, expect, it } from "vitest";
import { structuredScriptSchema, type FactualClaim } from "@shorts-os/contracts";
import { qaHasBlocker, runQaChecks } from "./qa";

const structured = structuredScriptSchema.parse({
  title: "t",
  hook: "hook line here",
  targetDurationSeconds: 45,
  beats: [
    {
      beatId: "b1",
      startSeconds: 0,
      endSeconds: 5,
      purpose: "hook",
      narration: "hook",
      onScreenText: "OK",
      claimKeys: [],
    },
    {
      beatId: "b2",
      startSeconds: 5,
      endSeconds: 20,
      purpose: "cta",
      narration: "cta",
      onScreenText: "SAVE",
      claimKeys: [],
    },
  ],
  cta: { type: "save", text: "save" },
  factualClaims: [],
  estimatedDurationSeconds: 40,
});

describe("runQaChecks", () => {
  it("매핑되지 않은 사실 주장은 blocker다", () => {
    const claims: FactualClaim[] = [
      {
        claimKey: "c1",
        statement: "사실",
        unverified: false,
        citationIndexes: [],
        sourceIds: [],
      },
    ];
    const checks = runQaChecks({
      scriptText: "original narration about a unique workflow",
      structured,
      claims,
      citationCount: 0,
      targetDurationSeconds: 45,
      estimatedDurationSeconds: 40,
      referenceTexts: ["unrelated cooking show title"],
      hasBrandProfile: false,
      checks: ["fact"],
    });
    expect(qaHasBlocker(checks)).toBe(true);
    expect(checks[0]?.severity).toBe("blocker");
  });

  it("미확인 표시가 있으면 경고만 한다", () => {
    const checks = runQaChecks({
      scriptText: "original narration about a unique workflow",
      structured,
      claims: [
        {
          claimKey: "c1",
          statement: "사실",
          unverified: true,
          citationIndexes: [],
          sourceIds: [],
        },
      ],
      citationCount: 0,
      targetDurationSeconds: 45,
      estimatedDurationSeconds: 40,
      referenceTexts: [],
      hasBrandProfile: false,
      checks: ["fact"],
    });
    expect(qaHasBlocker(checks)).toBe(false);
    expect(checks[0]?.result).toBe("warn");
  });

  it("높은 n-gram 겹침은 승인을 막는다", () => {
    const copied = "client onboarding in 60 seconds with AI automation weekly";
    const checks = runQaChecks({
      scriptText: copied,
      structured,
      claims: [],
      citationCount: 0,
      targetDurationSeconds: 45,
      estimatedDurationSeconds: 40,
      referenceTexts: [copied],
      hasBrandProfile: false,
      checks: ["originality"],
    });
    expect(qaHasBlocker(checks)).toBe(true);
  });

  it("수익 보장은 policy blocker다", () => {
    const checks = runQaChecks({
      scriptText: "이 방법으로 수익 보장합니다",
      structured,
      claims: [],
      citationCount: 0,
      targetDurationSeconds: 45,
      estimatedDurationSeconds: 40,
      referenceTexts: [],
      hasBrandProfile: false,
      checks: ["policy"],
    });
    expect(checks[0]?.severity).toBe("blocker");
  });
});
