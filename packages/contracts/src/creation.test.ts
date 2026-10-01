import { describe, expect, it } from "vitest";
import { creationInputSchema } from "./creation";
const base = {
  topic: "주제",
  operationId: "00000000-0000-4000-8000-000000000001",
};
describe("creation input", () => {
  it("normalizes script whitespace without rewriting narration", () => {
    expect(
      creationInputSchema.parse({
        ...base,
        mode: "script",
        suppliedText: " 첫 문장\r\n \n둘째 문장 ",
      }).suppliedText,
    ).toBe("첫 문장\n둘째 문장");
  });
  it.each([
    "한 문단",
    Array(17).fill("문단").join("\n"),
    "가".repeat(801) + "\n문단",
  ])("rejects invalid script: %s", (suppliedText) => {
    expect(
      creationInputSchema.safeParse({ ...base, mode: "script", suppliedText })
        .success,
    ).toBe(false);
  });
  it("accepts 4000 notes characters and rejects 4001", () => {
    expect(
      creationInputSchema.safeParse({
        ...base,
        mode: "notes",
        suppliedText: "가".repeat(4000),
      }).success,
    ).toBe(true);
    expect(
      creationInputSchema.safeParse({
        ...base,
        mode: "notes",
        suppliedText: "가".repeat(4001),
      }).success,
    ).toBe(false);
  });
});
