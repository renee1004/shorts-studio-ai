import { describe, expect, it } from "vitest";
import { GeminiSpeechProvider } from "./speech";
const pcm = Buffer.alloc(4800, 1);
function provider(
  mimeType = "audio/L16;codec=pcm;rate=24000",
  data = pcm.toString("base64"),
) {
  return new GeminiSpeechProvider({
    apiKey: "test",
    model: "test",
    voice: "Kore",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ inlineData: { mimeType, data } }] } },
          ],
        }),
      ),
  });
}
describe("Gemini speech", () => {
  it("wraps PCM in a mono 24kHz WAV header", async () => {
    const wave = await provider().synthesize("안녕하세요");
    expect(wave.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wave.readUInt32LE(24)).toBe(24000);
    expect(wave.readUInt16LE(22)).toBe(1);
    expect(wave.subarray(44)).toEqual(pcm);
  });
  it("rejects unsupported sample rates", async () => {
    await expect(
      provider("audio/L16;codec=pcm;rate=48000").synthesize("안녕하세요"),
    ).rejects.toThrow("PCM 형식");
  });
  it("rejects empty audio", async () => {
    await expect(
      provider(undefined, "").synthesize("안녕하세요"),
    ).rejects.toThrow();
  });
  it("rejects empty narration before making a request", async () => {
    await expect(provider().synthesize(" ")).rejects.toThrow("1–800자");
  });
});
