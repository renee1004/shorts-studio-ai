import {
  importedScriptTextSchema,
  structuredScriptSchema,
} from "@shorts-os/contracts";
import { DomainError, estimateSpokenSeconds } from "@shorts-os/domain";

/** Keep the user's narration; only create editable, evenly timed scene boundaries. */
export function structureImportedScript(
  title: string,
  text: string,
  duration = 45,
) {
  const parsed = importedScriptTextSchema.safeParse(text);
  if (!parsed.success)
    throw new DomainError(
      "VALIDATION_FAILED",
      "대본은 장면별로 줄을 나눠 2~16개 문단으로 입력해 주세요. 문단당 최대 800자입니다.",
    );
  const lines = parsed.data.split("\n");
  return structuredScriptSchema.parse({
    title,
    hook: lines[0]!.slice(0, 500),
    targetDurationSeconds: duration,
    beats: lines.map((narration, index) => ({
      beatId: `b${index + 1}`,
      startSeconds: (index * duration) / lines.length,
      endSeconds: ((index + 1) * duration) / lines.length,
      purpose:
        index === 0 ? "hook" : index === lines.length - 1 ? "cta" : "content",
      narration,
      onScreenText: "",
      claimKeys: [`import-${index + 1}`],
    })),
    cta: { type: "user_supplied", text: lines.at(-1)!.slice(0, 300) },
    factualClaims: lines.map((statement, index) => ({
      claimKey: `import-${index + 1}`,
      statement,
      unverified: true,
      citationIndexes: [],
      sourceIds: [],
    })),
    estimatedDurationSeconds: estimateSpokenSeconds(lines.join("\n")),
  });
}
