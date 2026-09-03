import { allCheckableIds } from "@/lib/content";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const PREFIX = "SF1";

function toBase36(value: bigint): string {
  if (value === 0n) return "0";
  let out = "";
  let rest = value;
  while (rest > 0n) {
    out = ALPHABET[Number(rest % 36n)] + out;
    rest /= 36n;
  }
  return out;
}

function fromBase36(text: string): bigint | null {
  let value = 0n;
  for (const char of text) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) return null;
    value = value * 36n + BigInt(digit);
  }
  return value;
}

/** 체크된 항목을 짧은 코드로 만듭니다. 항목 순서를 비트로 쓰기 때문에 문자 몇 개로 끝납니다. */
export function encodeProgress(done: Iterable<string>): string {
  const checked = new Set(done);
  let bits = 0n;
  allCheckableIds.forEach((id, index) => {
    if (checked.has(id)) bits |= 1n << BigInt(index);
  });
  return `${PREFIX}${toBase36(bits)}`;
}

export function decodeProgress(code: string): string[] | null {
  const cleaned = code.trim().toUpperCase().replace(/\s+/g, "");
  if (!cleaned.startsWith(PREFIX)) return null;

  const bits = fromBase36(cleaned.slice(PREFIX.length));
  if (bits === null) return null;

  const ids: string[] = [];
  allCheckableIds.forEach((id, index) => {
    if ((bits >> BigInt(index)) & 1n) ids.push(id);
  });
  return ids;
}
