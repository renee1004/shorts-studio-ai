/**
 * 스펙 5.3의 Confidence 구성 요소.
 * confidence = 0.40*coverage + 0.25*freshness + 0.20*sample + 0.15*reliability
 */
export const confidenceWeights = {
  coverage: 0.4,
  freshness: 0.25,
  sample: 0.2,
  reliability: 0.15,
} as const;

/** 표본이 5개 미만이면 뚝 떨어지고 12개에서 포화한다. 스펙 5.4의 비교군 기준을 따른다. */
export const sampleSaturationTarget = 12;
export const minimumComparableSample = 5;

export function freshnessScore(hours: number | null): number {
  if (hours === null || Number.isNaN(hours)) return 0;
  if (hours <= 6) return 1;
  if (hours <= 24) return 0.9;
  if (hours <= 72) return 0.75;
  if (hours <= 168) return 0.6;
  if (hours <= 720) return 0.35;
  return 0.15;
}

export function sampleScore(sampleSize: number): number {
  if (sampleSize <= 0) return 0;
  if (sampleSize < minimumComparableSample) {
    return (sampleSize / minimumComparableSample) * 0.4;
  }
  const span = sampleSaturationTarget - minimumComparableSample;
  const above = sampleSize - minimumComparableSample;
  return Math.min(1, 0.4 + (above / span) * 0.6);
}

export function weightedAverage(
  entries: { value: number; weight: number }[],
  fallback = 0,
): number {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return fallback;
  return entries.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight;
}

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
