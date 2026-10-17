import { z } from 'zod';
import { LOADERS } from '../catalog/schema';
import { PACK_FORMATS } from '../export/packFormats';
import type { ModpackLoader } from '../modpack/schema';
import { ModpackImportError, parseOrThrow } from './errors';

export interface PackBasics {
  readonly mcVersion: string;
  readonly loader: ModpackLoader;
}

export interface ParsedMrpack extends PackBasics {
  readonly projectIds: readonly string[];
  /** mods/ 底下不是 Modrinth CDN 來源的檔案 */
  readonly unknownFiles: readonly string[];
}

export interface ParsedCurseManifest extends PackBasics {
  readonly projectIds: readonly string[];
  readonly version?: string;
}

const mrpackSchema = z.object({
  formatVersion: z.literal(1),
  game: z.literal('minecraft'),
  files: z.array(z.object({ path: z.string(), downloads: z.array(z.string()) })),
  dependencies: z.record(z.string(), z.string()),
});

const curseSchema = z.object({
  manifestType: z.literal('minecraftModpack'),
  version: z.string().min(1).optional(),
  minecraft: z.object({
    version: z.string().min(1),
    modLoaders: z.array(z.object({ id: z.string().min(1), primary: z.boolean().optional() })),
  }),
  files: z.array(z.object({ projectID: z.number().int().positive() })),
});

const MODRINTH_CDN = /^https:\/\/cdn\.modrinth\.com\/data\/([A-Za-z0-9]+)\/versions\//;

/** `https://cdn.modrinth.com/data/<projectId>/versions/…` → projectId */
export function modrinthProjectIdFromUrl(url: string): string | null {
  return MODRINTH_CDN.exec(url)?.[1] ?? null;
}

/** modrinth.index.json 的 dependencies key → 載入器（依序比對） */
const MRPACK_LOADERS: readonly (readonly [string, ModpackLoader])[] = [
  ['neoforge', 'neoforge'],
  ['forge', 'forge'],
  ['quilt-loader', 'quilt'],
  ['fabric-loader', 'fabric'],
];

const NO_LOADER = '沒有支援的模組載入器（forge、neoforge、fabric、quilt）';

function knownMcVersion(version: string): string {
  if (!PACK_FORMATS.some((f) => f.mcVersion === version)) {
    throw new ModpackImportError(`不支援的 Minecraft 版本：${version}（需要先在 PACK_FORMATS 加入）`);
  }
  return version;
}

export function parseMrpackIndex(raw: unknown): ParsedMrpack {
  const index = parseOrThrow(mrpackSchema, raw, 'modrinth.index.json');
  const mc = index.dependencies.minecraft;
  if (!mc) throw new ModpackImportError('modrinth.index.json 缺少 dependencies.minecraft');
  const loader = MRPACK_LOADERS.find(([dep]) => Object.hasOwn(index.dependencies, dep))?.[1];
  if (!loader) throw new ModpackImportError(`modrinth.index.json ${NO_LOADER}`);
  const mods = index.files.filter((f) => f.path.startsWith('mods/'));
  const ids = mods.map((f) => f.downloads.map(modrinthProjectIdFromUrl).find((id) => id !== null) ?? null);
  return {
    mcVersion: knownMcVersion(mc),
    loader,
    projectIds: [...new Set(ids.filter((id): id is string => id !== null))],
    unknownFiles: mods.filter((_, i) => ids[i] === null).map((f) => f.path),
  };
}

const CURSE_LOADER = /^([a-z]+)-/;

export function parseCurseManifest(raw: unknown): ParsedCurseManifest {
  const manifest = parseOrThrow(curseSchema, raw, 'manifest.json');
  const { modLoaders } = manifest.minecraft;
  const primary = modLoaders.find((l) => l.primary === true) ?? modLoaders[0];
  const name = primary ? CURSE_LOADER.exec(primary.id)?.[1] : undefined;
  const loader = LOADERS.find((l) => l === name);
  if (!loader) throw new ModpackImportError(`manifest.json ${NO_LOADER}`);
  return {
    mcVersion: knownMcVersion(manifest.minecraft.version),
    loader,
    projectIds: [...new Set(manifest.files.map((f) => String(f.projectID)))],
    ...(manifest.version ? { version: manifest.version } : {}),
  };
}
