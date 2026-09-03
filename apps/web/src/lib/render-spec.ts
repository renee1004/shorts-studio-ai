export type Scene = {
  duration: number;
  caption: string;
  narration: string;
  note: string;
};

export type RenderSpec = {
  title: string;
  watermark: string;
  width: number;
  height: number;
  fps: number;
  theme: { accent: string; text: string };
  scenes: Scene[];
};

export type ParseResult = {
  scenes: Scene[];
  warnings: string[];
  error: string | null;
};

/** 렌더 스크립트(scripts/render-short.mjs)의 PALETTE와 같은 순서로 유지해야 미리보기가 일치합니다. */
export const scenePalette: [string, string][] = [
  ["#1d1b2e", "#0e0d16"],
  ["#241a20", "#120b10"],
  ["#16212b", "#0a1016"],
  ["#231e15", "#12100a"],
  ["#1a2321", "#0b1210"],
];

const HEADER_KEYWORDS = ["시간", "타임", "구간", "내레이션", "자막", "캡션", "화면", "time"];

function splitRow(row: string, delimiter: "pipe" | "tab"): string[] {
  if (delimiter === "pipe") {
    return row
      .replace(/^\s*\|/, "")
      .replace(/\|\s*$/, "")
      .split("|")
      .map((cell) => cell.trim());
  }
  return row.split("\t").map((cell) => cell.trim());
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell.replace(/\s/g, "")));
}

function toSeconds(raw: string): number | null {
  const clock = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const plain = raw.match(/^(\d+(?:\.\d+)?)$/);
  if (plain) return Number(plain[1]);
  return null;
}

/** "0-3초", "0:03~0:15", "12초" 같은 표기를 초 단위 길이로 바꿉니다. */
function parseDuration(cell: string): number | null {
  const cleaned = cell.replace(/초|sec|s\b/gi, "").replace(/\s/g, "");
  if (cleaned === "") return null;

  const range = cleaned.split(/[-~–—]|to/i);
  if (range.length === 2) {
    const start = toSeconds(range[0] ?? "");
    const end = toSeconds(range[1] ?? "");
    if (start !== null && end !== null && end > start) return Math.round((end - start) * 10) / 10;
  }

  const single = toSeconds(cleaned);
  return single !== null && single > 0 ? single : null;
}

function findColumns(cells: string[]) {
  const index = (patterns: RegExp) => cells.findIndex((cell) => patterns.test(cell));
  return {
    time: index(/시간|타임|구간|time/i),
    narration: index(/내레이션|나레이션|대사|음성|말/i),
    note: index(/화면|비주얼|영상|visual/i),
    caption: index(/자막|캡션|caption|subtitle/i),
  };
}

export function parseScriptTable(input: string): ParseResult {
  const warnings: string[] = [];
  const rows = input
    .split("\n")
    .map((row) => row.trim())
    .filter((row) => row !== "");

  if (rows.length === 0) {
    return { scenes: [], warnings, error: null };
  }

  const delimiter: "pipe" | "tab" = rows.some((row) => row.includes("|"))
    ? "pipe"
    : rows.some((row) => row.includes("\t"))
      ? "tab"
      : "pipe";

  const parsed = rows
    .map((row) => splitRow(row, delimiter))
    .filter((cells) => !isSeparatorRow(cells))
    .filter((cells) => cells.some((cell) => cell !== ""));

  if (parsed.length === 0) {
    return {
      scenes: [],
      warnings,
      error: "표를 읽지 못했습니다. 4단계 프롬프트가 만들어준 표를 그대로 붙여넣어 주세요.",
    };
  }

  let columns = { time: 0, narration: 1, note: 2, caption: 3 };
  let body = parsed;

  const first = parsed[0] ?? [];
  const looksLikeHeader = first.some((cell) =>
    HEADER_KEYWORDS.some((keyword) => cell.toLowerCase().includes(keyword.toLowerCase())),
  );

  if (looksLikeHeader) {
    const found = findColumns(first);
    columns = {
      time: found.time >= 0 ? found.time : 0,
      narration: found.narration >= 0 ? found.narration : 1,
      note: found.note >= 0 ? found.note : 2,
      caption: found.caption >= 0 ? found.caption : 3,
    };
    body = parsed.slice(1);
  } else {
    warnings.push(
      "머리글 줄을 찾지 못해 [시간 · 내레이션 · 화면 · 자막] 순서로 읽었습니다. 순서가 다르면 결과를 확인해 주세요.",
    );
  }

  if (body.length === 0) {
    return { scenes: [], warnings, error: "머리글만 있고 내용 줄이 없습니다." };
  }

  const scenes: Scene[] = [];

  body.forEach((cells, rowIndex) => {
    const label = `${rowIndex + 1}번째 줄`;
    const narration = (cells[columns.narration] ?? "").trim();
    const note = (cells[columns.note] ?? "").trim();
    let caption = (cells[columns.caption] ?? "").trim();

    let duration = parseDuration(cells[columns.time] ?? "");
    if (duration === null) {
      duration = 5;
      warnings.push(`${label}의 시간을 읽지 못해 5초로 넣었습니다. 아래에서 직접 고쳐주세요.`);
    }

    if (caption === "") {
      caption = narration.slice(0, 12).trim();
      if (caption === "") {
        warnings.push(`${label}은 자막과 내레이션이 모두 비어 있어 건너뛰었습니다.`);
        return;
      }
      warnings.push(`${label}에 자막이 없어 내레이션 앞부분을 자막으로 넣었습니다.`);
    }

    if (caption.length > 16) {
      warnings.push(`${label}의 자막이 ${caption.length}자입니다. 12자 안쪽이 읽기 좋습니다.`);
    }

    scenes.push({ duration, caption, narration, note });
  });

  if (scenes.length === 0) {
    return { scenes: [], warnings, error: "쓸 수 있는 구간이 없습니다. 표 내용을 확인해 주세요." };
  }

  const total = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  if (total > 60) {
    warnings.push(
      `전체 길이가 ${total}초입니다. 쇼츠는 60초 안쪽이 안전합니다. 구간 시간을 줄여보세요.`,
    );
  }
  if (scenes[0] && scenes[0].duration > 4) {
    warnings.push("첫 구간이 4초를 넘습니다. 후크는 3초 안에 끝내는 편이 이탈을 줄입니다.");
  }

  return { scenes, warnings, error: null };
}

export function buildSpec(
  scenes: Scene[],
  meta: { title: string; watermark: string; accent: string },
): RenderSpec {
  return {
    title: meta.title.trim() || "제목 없는 쇼츠",
    watermark: meta.watermark.trim(),
    width: 1080,
    height: 1920,
    fps: 30,
    theme: { accent: meta.accent, text: "#ffffff" },
    scenes: scenes.map((scene) => ({
      duration: scene.duration,
      caption: scene.caption,
      narration: scene.narration,
      note: scene.note,
    })),
  };
}

export function specFileName(title: string): string {
  const slug = title
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{Letter}\p{Number}-]/gu, "")
    .slice(0, 40);
  return `${slug || "short"}-spec.json`;
}

/** 미리보기에서 자막 줄바꿈을 렌더 스크립트와 같은 규칙으로 계산합니다. */
export function wrapCaption(text: string, maxPerLine = 9): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (word.length > maxPerLine) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += maxPerLine) {
        lines.push(word.slice(i, i + maxPerLine));
      }
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxPerLine) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}
