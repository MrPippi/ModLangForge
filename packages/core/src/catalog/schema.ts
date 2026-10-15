import { z } from 'zod';
import { PACK_FORMATS } from '../export/packFormats';

export const MOD_ID_PATTERN = /^[a-z0-9_.-]+$/;
export const LOADERS = ['forge', 'neoforge', 'fabric', 'quilt'] as const;
export const TRANSLATION_STATUSES = ['machine', 'partial', 'reviewed'] as const;
export const SUMMARY_MAX = 120;
/** 允許收錄的譯文授權；匯入外部翻譯時必須是其中之一 */
export const LICENSE_ALLOWLIST = ['CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-SA-4.0', 'CC0-1.0'] as const;

const httpsUrl = z.url().refine((u) => u.startsWith('https://'), { message: '只接受 https:// 網址' });

const knownMcVersion = z
  .string()
  .refine((v) => PACK_FORMATS.some((f) => f.mcVersion === v), { message: '不支援的 Minecraft 版本' });

const links = z
  .object({
    modrinth: httpsUrl.optional(),
    curseforge: httpsUrl.optional(),
    source: httpsUrl.optional(),
    homepage: httpsUrl.optional(),
  })
  .refine((l) => Object.values(l).some((v) => v !== undefined), { message: '至少需要一個連結' });

export const catalogModSchema = z.object({
  modId: z
    .string()
    .regex(MOD_ID_PATTERN, { message: 'modId 只能包含 a-z 0-9 _ . -' })
    .refine((id) => id !== '.' && id !== '..', { message: 'modId 不可為 . 或 ..' }),
  name: z.string().min(1),
  nameZh: z.string().min(1).optional(),
  aliases: z.array(z.string().min(1)).default([]),
  summary: z.string().min(1).max(SUMMARY_MAX),
  authors: z.array(z.string().min(1)).min(1),
  links,
  modVersion: z.string().min(1).optional(),
  mcVersions: z.array(knownMcVersion).min(1),
  loaders: z.array(z.enum(LOADERS)).min(1),
  format: z.enum(['json', 'lang']),
  translation: z.object({
    status: z.enum(TRANSLATION_STATUSES),
    license: z.enum(LICENSE_ALLOWLIST),
    source: z.object({ name: z.string().min(1), url: httpsUrl.nullable() }),
    contributors: z.array(z.string().min(1)).default([]),
    /** 模組 jar 內建繁中涵蓋率；有值時本站只收錄內建缺少的 key */
    builtinPercent: z.number().int().min(0).max(100).optional(),
  }),
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: '日期格式須為 YYYY-MM-DD' }),
});

export type CatalogMod = z.infer<typeof catalogModSchema>;
export type TranslationStatus = CatalogMod['translation']['status'];
