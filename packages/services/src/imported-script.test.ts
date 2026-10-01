import { describe, expect, it } from "vitest";
import { structureImportedScript } from "./imported-script";

describe("user script import", () => {
  it("preserves narration and creates unverified editable scenes", () => {
    const text =
      "첫 번째 문장입니다.\n직접 확인한 두 번째 문장입니다.\n마지막 문장입니다.";
    const script = structureImportedScript("주제", text);
    expect(script.beats.map((beat) => beat.narration).join("\n")).toBe(text);
    expect(script.beats.at(-1)?.endSeconds).toBe(45);
    expect(
      script.factualClaims.every(
        (claim) => claim.unverified && !claim.sourceIds.length,
      ),
    ).toBe(true);
  });
  it.each([
    "한 문단",
    Array(17).fill("문단").join("\n"),
    "가".repeat(801) + "\n다음",
  ])("rejects invalid scene boundaries", (text) => {
    expect(() => structureImportedScript("주제", text)).toThrow();
  });
});
