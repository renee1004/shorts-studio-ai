import { createHash } from "node:crypto";

const STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "is",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "에",
  "의",
  "과",
  "와",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP.has(token));
}

export function ngrams(tokens: string[], size = 3): Set<string> {
  const grams = new Set<string>();
  if (tokens.length < size) {
    if (tokens.length > 0) grams.add(tokens.join(" "));
    return grams;
  }
  for (let index = 0; index <= tokens.length - size; index += 1) {
    grams.add(tokens.slice(index, index + size).join(" "));
  }
  return grams;
}

/** 문장 n-gram Jaccard. 법률 판단이 아니라 복제 위험 신호다. */
export function textOverlapRatio(left: string, right: string, size = 3): number {
  const a = ngrams(tokenize(left), size);
  const b = ngrams(tokenize(right), size);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const gram of a) {
    if (b.has(gram)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : Math.round((intersection / union) * 10000) / 10000;
}

export function maxOverlap(candidate: string, references: string[]): number {
  return references.reduce((max, reference) => Math.max(max, textOverlapRatio(candidate, reference)), 0);
}

/** 한국어·영어 혼합 대본의 대략 초 단위. 실측이 아니라 추정이다. */
export function estimateSpokenSeconds(scriptText: string): number {
  const words = tokenize(scriptText).length;
  const chars = scriptText.replace(/\s/g, "").length;
  const fromWords = words / 2.5;
  const fromChars = chars / 8;
  return Math.max(5, Math.round(Math.max(fromWords, fromChars)));
}

export function snapshotHash(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

const POLICY_PATTERNS = [
  /월\s*\d/,
  /수익\s*보장/,
  /구독자\s*\d/,
  /\$\s*\d/,
  /make money/i,
  /guaranteed income/i,
];

export function policyRiskPhrases(text: string): string[] {
  return POLICY_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}
