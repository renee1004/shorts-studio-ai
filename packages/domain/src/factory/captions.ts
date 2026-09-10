/** ASS에서 특수문자를 이스케이프한다. 자막은 후반 합성 전용이다. */
export function escapeAssText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("{", "(")
    .replaceAll("}", ")")
    .replaceAll("\n", "\\N")
    .trim();
}

export function wrapCaptionLines(text: string, maxPerLine = 14): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function assTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  const whole = Math.floor(s);
  const cs = Math.round((s - whole) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(whole).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export type CaptionCue = {
  startSeconds: number;
  endSeconds: number;
  text: string;
};

/**
 * 9:16 Safe Area(하단 약 12%)에 두 줄까지 두는 ASS.
 * PlayRes는 렌더 해상도와 같아야 한다.
 */
export function buildAssCaptions(
  cues: CaptionCue[],
  options: { width: number; height: number; fontName?: string },
): string {
  const font = options.fontName ?? "Noto Sans CJK KR";
  const marginV = Math.round(options.height * 0.12);
  const events = cues
    .map((cue) => {
      const wrapped = wrapCaptionLines(cue.text);
      if (wrapped.length > 3) {
        throw new Error(
          `자막이 3줄 Safe Area를 초과합니다. 줄이거나 Shot을 나누세요: ${cue.text}`,
        );
      }
      const lines = wrapped.map(escapeAssText).join("\\N");
      return `Dialogue: 0,${assTime(cue.startSeconds)},${assTime(cue.endSeconds)},Default,,0,0,0,,{\\an2}${lines}`;
    })
    .join("\n");

  return `[Script Info]
Title: Shorts OS captions
ScriptType: v4.00+
PlayResX: ${options.width}
PlayResY: ${options.height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${font},64,&H00FFFFFF,&H000000FF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,4,0,2,64,64,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
`;
}

export function parseEbur128Integrated(stderr: string): number | null {
  const match = [...stderr.matchAll(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/gi)].at(-1);
  if (!match?.[1]) return null;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : null;
}
