import { z } from 'zod';

export const GLOSSARY_LEVELS = ['warning', 'error'] as const;
export type GlossaryLevel = (typeof GLOSSARY_LEVELS)[number];

export const glossaryTermSchema = z.object({
  en: z.string().trim().min(1),
  zh: z.string().trim().min(1),
  level: z.enum(GLOSSARY_LEVELS).default('warning'),
  note: z.string().optional(),
});

export const glossaryFileSchema = z.object({
  terms: z.array(glossaryTermSchema),
});

export type GlossaryTerm = z.output<typeof glossaryTermSchema>;

/** 術語檔專用：拒絕未知欄位（例如把 level 打成 levle），避免設定被默默忽略 */
export const strictGlossaryFileSchema = z.strictObject({
  terms: z.array(z.strictObject(glossaryTermSchema.shape)),
});
