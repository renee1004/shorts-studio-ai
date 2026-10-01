import { describe, expect, it } from "vitest";
import { narrationFingerprint, narrationTempo } from "./narration";
describe("Narration timing", () => {
  it("uses 1.3x minimum and never exceeds 1.5x", () => {
    expect(narrationTempo(1, 2)).toBe(1.3);
    expect(narrationTempo(1.4, 1)).toBe(1.4);
    expect(() => narrationTempo(1.6, 1)).toThrow("잘라내지");
  });
  it("rejects missing and invalid durations", () => {
    expect(() => narrationTempo(NaN, 3)).toThrow();
    expect(() => narrationTempo(0, 3)).toThrow();
  });
  it("invalidates voice after a text or time change, normalizing DB numeric strings", () => {
    const shot = { startSeconds: "0", endSeconds: "3", narration: "하나" };
    const original = narrationFingerprint([shot]);
    expect(
      narrationFingerprint([{ ...shot, startSeconds: 0, endSeconds: 3 }]),
    ).toBe(original);
    expect(narrationFingerprint([{ ...shot, narration: "둘" }])).not.toBe(
      original,
    );
    expect(narrationFingerprint([{ ...shot, endSeconds: 4 }])).not.toBe(
      original,
    );
  });
});
