import { z } from "zod";

export const importedScriptTextSchema = z
  .string()
  .max(20000)
  .transform((text) =>
    text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n"),
  )
  .superRefine((text, context) => {
    const lines = text.split("\n");
    if (
      lines.length < 2 ||
      lines.length > 16 ||
      lines.some((line) => line.length > 800)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "대본은 장면별로 줄을 나눠 2~16개 문단으로 입력해 주세요. 문단당 최대 800자입니다.",
      });
    }
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
