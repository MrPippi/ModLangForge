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
