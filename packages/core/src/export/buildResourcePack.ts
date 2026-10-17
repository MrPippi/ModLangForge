import JSZip from 'jszip';
import { isQuestProjectId, parseQuestProjectId } from '../ftbquests/ids';
import { questLayoutOf, questTranslations } from '../ftbquests/project';
import type { ModProject } from '../types';
import { buildGuidePackFiles } from './buildGuideFiles';
import { buildLangText, langFileName } from './buildLangFiles';
import { mergeSameNamespace } from './mergeNamespaces';
import { packFormatFor, packMcmeta as buildPackMcmeta } from './packFormats';
import { questFiles, type QuestPart } from './questFiles';
import type { ExportOptions, ExportResult } from './types';

const ZIP_MIME = 'application/zip';
const MERGED_FILE = 'ModLangForge-zh_tw.zip';
const SEPARATE_FILE = 'ModLangForge-packs.zip';
const LANG_FILE = 'ModLangForge-lang.zip';

function zipBytes(zip: JSZip): Promise<Uint8Array> {
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

async function zipToBlob(zip: JSZip): Promise<Blob> {
  return new Blob([(await zipBytes(zip)) as BlobPart], { type: ZIP_MIME });
}

function packMcmeta(opts: ExportOptions): string {
  return JSON.stringify(buildPackMcmeta(packFormatFor(opts.mcVersion), opts.description), null, 2) + '\n';
}

function buildPackZip(projects: readonly ModProject[], opts: ExportOptions): JSZip {
  const zip = new JSZip();
  zip.file('pack.mcmeta', packMcmeta(opts));
  for (const p of projects) {
    zip.file(`assets/${p.modId}/lang/${langFileName(p.format)}`, buildLangText(p, opts.untranslated));
    for (const [path, text] of buildGuidePackFiles(p)) zip.file(path, text);
  }
  return zip;
}

async function separateZip(projects: readonly ModProject[], opts: ExportOptions): Promise<JSZip> {
  const outer = new JSZip();
  const used = new Map<string, number>();
  for (const p of projects) {
    const inner = await zipBytes(buildPackZip([p], opts));
    const count = (used.get(p.modId) ?? 0) + 1;
    used.set(p.modId, count);
    outer.file(count === 1 ? `${p.modId}-zh_tw.zip` : `${p.modId}-${count}-zh_tw.zip`, inner);
  }
  return outer;
}

function langZip(projects: readonly ModProject[], opts: ExportOptions): JSZip {
  const zip = new JSZip();
  for (const p of projects) zip.file(`${p.modId}/${langFileName(p.format)}`, buildLangText(p, opts.untranslated));
  return zip;
}

async function langFiles(projects: readonly ModProject[], opts: ExportOptions): Promise<ExportResult> {
  const [only] = projects;
  if (projects.length === 1 && only) {
    const mime = only.format === 'json' ? 'application/json' : 'text/plain';
    const blob = new Blob([buildLangText(only, opts.untranslated)], { type: `${mime};charset=utf-8` });
    return { fileName: langFileName(only.format), blob };
  }
  return { fileName: LANG_FILE, blob: await zipToBlob(langZip(projects, opts)) };
}

function questParts(projects: readonly ModProject[]): QuestPart[] {
  return projects.flatMap((p) => {
    const ref = parseQuestProjectId(p.id);
    return ref ? [{ modpackId: ref.modpackId, layout: questLayoutOf(p), translations: questTranslations(p) }] : [];
  });
}

/** 資源包／語言檔；任務專案不屬於資源包，會被略過（用 exportFiles 一併取得任務檔） */
export async function exportProjects(allProjects: readonly ModProject[], opts: ExportOptions): Promise<ExportResult> {
  const projects = allProjects.filter((p) => !isQuestProjectId(p.id));
  if (projects.length === 0) throw new Error('No projects selected for export');
  switch (opts.kind) {
    case 'merged-pack':
      return { fileName: MERGED_FILE, blob: await zipToBlob(buildPackZip(mergeSameNamespace(projects), opts)) };
    case 'separate-packs':
      return { fileName: SEPARATE_FILE, blob: await zipToBlob(await separateZip(projects, opts)) };
    case 'lang-files':
      return langFiles(mergeSameNamespace(projects), opts);
  }
}

/** 譯者下載：資源包（有非任務專案時）＋ 每個整合包一個任務檔，各自獨立下載、沒有外層壓縮檔 */
export async function exportFiles(projects: readonly ModProject[], opts: ExportOptions): Promise<ExportResult[]> {
  if (projects.length === 0) throw new Error('No projects selected for export');
  const quests = questFiles(questParts(projects));
  const hasPack = projects.some((p) => !isQuestProjectId(p.id));
  const files = [...(hasPack ? [await exportProjects(projects, opts)] : []), ...quests];
  if (files.length === 0) throw new Error('Nothing to export: no translated quest text');
  return files;
}
