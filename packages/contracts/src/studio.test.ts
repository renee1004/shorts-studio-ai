import { describe, expect, it } from "vitest";
import {
  claimsHaveCitationOrFlag,
  normalizeFactualClaims,
  parseYouTubeVideoId,
  type FactualClaim,
} from "./studio";

describe("parseYouTubeVideoId", () => {
  it("watch·shorts·youtu.be와 11자 ID를 인식한다", () => {
    expect(parseYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9wgGcQ")).toBe("dQw4w9wgGcQ");
    expect(parseYouTubeVideoId("https://youtu.be/dQw4w9wgGcQ")).toBe("dQw4w9wgGcQ");
    expect(parseYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9wgGcQ")).toBe("dQw4w9wgGcQ");
    expect(parseYouTubeVideoId("dQw4w9wgGcQ")).toBe("dQw4w9wgGcQ");
  });

  it("영상 ID가 아니면 null이다", () => {
    expect(parseYouTubeVideoId("https://example.com/watch?v=dQw4w9wgGcQ")).toBeNull();
    expect(parseYouTubeVideoId("nope")).toBeNull();
  });
});

describe("factual claims", () => {
  const claim = (overrides: Partial<FactualClaim>): FactualClaim => ({
    claimKey: "c1",
    statement: "주장",
    unverified: false,
    citationIndexes: [],
    sourceIds: [],
    ...overrides,
  });

  it("출처가 없으면 미확인으로 표시하고 버린다기보다 남긴다", () => {
    const normalized = normalizeFactualClaims(
      [claim({ citationIndexes: [0], unverified: false })],
      0,
    );
    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.unverified).toBe(true);
    expect(normalized[0]?.citationIndexes).toEqual([]);
  });

  it("존재하는 출처 인덱스는 유지하고 미확인을 끈다", () => {
    const normalized = normalizeFactualClaims(
      [claim({ citationIndexes: [0, 9], unverified: true })],
      1,
    );
    expect(normalized[0]?.unverified).toBe(false);
    expect(normalized[0]?.citationIndexes).toEqual([0]);
  });

  it("출처도 미확인 표시도 없으면 계약 위반이다", () => {
    expect(
      claimsHaveCitationOrFlag([claim({ unverified: false, citationIndexes: [] })]),
    ).toBe(false);
    expect(
      claimsHaveCitationOrFlag([claim({ unverified: true, citationIndexes: [] })]),
    ).toBe(true);
  });
});
