import { parseImportedScenes } from "./script-import";
import { z } from "zod";

export const importedScriptTextSchema = z
  .string()
  .max(500000)
  .transform((text) =>
    parseImportedScenes(text).isTable
      ? text
      : text
          .split(/\n+/)
          .map((line) => line.trim())
          .filter(Boolean)
          .join("\n"),
  )
  .superRefine((text, context) => {
    for (const message of parseImportedScenes(text).issues)
      context.addIssue({ code: "custom", message });
  });

const common = {
  topic: z.string().trim().min(2).max(200),
  operationId: z.string().uuid(),
};
const creationModesSchema = z.discriminatedUnion("mode", [
  z.object({
    ...common,
    mode: z.literal("topic"),
    suppliedText: z
      .string()
      .max(12800)
      .optional()
      .transform(() => ""),
  }),
  z.object({
    ...common,
    mode: z.literal("notes"),
    suppliedText: z
      .string()
      .trim()
      .min(1, "자료를 입력해 주세요.")
      .max(4000, "정리 자료는 4,000자 이내로 입력해 주세요."),
  }),
  z.object({
    ...common,
    mode: z.literal("script"),
    suppliedText: importedScriptTextSchema,
  }),
]);
// Keep older topic-only clients working after a deployment.
export const creationInputSchema = z.preprocess((value) => {
  if (value && typeof value === "object" && !("mode" in value))
    return { ...value, mode: "topic" };
  return value;
}, creationModesSchema);
