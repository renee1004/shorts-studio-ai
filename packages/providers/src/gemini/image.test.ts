import { describe, expect, it, vi } from "vitest";
import { GeminiImageProvider } from "./image";

const model = "gemini-3.1-flash-lite-image";
function setup(body: unknown, status = 200) {
  const fetchImpl = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
  return {
    fetchImpl,
    provider: new GeminiImageProvider({
      apiKey: "secret-key",
      model,
      fetchImpl,
    }),
  };
}
describe("Gemini scene images", () => {
  it("requests a portrait image using a header key and ignores thought images", async () => {
    const { provider, fetchImpl } = setup({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              {
                thought: true,
                inlineData: { mimeType: "image/png", data: "dGhvdWdodA==" },
              },
              { inlineData: { mimeType: "image/png", data: "aW1hZ2U=" } },
            ],
          },
        },
      ],
    });
    expect((await provider.generate("scene")).bytes.toString()).toBe("image");
    expect(fetchImpl.mock.calls[0]![0]).not.toContain("secret-key");
    const request = fetchImpl.mock.calls[0]![1];
    expect(request.headers["x-goog-api-key"]).toBe("secret-key");
    expect(JSON.parse(request.body).generationConfig).toMatchObject({
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { aspectRatio: "9:16", imageSize: "1K" },
    });
  });
  it.each([400, 403, 404, 429, 503])(
    "sanitizes HTTP %i and never retries automatically",
    async (status) => {
      const { provider, fetchImpl } = setup(
        { error: { message: "secret-key private prompt" } },
        status,
      );
      await expect(provider.generate("scene")).rejects.toMatchObject({
        retryable: false,
        message: expect.stringContaining(`HTTP ${status}`),
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );
  it("does not accept text-only output as a successful image", async () => {
    const { provider } = setup({
      candidates: [{ content: { parts: [{ text: "private content" }] } }],
    });
    await expect(provider.generate("scene")).rejects.toThrow(
      "응답에 이미지가 없습니다",
    );
  });
  it("rejects blocked images even when image data exists", async () => {
    const { provider } = setup({
      promptFeedback: { blockReason: "SAFETY" },
      candidates: [
        {
          content: {
            parts: [
              { inlineData: { mimeType: "image/png", data: "aW1hZ2U=" } },
            ],
          },
        },
      ],
    });
    await expect(provider.generate("scene")).rejects.toThrow("SAFETY");
  });
  it("checks only model metadata without generating", async () => {
    const { provider, fetchImpl } = setup({
      name: `models/${model}`,
      supportedGenerationMethods: ["generateContent"],
    });
    expect(await provider.checkConnection()).toMatchObject({ model });
    expect(fetchImpl.mock.calls[0]![1].method).toBe("GET");
    expect(fetchImpl.mock.calls[0]![1].body).toBeUndefined();
  });
});
