import { describe, expect, it } from "vitest";
import { breakoutRatio, classifyShort, median, normalizeVelocity, videoAgeHours, viewVelocity } from "./velocity";

describe("view velocity", () => {
  it("조회수가 없으면 null을 돌려준다", () => {
    expect(viewVelocity(null, 10)).toBeNull();
  });

  it("나이를 최소 1시간으로 보정한다", () => {
    expect(viewVelocity(1000, 0)).toBe(1000);
    expect(viewVelocity(1000, 0.2)).toBe(1000);
  });

  it("게시 시각으로 나이를 계산한다", () => {
    const now = new Date("2026-09-03T12:00:00Z");
    expect(videoAgeHours(new Date("2026-09-03T00:00:00Z"), now)).toBe(12);
  });
});

describe("breakout ratio", () => {
  it("비교군이 5개 미만이면 신뢰할 수 없다고 표시한다", () => {
    const result = breakoutRatio(200, [100, 100, 100]);
    expect(result.ratio).toBe(2);
    expect(result.reliable).toBe(false);
  });

  it("비교군이 충분하면 신뢰 가능으로 표시한다", () => {
    const result = breakoutRatio(300, [100, 120, 90, 110, 100, 95]);
    expect(result.reliable).toBe(true);
    expect(result.ratio).toBeGreaterThan(2);
  });

  it("비교군이 없으면 비율을 만들지 않는다", () => {
    expect(breakoutRatio(500, []).ratio).toBeNull();
  });
});

describe("normalizeVelocity", () => {
  it("0에서 100 사이로 제한한다", () => {
    expect(normalizeVelocity(0, 2000)).toBe(0);
    expect(normalizeVelocity(2000, 2000)).toBe(100);
    expect(normalizeVelocity(999999, 2000)).toBe(100);
  });

  it("로그 스케일이므로 중간값이 선형보다 높게 나온다", () => {
    const score = normalizeVelocity(200, 2000);
    expect(score).not.toBeNull();
    expect(score as number).toBeGreaterThan(50);
  });

  it("값이 없으면 null을 유지한다", () => {
    expect(normalizeVelocity(null, 2000)).toBeNull();
  });
});

describe("classifyShort", () => {
  it("180초 이하는 후보로만 표시하고 확정하지 않는다", () => {
    const result = classifyShort({ durationSeconds: 45 });
    expect(result.shortCandidate).toBe(true);
    expect(result.isShort).toBeNull();
  });

  it("Shorts URL이면 확정한다", () => {
    const result = classifyShort({ durationSeconds: 45, urlPath: "/shorts/abc" });
    expect(result.isShort).toBe(true);
    expect(result.source).toBe("shorts_url");
  });

  it("본인 Analytics 분류가 있으면 그것을 따른다", () => {
    const result = classifyShort({ durationSeconds: 200, ownedAnalyticsIsShort: false });
    expect(result.isShort).toBe(false);
    expect(result.source).toBe("owned_analytics");
  });
});

describe("median", () => {
  it("빈 배열은 null", () => {
    expect(median([])).toBeNull();
  });

  it("짝수 개는 가운데 두 값의 평균", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});
