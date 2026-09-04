import type { MediaCapabilities, VideoGenerationProvider } from "../interfaces";

export class MockVideoGenerationProvider implements VideoGenerationProvider {
  readonly kind = "gemini" as const;
  readonly mode = "mock" as const;

  capabilities(): MediaCapabilities {
    return {
      provider: "mock_ffmpeg",
      mode: "mock",
      videoClips: true,
      tts: false,
      music: false,
      textInFootage: false,
      requirement: null,
    };
  }
}

export class UnavailableVideoGenerationProvider implements VideoGenerationProvider {
  readonly kind = "gemini" as const;
  readonly mode = "none" as const;

  capabilities(): MediaCapabilities {
    return {
      provider: "none",
      mode: "none",
      videoClips: false,
      tts: false,
      music: false,
      textInFootage: false,
      requirement:
        "생성 모델이 꺼져 있습니다. Shot 클립을 직접 올리거나, 자막 카드 Placeholder로 렌더하세요.",
    };
  }
}
