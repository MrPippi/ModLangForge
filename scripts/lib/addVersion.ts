import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { catalogModSchema, toStoredMod } from '@mlf/core/catalog';
import { readJar } from '@mlf/core/jar';
import { writeFilesTogether } from '@mlf/core/node';
import { type ApplyVersionIO, type ExtractedEn, type ModrinthVersion, primaryFile, selectNamespace, sourceOf, uncoveredKeys } from '@mlf/core/pipeline';
import { downloadJar, MODS_DIR, toJson } from './modrinth';

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

async function extractEn(version: ModrinthVersion, modId: string): Promise<ExtractedEn> {
  const jar = await downloadJar(version);
  if (!jar) throw new Error(`${version.version_number} 沒有可用的 jar（或超過大小上限）`);
  const detected = selectNamespace(await readJar(jar, primaryFile(version)?.filename ?? 'mod.jar'), modId);
  if (!detected) throw new Error(`jar 內沒有命名空間為 ${modId} 的 JSON 語言檔`);
  const { keys, builtinPercent } = uncoveredKeys(detected);
  return {
    all: sourceOf(detected, detected.order),
    uncovered: sourceOf(detected, keys),
    ...(builtinPercent !== undefined ? { builtinPercent } : {}),
  };
}

/** 讀寫 data/mods/<modId> 並從 Modrinth 下載 jar */
export const fileIO: ApplyVersionIO = {
  readMod: async (modId) => {
    const dir = join(MODS_DIR, modId);
    return {
      meta: catalogModSchema.parse(await readJsonFile(join(dir, 'mod.json'))),
      en: (await readJsonFile(join(dir, 'en_us.json'))) as Record<string, string>,
    };
  },
  writeMod: async (modId, { meta, en }) => {
    const dir = join(MODS_DIR, modId);
    await writeFilesTogether([
      { path: join(dir, 'mod.json'), content: toJson(toStoredMod(catalogModSchema.parse(meta))) },
      { path: join(dir, 'en_us.json'), content: toJson(en) },
    ]);
  },
  extractEn,
};

/** 同一 Modrinth 版本＋modId 在單次執行內只下載、擷取一次 */
export function cachedExtract(io: ApplyVersionIO): ApplyVersionIO {
  const cache = new Map<string, Promise<ExtractedEn>>();
  return {
    ...io,
    extractEn: (version, modId) => {
      const key = `${version.id}\u0000${modId}`;
      const hit = cache.get(key);
      if (hit) return hit;
      const pending = io.extractEn(version, modId);
      cache.set(key, pending);
      return pending;
    },
  };
}
