import { z } from 'zod';
import type { ModProject } from '@mlf/core';
import { buildBundle, type BundleResourcePack, exportProjects, type ExportResult, type QuestPart } from '@mlf/core/export';
import { noProtoKey, questApiSchema, questProject, questTranslations } from '@mlf/core/ftbquests';
import {
  type CatalogModpack, catalogModpackSchema, includedModIds, isValidNamespace, type KubejsData, kubejsProjects, langRecordSchema, modpackRef,
  type QuestData, resolvedModpackModSchema, type ResolvedModpackMod,
} from '@mlf/core/modpack';
import { modpackApiUrl } from '../lib/config';
import { fetchModData, type ModPayload, payloadToProject } from './downloadPack';

type FetchLike = NonNullable<Parameters<typeof fetchModData>[1]>;

export interface ModpackPayload {
  readonly meta: CatalogModpack;
  readonly mods: readonly ResolvedModpackMod[];
  readonly kubejs: KubejsData;
  /** FTB 任務文字；只在 supported 時存在 */
  readonly ftbquests?: QuestData;
}

/** 命名空間會成為資源包路徑 assets/<ns>/lang/，不合法者整份 payload 視為無效 */
const namespace = z.string().refine(isValidNamespace, { message: '命名空間不合法' });

/** 任務的 layout 決定 config/ 底下的輸出路徑，只接受 single／split；key 必須符合 FTB 任務 key 規則 */
const payloadSchema = z.object({
  version: z.literal(1),
  meta: catalogModpackSchema,
  mods: z.array(resolvedModpackModSchema),
  kubejs: noProtoKey.pipe(z.record(namespace, z.object({ en_us: langRecordSchema, zh_tw: langRecordSchema }))),
  ftbquests: questApiSchema.optional(),
});

export async function fetchModpackData(id: string, fetchImpl: FetchLike = fetch): Promise<ModpackPayload> {
  const res = await fetchImpl(modpackApiUrl(id));
  if (!res.ok) throw new Error(`HTTP ${res.status} for modpack ${id}`);
  const body = payloadSchema.parse(await res.json());
  const quests = body.ftbquests?.status === 'supported'
    ? { layout: body.ftbquests.layout, en: body.ftbquests.en_us, zh: body.ftbquests.zh_tw }
    : undefined;
  return {
    meta: body.meta,
    mods: body.mods,
    kubejs: Object.fromEntries(Object.entries(body.kubejs).map(([ns, texts]) => [ns, { en: texts.en_us, zh: texts.zh_tw }])),
    ...(quests ? { ftbquests: quests } : {}),
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

/** 未翻譯的 KubeJS 條目不寫入：遊戲本來就會退回 KubeJS 自己的英文，寫入只會蓋掉既有的中文 */
function translatedOnly(project: ModProject): ModProject {
  return { ...project, entries: project.entries.filter((e) => e.target !== '') };
}

/** 下載檔中 resourcepacks/ 底下的資源包檔名 */
export function modpackResourcePackName(id: string): string {
  return `${id}-zh_tw.zip`;
}

/** 已收錄模組（含手冊）＋ KubeJS 譯文合成一個資源包；pack_format 依整合包的 Minecraft 版本；沒有任何內容時為 null */
async function resourcePack(pack: ModpackPayload, mods: readonly ModPayload[]): Promise<BundleResourcePack | null> {
  const projects = [
    ...mods.map(payloadToProject),
    ...kubejsProjects(modpackRef(pack.meta), pack.kubejs, 0).map(translatedOnly),
  ];
  if (projects.length === 0) return null;
  const result = await exportProjects(projects, {
    kind: 'merged-pack',
    untranslated: 'keep-source',
    mcVersion: pack.meta.source.mcVersion,
    description: `ModLangForge 繁中翻譯 · ${pack.meta.name} · ${new Date().toISOString().slice(0, 10)}`,
  });
  return { fileName: modpackResourcePackName(pack.meta.id), bytes: new Uint8Array(await result.blob.arrayBuffer()) };
}

/** 任務檔只含已翻譯條目（未翻譯的由遊戲退回英文） */
function questParts(pack: ModpackPayload): QuestPart[] {
  if (!pack.ftbquests) return [];
  const translations = questTranslations(questProject(modpackRef(pack.meta), pack.ftbquests, 0));
  return [{ modpackId: pack.meta.id, layout: pack.ftbquests.layout, translations }];
}

/** 兩部分的一鍵下載：resourcepacks/<id>-zh_tw.zip ＋ config/ 的 FTB 任務翻譯（有已翻條目時）＋安裝說明 */
export async function buildModpackPack(pack: ModpackPayload, mods: readonly ModPayload[]): Promise<ExportResult> {
  const blob = await buildBundle({
    title: `ModLangForge 繁中翻譯 · ${pack.meta.name}`,
    resourcePack: await resourcePack(pack, mods),
    quests: questParts(pack),
  });
  return { fileName: modpackPackFileName(pack.meta.id, pack.meta.source.mcVersion), blob };
}
