import { describe, expect, it } from "vitest";
import { MockVideoGenerationProvider, UnavailableVideoGenerationProvider } from "./media";

describe("Video generation capabilities", () => {
  it("Mock도 영상에 글자를 넣지 않는다고 선언한다", () => {
    const caps = new MockVideoGenerationProvider().capabilities();
    expect(caps.textInFootage).toBe(false);
    expect(caps.videoClips).toBe(true);
    expect(caps.mode).toBe("mock");
  });

  it("플래그가 꺼지면 수동 업로드 안내만 남긴다", () => {
    const caps = new UnavailableVideoGenerationProvider().capabilities();
    expect(caps.videoClips).toBe(false);
    expect(caps.mode).toBe("none");
    expect(caps.requirement).toMatch(/직접 올리/);
  });
});
