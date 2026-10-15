import type JSZip from 'jszip';
import { parse as parseToml } from 'smol-toml';

export interface ModMeta {
  readonly modId: string;
  readonly name: string;
  readonly version: string;
}

type MetaParser = (text: string) => ModMeta[];

const UNKNOWN = 'unknown';

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** 版本字串含 ${...}（建置時代入）時視為未知 */
function cleanVersion(value: unknown): string {
  const v = str(value);
  return v === undefined || v.includes('${') ? UNKNOWN : v;
}

function toMeta(id: unknown, name: unknown, version: unknown): ModMeta[] {
  const modId = str(id);
  return modId ? [{ modId, name: str(name) ?? modId, version: cleanVersion(version) }] : [];
}

const parseFabric: MetaParser = (text) => {
  const d = JSON.parse(text) as Record<string, unknown>;
  return toMeta(d.id, d.name, d.version);
};

const parseQuilt: MetaParser = (text) => {
  const loader = ((JSON.parse(text) as Record<string, unknown>).quilt_loader ?? {}) as Record<string, unknown>;
  const meta = (loader.metadata ?? {}) as Record<string, unknown>;
  return toMeta(loader.id, meta.name, loader.version);
};

const parseModsToml: MetaParser = (text) => {
  const mods = parseToml(text).mods;
  if (!Array.isArray(mods)) return [];
  return mods.flatMap((m) => {
    const r = m as Record<string, unknown>;
    return toMeta(r.modId, r.displayName, r.version);
  });
};

const parseMcmodInfo: MetaParser = (text) => {
  const d = JSON.parse(text) as unknown;
  const list = Array.isArray(d) ? d : ((d as Record<string, unknown>)?.modList ?? []);
  if (!Array.isArray(list)) return [];
  return list.flatMap((m) => {
    const r = m as Record<string, unknown>;
    return toMeta(r.modid, r.name, r.version);
  });
};

const SOURCES: readonly (readonly [string, MetaParser])[] = [
  ['fabric.mod.json', parseFabric],
  ['quilt.mod.json', parseQuilt],
  ['META-INF/neoforge.mods.toml', parseModsToml],
  ['META-INF/mods.toml', parseModsToml],
  ['mcmod.info', parseMcmodInfo],
];

/** 依序讀取各載入器的 metadata；損壞的檔案直接略過 */
export async function readModMetadata(zip: JSZip): Promise<ModMeta[]> {
  const results = await Promise.all(
    SOURCES.map(async ([path, parse]) => {
      const file = zip.file(path);
      if (!file) return [];
      try {
        return parse(await file.async('string'));
      } catch {
        return [];
      }
    }),
  );
  return results.flat();
}
