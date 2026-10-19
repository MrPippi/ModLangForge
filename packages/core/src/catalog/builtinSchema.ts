import { z } from 'zod';
import { curseforgeSlug } from '../modpack/resolve';
import { knownMcVersion, links, LOADERS, MOD_ID_PATTERN, SUMMARY_MAX } from './schema';

export const BUILTIN_DIR = 'builtin-mods';

/** 模組 jar 已內建完整繁中：只收錄輕量條目，不含任何譯文 */
export const builtinModSchema = z
  .object({
    modId: z
      .string()
      .regex(MOD_ID_PATTERN, { message: 'modId 只能包含 a-z 0-9 _ . -' })
      .refine((id) => id !== '.' && id !== '..', { message: 'modId 不可為 . 或 ..' }),
    name: z.string().min(1),
    aliases: z.array(z.string().min(1)).default([]),
    summary: z.string().min(1).max(SUMMARY_MAX),
    authors: z.array(z.string().min(1)).min(1),
    links: links.refine((l) => l.modrinth !== undefined || l.curseforge !== undefined, {
      message: '內建條目必須提供 Modrinth 或 CurseForge 連結',
    }),
    mcVersions: z.array(knownMcVersion).min(1),
    loaders: z.array(z.enum(LOADERS)).min(1),
    /** 確認內建繁中完整時所檢查的 jar 版本 */
    checkedVersion: z.object({
      modVersion: z.string().min(1),
      mcVersion: knownMcVersion,
      loader: z.enum(LOADERS),
    }),
    updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: '日期格式須為 YYYY-MM-DD' }),
  })
  .strict();

export type BuiltinMod = z.infer<typeof builtinModSchema>;

/** 同一 modId 不可同時存在於 data/mods 與 data/builtin-mods */
export function checkBuiltinConflicts(modIds: Iterable<string>, builtinIds: Iterable<string>): string[] {
  const builtin = new Set(builtinIds);
  return [...modIds].filter((id) => builtin.has(id)).map((id) => `${id} 同時存在於 data/mods 與 data/builtin-mods`);
}

/** 沒有 Modrinth 連結的模組靠 CurseForge 連結追蹤，連結必須能解析出 slug */
export function checkCurseforgeLinks(
  mods: readonly { modId: string; links: { modrinth?: string; curseforge?: string } }[],
): readonly string[] {
  return mods
    .filter((m) => m.links.modrinth === undefined && m.links.curseforge !== undefined && curseforgeSlug(m.links.curseforge) === null)
    .map((m) => `${m.modId}: CurseForge 連結格式不符（應為 https://www.curseforge.com/minecraft/mc-mods/<slug>）`);
}
