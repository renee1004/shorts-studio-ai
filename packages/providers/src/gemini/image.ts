import { DomainError } from "@shorts-os/domain";

const API = "https://generativelanguage.googleapis.com/v1beta";
export type GeneratedSceneImage = { bytes: Buffer; mimeType: string };
export function geminiImageError(status: number): DomainError {
  const message =
    status === 400
      ? "Gemini가 요청을 거절했습니다. API 키와 이미지 전용 모델 설정을 확인해 주세요."
      : status === 401 || status === 403
        ? "Gemini 인증·접근 권한 오류입니다. 키 제한, API 활성화와 사용 지역을 확인해 주세요."
        : status === 404
          ? "설정한 Gemini 이미지 모델을 찾을 수 없습니다. 모델 이름이나 사용 가능 여부를 확인해 주세요."
          : status === 429
            ? "Gemini 사용 한도에 도달했습니다. AI Studio에서 결제 연결·잔여 할당량을 확인하고 잠시 후 다시 시도해 주세요."
            : status >= 500
              ? "Gemini 서버 오류입니다. 자동 재시도하지 않았습니다. 잠시 후 다시 시도해 주세요."
              : "Gemini 이미지 요청에 실패했습니다.";
  return new DomainError(
    "PROVIDER_UNAVAILABLE",
    `${message} (HTTP ${status})`,
    {
      retryable: false,
      details: { provider: "gemini", operation: "image", httpStatus: status },
    },
  );
}

export class GeminiImageProvider {
  constructor(
    private readonly options: {
      apiKey: string;
      model: string;
      fetchImpl?: typeof fetch;
    },
  ) {}
  private async request(url: string, init: RequestInit, timeoutMs: number) {
    try {
      const response = await (this.options.fetchImpl ?? fetch)(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.options.apiKey,
        },
      });
      if (!response.ok) throw geminiImageError(response.status);
      return await response.json();
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        "PROVIDER_UNAVAILABLE",
        "Gemini 연결이 끊겼거나 응답 시간이 초과되었습니다. 생성 완료 여부를 확인할 수 없어 자동 재시도하지 않았습니다.",
        {
          retryable: false,
          details: {
            provider: "gemini",
            operation: "image",
            providerCode: "CONNECTION_OR_TIMEOUT",
          },
        },
      );
    }
  }
  /** Metadata only: no image generation or billing/quota guarantee. */
  async checkConnection() {
    const body = await this.request(
      `${API}/models/${encodeURIComponent(this.options.model)}`,
      { method: "GET" },
      15_000,
    );
    if (
      !body.name ||
      !body.supportedGenerationMethods?.includes("generateContent")
    )
      throw new DomainError(
        "PROVIDER_UNAVAILABLE",
        "이 모델은 generateContent 요청을 지원하지 않습니다.",
      );
    return {
      model: this.options.model,
      message:
        "키·모델 조회 성공. 실제 생성 가능 여부와 결제·할당량은 한 장 생성 시 확인됩니다.",
    };
  }
  async generate(prompt: string): Promise<GeneratedSceneImage> {
    if (!prompt.trim() || prompt.length > 6000)
      throw new DomainError(
        "VALIDATION_FAILED",
        "이미지 설명은 1–6,000자여야 합니다.",
      );
    const body = await this.request(
      `${API}/models/${encodeURIComponent(this.options.model)}:generateContent`,
      {
        method: "POST",
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: {
              aspectRatio: "9:16",
              ...(this.options.model.startsWith("gemini-3")
                ? { imageSize: "1K" }
                : {}),
            },
          },
        }),
      },
      120_000,
    );
    const candidate = body.candidates?.[0];
    const reason = body.promptFeedback?.blockReason ?? candidate?.finishReason;
    if (body.promptFeedback?.blockReason || (reason && reason !== "STOP")) {
      const safeReason =
        typeof reason === "string" && /^[A-Z_]{1,64}$/.test(reason)
          ? reason
          : "UNKNOWN";
      throw new DomainError(
        "PROVIDER_UNAVAILABLE",
        `Gemini가 이미지 생성을 완료하지 못했습니다 (${safeReason}). 장면 설명을 확인해 주세요.`,
        {
          retryable: false,
          details: {
            provider: "gemini",
            operation: "image",
            finishReason: safeReason,
          },
        },
      );
    }
    const image = candidate?.content?.parts?.find(
      (part: { thought?: boolean; inlineData?: { mimeType?: string } }) =>
        !part.thought && part.inlineData?.mimeType?.startsWith("image/"),
    )?.inlineData;
    if (!image?.data)
      throw new DomainError(
        "PROVIDER_UNAVAILABLE",
        "Gemini 응답에 이미지가 없습니다. 이미지 전용 모델인지 확인해 주세요. 자동 재시도하지 않았습니다.",
        {
          retryable: false,
          details: {
            provider: "gemini",
            operation: "image",
            providerCode: "NO_IMAGE",
          },
        },
      );
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(image.mimeType) ||
      typeof image.data !== "string" ||
      image.data.length > 34_000_000 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(image.data)
    )
      throw new DomainError(
        "PROVIDER_UNAVAILABLE",
        "Gemini 이미지 형식이나 크기가 올바르지 않습니다.",
      );
    const bytes = Buffer.from(image.data, "base64");
    if (!bytes.length || bytes.length > 25 * 1024 * 1024)
      throw new DomainError(
        "PROVIDER_UNAVAILABLE",
        "Gemini 이미지가 비어 있거나 25MB를 초과했습니다.",
      );
    return { bytes, mimeType: image.mimeType };
  }
}
