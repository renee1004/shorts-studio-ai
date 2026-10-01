import { DomainError } from "@shorts-os/domain";

/** Gemini generateContent audio-only output: 24 kHz mono signed 16-bit PCM. */
export class GeminiSpeechProvider {
  constructor(
    private readonly options: {
      apiKey: string;
      model: string;
      voice: string;
      fetchImpl?: typeof fetch;
    },
  ) {}
  async synthesize(text: string): Promise<Buffer> {
    if (!text.trim() || text.length > 800)
      throw new DomainError(
        "VALIDATION_FAILED",
        "장면 내레이션은 1–800자여야 합니다.",
      );
    const response = await (this.options.fetchImpl ?? fetch)(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.options.model)}:generateContent`,
      {
        method: "POST",
        signal: AbortSignal.timeout(120_000),
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.options.apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Read exactly the following text as a clear, natural narration. Do not add an introduction or commentary. Text:\n${text}`,
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: this.options.voice },
              },
            },
          },
        }),
      },
    );
    if (!response.ok)
      throw new DomainError(
        "PROVIDER_UNAVAILABLE",
        `음성 생성 요청에 실패했습니다 (${response.status}).`,
        { retryable: response.status === 429 || response.status >= 500 },
      );
    const body = (await response.json()) as {
      candidates?: {
        content?: {
          parts?: { inlineData?: { mimeType?: string; data?: string } }[];
        };
      }[];
    };
    const audio = body.candidates?.[0]?.content?.parts?.find(
      (part) => part.inlineData,
    )?.inlineData;
    if (
      !audio?.data ||
      !/^audio\/L16;\s*codec=pcm;\s*rate=24000$/i.test(audio.mimeType ?? "")
    )
      throw new DomainError(
        "VALIDATION_FAILED",
        "음성 응답이 지원하는 PCM 형식이 아닙니다.",
      );
    const pcm = Buffer.from(audio.data, "base64");
    if (!pcm.length || pcm.length % 2 || pcm.length > 24_000 * 2 * 180)
      throw new DomainError(
        "VALIDATION_FAILED",
        "음성 데이터 길이가 올바르지 않습니다.",
      );
    return pcmToWave(pcm);
  }
}
export function pcmToWave(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24);
  header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
