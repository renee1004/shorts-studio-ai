export type ImportedScene = {
  startSeconds: number;
  endSeconds: number;
  narration: string;
  visualDescription: string;
  onScreenText: string;
};
function clean(value: string) {
  return value
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
    .replace(/\[\d+(?:\s*[,–-]\s*\d+)*\]/g, "")
    .replace(/\*\*|__|`/g, "")
    .trim();
}
function cells(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((v) => v.replace(/\\\|/g, "|").trim());
}
export function parseImportedScenes(
  text: string,
  duration = 45,
): { scenes: ImportedScene[]; issues: string[]; isTable: boolean } {
  const lines = text
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter(Boolean);
  const headerIndex = lines.findIndex(
    (line) =>
      line.includes("|") &&
      /내레이션|나레이션|대사|narration/i.test(line) &&
      /시간|time/i.test(line),
  );
  const isTable =
    headerIndex >= 0 || lines.some((line) => /^\|.*\|$/.test(line));
  const scenes: ImportedScene[] = [];
  const issues: string[] = [];
  if (!isTable) {
    lines.forEach((narration, index) =>
      scenes.push({
        narration,
        startSeconds: (index * duration) / lines.length,
        endSeconds: ((index + 1) * duration) / lines.length,
        visualDescription: "",
        onScreenText: "",
      }),
    );
  } else if (headerIndex < 0) {
    issues.push(
      "표의 첫 줄에 ‘시간’, ‘내레이션’, ‘화면에 보이는 것’, ‘자막’ 제목을 넣어 주세요.",
    );
  } else {
    const header = cells(lines[headerIndex]!).map(clean);
    const time = header.findIndex((v) => /시간|time/i.test(v));
    const voice = header.findIndex((v) =>
      /내레이션|나레이션|대사|narration/i.test(v),
    );
    const caption = header.findIndex((v) => /자막|caption/i.test(v));
    const visual = header.findIndex(
      (v) => /화면|장면|영상|visual/i.test(v) && !/자막|caption/i.test(v),
    );
    if (
      new Set([time, voice, caption, visual]).size !== 4 ||
      [time, voice, caption, visual].includes(-1)
    )
      issues.push(
        "표에서 시간·내레이션·장면 설명·자막 열을 구분하지 못했어요. 열 제목을 확인해 주세요.",
      );
    else
      for (const line of lines.slice(headerIndex + 1)) {
        if (!line.includes("|")) {
          if (/^\*{0,2}\d+\s*[~～–—-]/.test(line))
            issues.push(
              "시간이 있는 행에서 표 구분 기호가 빠졌어요. 해당 행을 확인해 주세요.",
            );
          continue; // Headings and references stay in the stored original.
        }
        const row = cells(line);
        if (row.every((v) => /^:?-+:?$/.test(v.replace(/\s/g, "")))) continue;
        if (row.length !== header.length) {
          issues.push(
            `${scenes.length + 1}번째 장면의 표 칸 수를 확인해 주세요.`,
          );
          continue;
        }
        const timing = clean(row[time]!);
        const match = timing.match(
          /^(\d+(?:\.\d+)?)\s*(?:초|s)?\s*[~～\-–—]\s*(\d+(?:\.\d+)?)\s*(?:초|s)?$/i,
        );
        if (!match) {
          issues.push(
            `${scenes.length + 1}번째 장면의 시간을 ‘0~3초’처럼 적어 주세요.`,
          );
          continue;
        }
        scenes.push({
          startSeconds: Number(match[1]),
          endSeconds: Number(match[2]),
          narration: clean(row[voice]!),
          visualDescription: clean(row[visual]!),
          onScreenText: clean(row[caption]!),
        });
      }
  }
  if (scenes.length < 2 || scenes.length > 16)
    issues.push(
      "장면은 2~16개가 필요해요. 표는 한 행을 한 장면으로, 일반 대본은 한 문단을 한 장면으로 읽습니다.",
    );
  scenes.forEach((scene, index) => {
    if (!scene.narration || scene.narration.length > 800)
      issues.push(`${index + 1}번 장면의 대사는 1~800자로 확인해 주세요.`);
    if (scene.visualDescription.length > 600 || scene.onScreenText.length > 80)
      issues.push(
        `${index + 1}번 장면은 화면 설명 600자, 자막 80자 이내로 적어 주세요.`,
      );
    if (
      scene.endSeconds <= scene.startSeconds ||
      (isTable && scene.startSeconds !== (scenes[index - 1]?.endSeconds ?? 0))
    )
      issues.push(
        `${index + 1}번 장면의 시간이 앞 장면과 이어지지 않아요. 시작·종료 시간을 확인해 주세요.`,
      );
  });
  if (
    isTable &&
    scenes.length &&
    (scenes[0]!.startSeconds !== 0 ||
      scenes.at(-1)!.endSeconds < 5 ||
      scenes.at(-1)!.endSeconds > 180)
  )
    issues.push(
      "첫 장면은 0초에서 시작하고 전체 길이는 5~180초로 확인해 주세요.",
    );
  return { scenes, issues, isTable };
}
