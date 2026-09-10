import { describe, it, expect } from "vitest";
import { LiveContentStudioProvider } from "./studio";
import type { ScriptGeneratorInput } from "../interfaces";
const input: ScriptGeneratorInput = {
  topicTitle: "책상 정리",
  language: "ko",
  targetDurationSeconds: 45,
  angle: {
    title: "정리",
    hook: "시작",
    promise: "한 단계",
    outline: ["시작", "마무리"],
  },
  keyFacts: [],
  citationCount: 0,
};
const script = {
  title: "책상 정리",
  hook: "작게 시작해요",
  targetDurationSeconds: 45,
  estimatedDurationSeconds: 45,
  cta: { type: "save", text: "저장해 주세요" },
  factualClaims: [],
  beats: [
    {
      beatId: "hook",
      purpose: "hook",
      startSeconds: 0,
      endSeconds: 3,
      narration: "책상 위 한 곳만 비워볼까요?",
      onScreenText: "작게 시작해요",
    },
    {
      beatId: "body",
      purpose: "body",
      startSeconds: 3,
      endSeconds: 20,
      narration: "필요한 것과 치울 것을 나누어 보세요.",
    },
    {
      beatId: "twist",
      purpose: "twist",
      startSeconds: 20,
      endSeconds: 41,
      narration: "한 번에 다 치우지 않아도 괜찮아요.",
    },
    {
      beatId: "cta",
      purpose: "cta",
      startSeconds: 41,
      endSeconds: 45,
      narration: "나중에 해볼 수 있게 저장해 주세요.",
    },
  ],
};
function provider(content: unknown) {
  return new LiveContentStudioProvider({
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: JSON.stringify(content) }] } },
          ],
        }),
        { status: 200 },
      ),
  });
}
describe("Live content studio validation", () => {
  it("accepts a contiguous four-beat script", async () => {
    const result = await provider(script).generateScript(input);
    expect(result.mode).toBe("live");
    expect(result.structured.beats).toHaveLength(4);
  });
  it("rejects overlapping beats", async () => {
    const invalid = structuredClone(script);
    invalid.beats[1]!.startSeconds = 2;
    await expect(provider(invalid).generateScript(input)).rejects.toThrow(
      "시간 구성",
    );
  });
  it("rejects a CTA outside the last 3–5 seconds", async () => {
    const invalid = structuredClone(script);
    invalid.beats[2]!.endSeconds = 44;
    invalid.beats[3]!.startSeconds = 44;
    await expect(provider(invalid).generateScript(input)).rejects.toThrow(
      "시간 구성",
    );
  });
  it("rejects malformed JSON output instead of substituting mock content", async () => {
    await expect(
      provider({ text: "not a script" }).generateScript(input),
    ).rejects.toThrow("제작 형식");
  });
  it("reports upstream failures without returning provider body or credentials", async () => {
    const live = new LiveContentStudioProvider({
      apiKey: "secret",
      model: "test",
      fetchImpl: async () => new Response("secret", { status: 429 }),
    });
    await expect(live.generateScript(input)).rejects.toThrow("429");
  });
});
