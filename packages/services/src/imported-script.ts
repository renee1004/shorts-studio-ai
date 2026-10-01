import {
  importedScriptTextSchema,
  parseImportedScenes,
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
      parsed.error.issues[0]?.message ?? "대본을 확인해 주세요.",
    );
  const { scenes, isTable } = parseImportedScenes(parsed.data, duration);
  const lines = scenes.map((scene) => scene.narration);
  if (isTable) duration = Math.ceil(scenes.at(-1)!.endSeconds);
  return structuredScriptSchema.parse({
    title,
    hook: lines[0]!.slice(0, 500),
    targetDurationSeconds: duration,
    beats: lines.map((narration, index) => ({
      beatId: `b${index + 1}`,
      startSeconds: scenes[index]!.startSeconds,
      endSeconds: scenes[index]!.endSeconds,
      purpose:
        index === 0 ? "hook" : index === lines.length - 1 ? "cta" : "content",
      narration,
      onScreenText: scenes[index]!.onScreenText,
      ...(isTable
        ? { visualDescription: scenes[index]!.visualDescription }
        : {}),
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
