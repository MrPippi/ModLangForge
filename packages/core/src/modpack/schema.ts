import { z } from 'zod';
import { httpsUrl, knownMcVersion, LICENSE_ALLOWLIST, LOADERS, MOD_ID_PATTERN, SUMMARY_MAX, TRANSLATION_STATUSES } from '../catalog/schema';
import { ftbquestsMetaSchema } from '../ftbquests/schema';

/** 整合包 id 規則同模組 modId */
export const MODPACK_ID_PATTERN = MOD_ID_PATTERN;
/** KubeJS 命名空間規則同 jar 命名空間 */
export const NAMESPACE_PATTERN = /^[a-z0-9_.-]+$/;
export const MODPACK_PLATFORMS = ['modrinth', 'curseforge'] as const;

export type ModpackPlatform = (typeof MODPACK_PLATFORMS)[number];
export type ModpackLoader = (typeof LOADERS)[number];

/** index 保留給 /api/v1/modpacks/index.json */
const RESERVED_MODPACK_IDS: ReadonlySet<string> = new Set(['.', '..', 'index']);

export function isValidModpackId(id: string): boolean {
  return MODPACK_ID_PATTERN.test(id) && !RESERVED_MODPACK_IDS.has(id);
}

/** 同時排除 . 與 ..，避免資料夾或資源包路徑跳脫 */
export function isValidNamespace(ns: string): boolean {
  return NAMESPACE_PATTERN.test(ns) && ns !== '.' && ns !== '..';
}

/** 語言檔：key → 文字 */
export const langRecordSchema = z.record(z.string(), z.string());

const platform = z.enum(MODPACK_PLATFORMS);

export const modpackModSchema = z.object({
  platform,
  projectId: z.string().min(1),
  slug: z.string().min(1),
});

export type ModpackMod = z.infer<typeof modpackModSchema>;

export function modpackModKey(m: Pick<ModpackMod, 'platform' | 'projectId'>): string {
  return `${m.platform}:${m.projectId}`;
}

/** 目前收錄的整合包版本 */
export const modpackSourceSchema = z.object({
  platform,
  projectId: z.string().min(1),
  version: z.string().min(1),
  mcVersion: knownMcVersion,
  loader: z.enum(LOADERS),
});

export type ModpackSource = z.infer<typeof modpackSourceSchema>;

const links = z
  .object({ modrinth: httpsUrl.optional(), curseforge: httpsUrl.optional(), homepage: httpsUrl.optional() })
  .refine((l) => Object.values(l).some((v) => v !== undefined), { message: '至少需要一個連結' });

const mods = z
  .array(modpackModSchema)
  .refine((list) => new Set(list.map(modpackModKey)).size === list.length, { message: '模組（平台＋專案 ID）不可重複' });

export const catalogModpackSchema = z.object({
  id: z.string().refine(isValidModpackId, { message: 'id 只能包含 a-z 0-9 _ . -，且不可為 .、.. 或 index' }),
  name: z.string().min(1),
  nameZh: z.string().min(1).optional(),
  summary: z.string().min(1).max(SUMMARY_MAX),
  authors: z.array(z.string().min(1)).min(1),
  links,
  source: modpackSourceSchema,
  mods,
  translation: z.object({
    status: z.enum(TRANSLATION_STATUSES),
    license: z.enum(LICENSE_ALLOWLIST),
    source: z.object({ name: z.string().min(1), url: httpsUrl.nullable() }),
    contributors: z.array(z.string().min(1)).default([]),
  }),
  /** FTB 任務；沒有任務檔時不寫 */
  ftbquests: ftbquestsMetaSchema.optional(),
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: '日期格式須為 YYYY-MM-DD' }),
});

export type CatalogModpack = z.infer<typeof catalogModpackSchema>;
