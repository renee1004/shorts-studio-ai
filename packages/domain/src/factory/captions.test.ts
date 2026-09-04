import { describe, expect, it } from "vitest";
import {
  buildAssCaptions,
  escapeAssText,
  parseEbur128Integrated,
  wrapCaptionLines,
} from "./captions";

describe("후반 자막", () => {
  it("ASS 특수문자를 이스케이프한다", () => {
    expect(escapeAssText("a{b}\\c")).toBe("a(b)\\\\c");
  });

  it("Safe Area용 ASS 이벤트를 만든다", () => {
    const ass = buildAssCaptions(
      [{ startSeconds: 0, endSeconds: 2.5, text: "주간 보고를 자동화하세요" }],
      { width: 1080, height: 1920 },
    );
    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("Dialogue: 0,0:00:00.00,0:00:02.50");
    expect(ass).toContain("주간");
    expect(ass).not.toContain("{b}");
  });

  it("한 줄 길이를 제한한다", () => {
    expect(wrapCaptionLines("하나 둘 셋 넷 다섯 여섯 일곱", 6, 3).every((line) => line.length <= 8)).toBe(
      true,
    );
  });

  it("ffmpeg ebur128 통합 음량을 읽는다", () => {
    expect(parseEbur128Integrated("... I:   -16.4 LUFS\n  LRA:  3.1 LU")).toBe(-16.4);
    expect(parseEbur128Integrated("no loudness here")).toBeNull();
  });
});
