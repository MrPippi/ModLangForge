import { z } from 'zod';
import { exportProjects, type ExportResult } from '@mlf/core/export';
import {
  type CatalogModpack, catalogModpackSchema, includedModIds, isValidNamespace, type KubejsData, kubejsProjects, langRecordSchema, modpackRef,
  resolvedModpackModSchema, type ResolvedModpackMod,
} from '@mlf/core/modpack';
import { modpackApiUrl } from '../lib/config';
import { fetchModData, type ModPayload, payloadToProject } from './downloadPack';

type FetchLike = NonNullable<Parameters<typeof fetchModData>[1]>;

export interface ModpackPayload {
  readonly meta: CatalogModpack;
  readonly mods: readonly ResolvedModpackMod[];
  readonly kubejs: KubejsData;
}

/** 命名空間會成為資源包路徑 assets/<ns>/lang/，不合法者整份 payload 視為無效 */
const namespace = z.string().refine(isValidNamespace, { message: '命名空間不合法' });

const payloadSchema = z.object({
  version: z.literal(1),
  meta: catalogModpackSchema,
  mods: z.array(resolvedModpackModSchema),
  kubejs: z.record(namespace, z.object({ en_us: langRecordSchema, zh_tw: langRecordSchema })),
});

export async function fetchModpackData(id: string, fetchImpl: FetchLike = fetch): Promise<ModpackPayload> {
  const res = await fetchImpl(modpackApiUrl(id));
  if (!res.ok) throw new Error(`HTTP ${res.status} for modpack ${id}`);
  const body = payloadSchema.parse(await res.json());
  return {
    meta: body.meta,
    mods: body.mods,
    kubejs: Object.fromEntries(Object.entries(body.kubejs).map(([ns, texts]) => [ns, { en: texts.en_us, zh: texts.zh_tw }])),
  };
}

/** 取得整合包中已收錄的模組；每個 modId 只請求一次，已下架（404）的模組略過 */
export async function fetchIncludedMods(pack: ModpackPayload, fetchImpl: FetchLike = fetch): Promise<ModPayload[]> {
  const payloads = await Promise.all(includedModIds(pack.mods).map((id) => fetchModData(id, fetchImpl)));
  return payloads.filter((p): p is ModPayload => p !== null);
}

export function modpackPackFileName(id: string, mcVersion: string): string {
  return `${id}-zh_tw-${mcVersion}.zip`;
}

/** 已收錄模組（含手冊）＋ KubeJS 譯文合成一個資源包；pack_format 依整合包的 Minecraft 版本，未翻譯的條目保留英文 */
export async function buildModpackPack(pack: ModpackPayload, mods: readonly ModPayload[]): Promise<ExportResult> {
  const projects = [...mods.map(payloadToProject), ...kubejsProjects(modpackRef(pack.meta), pack.kubejs, 0)];
  const { mcVersion } = pack.meta.source;
  const result = await exportProjects(projects, {
    kind: 'merged-pack',
    untranslated: 'keep-source',
    mcVersion,
    description: `ModLangForge 繁中翻譯 · ${pack.meta.name} · ${new Date().toISOString().slice(0, 10)}`,
  });
  return { ...result, fileName: modpackPackFileName(pack.meta.id, mcVersion) };
}
