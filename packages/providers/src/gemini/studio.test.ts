import { afterEach, describe, it, expect, vi } from "vitest";
import { defaultFeatureFlags } from "@shorts-os/config";
import { ProviderRegistry } from "../registry";
import { geminiJsonSchema, LiveContentStudioProvider } from "./studio";
import type { ScriptGeneratorInput } from "../interfaces";
const retry = { timeoutMs: 100, maxAttempts: 3, baseDelayMs: 10 };
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
    retry,
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
  it("sends Gemini a supported response schema", async () => {
    let requestBody:
      | {
          generationConfig: {
            responseJsonSchema: Record<string, unknown>;
            maxOutputTokens: number;
          };
        }
      | undefined;
    const live = new LiveContentStudioProvider({
      apiKey: "test-key",
      model: "test-model",
      retry,
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: JSON.stringify(script) }] } },
            ],
          }),
          { status: 200 },
        );
      },
    });

    await live.generateScript(input);
    expect(requestBody?.generationConfig.responseJsonSchema.type).toBe(
      "object",
    );
    expect(
      requestBody?.generationConfig.responseJsonSchema.$schema,
    ).toBeUndefined();
    expect(requestBody?.generationConfig.maxOutputTokens).toBe(8192);
  });

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
      retry,
      fetchImpl: async () => new Response("secret", { status: 429 }),
    });
    await expect(live.generateScript(input)).rejects.toThrow("429");
  });
});

describe("Live content studio request policy", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function success(content: unknown = script) {
    return new Response(
      JSON.stringify({
        candidates: [
          { content: { parts: [{ text: JSON.stringify(content) }] } },
        ],
      }),
    );
  }

  function live(fetchImpl: typeof fetch, policy = retry) {
    return new LiveContentStudioProvider({
      apiKey: "test-key",
      model: "test-model",
      retry: policy,
      fetchImpl,
    });
  }

  it.each([429, 500, 502, 503, 504])(
    "retries HTTP %s with exponential backoff and a fresh signal",
    async (status) => {
      vi.useFakeTimers();
      const signals: AbortSignal[] = [];
      const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
        signals.push(init!.signal!);
        return signals.length < 3
          ? new Response("private upstream body", { status })
          : success();
      });
      const result = live(fetchImpl).generateScript(input);
      const assertion = expect(result).resolves.toMatchObject({ mode: "live" });
      await vi.advanceTimersByTimeAsync(9);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(19);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      await assertion;
      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(new Set(signals).size).toBe(3);
      expect(signals.every((signal) => !signal.aborted)).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      const requests = fetchImpl.mock.calls.map(([, init]) => init?.body);
      expect(new Set(requests).size).toBe(1);
    },
  );

  it.each([1, 2, 4])(
    "stops at the configured %s total attempts",
    async (maxAttempts) => {
      vi.useFakeTimers();
      const fetchImpl = vi.fn<typeof fetch>(
        async () => new Response("private", { status: 429 }),
      );
      const assertion = expect(
        live(fetchImpl, { ...retry, maxAttempts }).generateScript(input),
      ).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED" });
      await vi.runAllTimersAsync();
      await assertion;
      expect(fetchImpl).toHaveBeenCalledTimes(maxAttempts);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([400, 401, 403, 404, 422])(
    "does not retry HTTP %s or expose its body",
    async (status) => {
      const fetchImpl = vi.fn<typeof fetch>(
        async () => new Response("private upstream body", { status }),
      );
      await expect(live(fetchImpl).generateScript(input)).rejects.toMatchObject(
        {
          code:
            status === 401 || status === 403
              ? "PROVIDER_NOT_CONNECTED"
              : "PROVIDER_UNAVAILABLE",
          message: `대본 AI 요청에 실패했습니다 (${status}).`,
          options: { retryable: false },
        },
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it.each([25, 250])(
    "aborts at the configured %sms without resubmitting a paid request",
    async (timeoutMs) => {
      vi.useFakeTimers();
      let signal: AbortSignal | undefined;
      const fetchImpl = vi.fn<typeof fetch>(
        async (_url, init) =>
          new Promise((_resolve, reject) => {
            signal = init!.signal!;
            signal.addEventListener(
              "abort",
              () => reject(new Error("private abort message")),
              { once: true },
            );
          }),
      );
      const assertion = expect(
        live(fetchImpl, { ...retry, timeoutMs }).generateScript(input),
      ).rejects.toMatchObject({
        code: "PROVIDER_TIMEOUT",
        message: `gemini 응답이 ${timeoutMs}ms 안에 오지 않았습니다.`,
        options: { retryable: false },
      });
      await vi.advanceTimersByTimeAsync(timeoutMs - 1);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await assertion;
      expect(signal?.aborted).toBe(true);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("also bounds response body reads without retrying", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      const response = success();
      response.json = () =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener(
            "abort",
            () => reject(new Error("aborted body")),
            { once: true },
          );
        });
      return response;
    });
    const assertion = expect(
      live(fetchImpl).generateScript(input),
    ).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
      options: { retryable: false },
    });
    await vi.advanceTimersByTimeAsync(retry.timeoutMs);
    await assertion;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not repeat invalid model output or an uncertain network failure", async () => {
    const malformed = vi.fn<typeof fetch>(async () =>
      success({ not: "a script" }),
    );
    await expect(live(malformed).generateScript(input)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(malformed).toHaveBeenCalledTimes(1);
    const disconnected = vi.fn<typeof fetch>(async () => {
      throw new TypeError("connection lost");
    });
    await expect(live(disconnected).generateScript(input)).rejects.toThrow(
      "connection lost",
    );
    expect(disconnected).toHaveBeenCalledTimes(1);
  });

  it("passes the registry policy into live content generation", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response("private", { status: 503 }),
    );
    vi.stubGlobal("fetch", fetchImpl);
    const registry = new ProviderRegistry({
      appMode: "live",
      flags: defaultFeatureFlags,
      geminiApiKey: "test-key",
      geminiContentModel: "test-model",
      quota: { consume: vi.fn(), read: vi.fn() },
      cache: { get: vi.fn(), set: vi.fn() },
      cacheTtlMinutes: 10,
      retry: { timeoutMs: 37, maxAttempts: 2, baseDelayMs: 5 },
    });
    const assertion = expect(
      registry.contentStudio().generateScript(input),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    fetchImpl.mockImplementation(
      async (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          );
        }),
    );
    const timeout = expect(
      registry.contentStudio().generateScript(input),
    ).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
      message: "gemini 응답이 37ms 안에 오지 않았습니다.",
    });
    await vi.advanceTimersByTimeAsync(37);
    await timeout;
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe("geminiJsonSchema", () => {
  it("removes unsupported schema keywords recursively", () => {
    expect(
      geminiJsonSchema({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: { title: { type: "string", minLength: 1 } },
        required: ["title"],
      }),
    ).toEqual({
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
    });
  });
});
