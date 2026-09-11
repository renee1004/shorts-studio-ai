import { describe, expect, it } from "vitest";
import { parseImportedScenes } from "./script-import";
import { creationInputSchema } from "./creation";
export const tableFixture = `# 대본\r\n| 시간 | 내레이션(말하는 문장) | 화면에 보이는 것 | 화면 자막(최대 12자) |\r\n| :--- | --- | --- | ---: |\r\n| **0~3초** | **첫 문장입니다.** [4] | 파란 배경 [4] | **첫 자막** |\r\n| **3~12초** | 둘째 문장입니다. [2, 4] | 서류 화면 | 둘째 자막 |\r\n\r\n[4] https://example.com/source\r\n`;
describe("imported script tables", () => {
  it("maps the screenshot format and preserves the original and reference list", () => {
    const parsed = parseImportedScenes(tableFixture);
    expect(parsed.issues).toEqual([]);
    expect(parsed.scenes).toEqual([
      {
        startSeconds: 0,
        endSeconds: 3,
        narration: "첫 문장입니다.",
        visualDescription: "파란 배경",
        onScreenText: "첫 자막",
      },
      {
        startSeconds: 3,
        endSeconds: 12,
        narration: "둘째 문장입니다.",
        visualDescription: "서류 화면",
        onScreenText: "둘째 자막",
      },
    ]);
    expect(
      creationInputSchema.parse({
        mode: "script",
        topic: "표 대본",
        operationId: "00000000-0000-4000-8000-000000000001",
        suppliedText: tableFixture,
      }).suppliedText,
    ).toBe(tableFixture);
  });
  it("rejects overlap, gaps, reversed times, and broken cells instead of dropping them", () => {
    for (const text of [
      tableFixture.replace("3~12", "2~12"),
      tableFixture.replace("3~12", "4~12"),
      tableFixture.replace("3~12", "3~2"),
      tableFixture.replace("서류 화면", "서류 | 화면"),
    ])
      expect(parseImportedScenes(text).issues.length).toBeGreaterThan(0);
  });
  it("supports escaped pipes, HTML breaks and decimal seconds", () => {
    const text = tableFixture
      .replaceAll("3초", "3.5초")
      .replace("3~12", "3.5~12")
      .replace("서류 화면", "서류 \\| 화면<br>계속");
    const parsed = parseImportedScenes(text);
    expect(parsed.issues).toEqual([]);
    expect(parsed.scenes[1]!.visualDescription).toBe("서류 | 화면 계속");
  });
  it("keeps ordinary narration unchanged, including numbers in brackets", () => {
    expect(
      parseImportedScenes("첫 문장 [4]\n둘째 문장").scenes[0]!.narration,
    ).toBe("첫 문장 [4]");
  });
  it("does not read an unrecognized table as narration", () => {
    expect(
      parseImportedScenes("| a | b |\n| c | d |").issues.length,
    ).toBeGreaterThan(0);
  });
});
