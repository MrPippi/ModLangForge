import { z } from 'zod';
import { PACK_FORMATS } from '../export/packFormats';

export const MOD_ID_PATTERN = /^[a-z0-9_.-]+$/;
export const LOADERS = ['forge', 'neoforge', 'fabric', 'quilt'] as const;
export const TRANSLATION_STATUSES = ['machine', 'partial', 'reviewed'] as const;
export const SUMMARY_MAX = 120;
/** 允許收錄的譯文授權；匯入外部翻譯時必須是其中之一 */
export const LICENSE_ALLOWLIST = ['CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-SA-4.0', 'CC0-1.0'] as const;

export const httpsUrl = z.url().refine((u) => u.startsWith('https://'), { message: '只接受 https:// 網址' });

export const knownMcVersion = z
  .string()
  .refine((v) => PACK_FORMATS.some((f) => f.mcVersion === v), { message: '不支援的 Minecraft 版本' });

export const links = z
  .object({
    modrinth: httpsUrl.optional(),
    curseforge: httpsUrl.optional(),
    source: httpsUrl.optional(),
    homepage: httpsUrl.optional(),
  })
  .refine((l) => Object.values(l).some((v) => v !== undefined), { message: '至少需要一個連結' });

export const sourceVersionSchema = z.object({
  /** 抽取語言檔的 jar 版本；投稿者不清楚時可省略 */
  modVersion: z.string().min(1).optional(),
  mcVersion: knownMcVersion,
  loader: z.enum(LOADERS),
  /** en_us.json 中、此版本 jar 沒有（或模組內建繁中已涵蓋）的 key */
  missingKeys: z.array(z.string().min(1)).default([]),
});

export type SourceVersion = z.infer<typeof sourceVersionSchema>;

export function sourceVersionId(v: Pick<SourceVersion, 'modVersion' | 'mcVersion' | 'loader'>): string {
  return `${v.modVersion ?? ''}|${v.mcVersion}|${v.loader}`;
}

/**
 * mod.json 內的儲存格式：同一建置在多個載入器的內容相同時，可寫成一列並以 loaders 列出全部載入器。
 * 讀取時展開成每個載入器一列，程式內一律使用展開後的 SourceVersion。
 */
const groupedSourceVersionSchema = sourceVersionSchema
  .omit({ loader: true })
  .extend({
    loaders: z
      .array(z.enum(LOADERS))
      .min(2, { message: 'loaders 至少要有兩個載入器；只有一個時請用 loader' })
      .refine((list) => new Set(list).size === list.length, { message: 'loaders 不可重複' }),
  })
  .strict();

export type GroupedSourceVersion = z.infer<typeof groupedSourceVersionSchema>;
export type StoredSourceVersion = SourceVersion | GroupedSourceVersion;

const storedSourceVersionSchema = z.union([sourceVersionSchema.strict(), groupedSourceVersionSchema]);

function expandSourceVersions(rows: readonly StoredSourceVersion[]): SourceVersion[] {
  return rows.flatMap((row) => {
    if (!('loaders' in row)) return [row];
    const { loaders, ...rest } = row;
    return loaders.map((loader) => ({ ...rest, loader }));
  });
}

const sourceVersions = z
  .array(storedSourceVersionSchema)
  .min(1)
  .transform(expandSourceVersions)
  .refine((list) => new Set(list.map(sourceVersionId)).size === list.length, { message: '來源版本不可重複' });

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
  sourceVersions,
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
  /** 追蹤新版本時不收錄的 key 前綴（例如 jar 內附的其他模組文字、開發者測試用 key） */
  excludeKeyPrefixes: z.array(z.string().min(1)).min(1).optional(),
});

export type CatalogMod = z.infer<typeof catalogModSchema>;
export type TranslationStatus = CatalogMod['translation']['status'];
