import { z } from "zod";

export const notebookItemSchema = z.object({
  notebookId: z.string().uuid(),
  itemId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),
  kind: z.enum(["note", "report"]),
});
export const notebookDocumentSchema = notebookItemSchema.extend({
  title: z.string().max(2000),
  // Preserve the source exactly, including whitespace and Markdown. Never trim.
  text: z
    .string()
    .min(1)
    .max(500000)
    .refine(
      (text) => text.trim().length > 0,
      "비어 있는 원문은 저장할 수 없습니다.",
    ),
});
export type NotebookDocument = z.infer<typeof notebookDocumentSchema>;
