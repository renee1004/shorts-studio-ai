/** 스펙 5.4 View Velocity와 Breakout Ratio. */

export function median(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] as number;
  return (((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2);
}

export function videoAgeHours(publishedAt: Date, now: Date): number {
  return Math.max((now.getTime() - publishedAt.getTime()) / 3_600_000, 1);
}

export function viewVelocity(viewCount: number | null, ageHours: number): number | null {
  if (viewCount === null || !Number.isFinite(viewCount)) return null;
  return viewCount / Math.max(ageHours, 1);
}

export function breakoutRatio(
  targetVelocity: number | null,
  comparableVelocities: number[],
): { ratio: number | null; sampleSize: number; reliable: boolean } {
  const comparableMedian = median(comparableVelocities);
  const sampleSize = comparableVelocities.length;
  if (targetVelocity === null || comparableMedian === null || comparableMedian <= 0) {
    return { ratio: null, sampleSize, reliable: false };
  }
  return {
    ratio: targetVelocity / comparableMedian,
    sampleSize,
    // 비교군 5개 미만이면 신뢰할 수 없다고 표시한다.
    reliable: sampleSize >= 5,
  };
}

/**
 * 조회 속도를 0-100으로 변환한다. 상한(reference)은 설정값이며 코드에 고정하지 않는다.
 * 로그 스케일을 쓰는 이유는 상위 영상 하나가 전체 분포를 지배하지 않게 하기 위함이다.
 */
export function normalizeVelocity(velocity: number | null, referencePerHour: number): number | null {
  if (velocity === null || !Number.isFinite(velocity) || velocity < 0) return null;
  if (referencePerHour <= 0) return null;
  const score = (Math.log10(1 + velocity) / Math.log10(1 + referencePerHour)) * 100;
  return Math.min(100, Math.max(0, Math.round(score * 100) / 100));
}

/** 60초 이하 세로 영상이 쇼츠라는 보장이 없으므로 후보와 확정을 나눈다. (스펙 5.5) */
export function classifyShort(input: {
  durationSeconds: number | null;
  urlPath?: string | null;
  ownedAnalyticsIsShort?: boolean | null;
}): { shortCandidate: boolean; isShort: boolean | null; source: string | null } {
  const shortCandidate = input.durationSeconds !== null && input.durationSeconds <= 180;

  if (input.ownedAnalyticsIsShort !== null && input.ownedAnalyticsIsShort !== undefined) {
    return {
      shortCandidate,
      isShort: input.ownedAnalyticsIsShort,
      source: "owned_analytics",
    };
  }
  if (input.urlPath && input.urlPath.includes("/shorts/")) {
    return { shortCandidate, isShort: true, source: "shorts_url" };
  }
  return { shortCandidate, isShort: null, source: null };
}
