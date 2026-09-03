import { describe, expect, it } from "vitest";
import {
  estimateSpokenSeconds,
  maxOverlap,
  snapshotHash,
  textOverlapRatio,
} from "./overlap";

describe("textOverlapRatio", () => {
  it("같은 문장은 높은 겹침을 낸다", () => {
    const text = "weekly reporting with AI automation in sixty seconds";
    expect(textOverlapRatio(text, text)).toBeGreaterThan(0.8);
  });

  it("다른 문장은 거의 겹치지 않는다", () => {
    expect(
      textOverlapRatio(
        "weekly reporting with AI automation",
        "연말정산 공제를 확인하는 방법",
      ),
    ).toBeLessThan(0.1);
  });

  it("여러 참조 중 최댓값을 쓴다", () => {
    const overlap = maxOverlap("client onboarding in 60 seconds with AI", [
      "unrelated topic about cooking pasta tonight",
      "client onboarding in 60 seconds with AI tools",
    ]);
    expect(overlap).toBeGreaterThan(0.3);
  });
});

describe("estimateSpokenSeconds", () => {
  it("빈 문장은 하한 5초다", () => {
    expect(estimateSpokenSeconds("")).toBe(5);
  });

  it("긴 대본은 더 길게 잡는다", () => {
    const short = estimateSpokenSeconds("짧은 훅입니다.");
    const long = estimateSpokenSeconds(
      "첫 문장에서 문제를 말하고 두 번째에서 한 가지 해결을 보여준 뒤 마지막에 할 일을 제안합니다. ".repeat(
        8,
      ),
    );
    expect(long).toBeGreaterThan(short);
  });
});

describe("snapshotHash", () => {
  it("키 순서가 달라도 같은 해시다", () => {
    expect(snapshotHash({ a: 1, b: 2 })).toBe(snapshotHash({ b: 2, a: 1 }));
  });

  it("값이 바뀌면 해시가 바뀐다", () => {
    expect(snapshotHash({ script: "a" })).not.toBe(snapshotHash({ script: "b" }));
  });
});
