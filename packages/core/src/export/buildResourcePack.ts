import JSZip from 'jszip';
import { isQuestProjectId, parseQuestProjectId } from '../ftbquests/ids';
import { questLayoutOf, questTranslations } from '../ftbquests/project';
import type { ModProject } from '../types';
import { buildGuidePackFiles } from './buildGuideFiles';
import { buildLangText, langFileName } from './buildLangFiles';
import { mergeSameNamespace } from './mergeNamespaces';
import { packFormatFor, packMcmeta as buildPackMcmeta } from './packFormats';
import { buildBundle, INSTALL_GUIDE_FILE, installGuide, questBundleFiles, type QuestPart } from './questBundle';
import type { ExportOptions, ExportResult } from './types';

const ZIP_MIME = 'application/zip';
const MERGED_FILE = 'ModLangForge-zh_tw.zip';
/** 有任務檔時的外層檔名；與裡面 resourcepacks/ 的資源包不同名，避免被當成資源包丟進 resourcepacks/ */
const BUNDLE_FILE = 'ModLangForge-zh_tw-bundle.zip';
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

/** 任務檔加上安裝說明（沒有已翻條目時不加）；資源包部分不在這個檔裡，說明不提資源包 */
function addQuestFiles(zip: JSZip, parts: readonly QuestPart[], title: string): void {
  const files = questBundleFiles(parts);
  if (files.length === 0) return;
  zip.file(INSTALL_GUIDE_FILE, installGuide(title, null, true, files.length > 1));
  for (const [path, text] of files) zip.file(path, text);
}

/** 有任務專案時：任務檔只含已翻譯條目（遊戲自會退回英文），放在 config/ 路徑；資源包部分維持原本規則 */
async function exportWithQuests(others: readonly ModProject[], parts: readonly QuestPart[], opts: ExportOptions): Promise<ExportResult> {
  switch (opts.kind) {
    case 'merged-pack': {
      const resourcePack = others.length === 0
        ? null
        : { fileName: MERGED_FILE, bytes: await zipBytes(buildPackZip(mergeSameNamespace(others), opts)) };
      return { fileName: BUNDLE_FILE, blob: await buildBundle({ title: opts.description, resourcePack, quests: parts }) };
    }
    case 'separate-packs': {
      const outer = await separateZip(others, opts);
      addQuestFiles(outer, parts, opts.description);
      return { fileName: SEPARATE_FILE, blob: await zipToBlob(outer) };
    }
    case 'lang-files': {
      const zip = langZip(mergeSameNamespace(others), opts);
      addQuestFiles(zip, parts, opts.description);
      return { fileName: LANG_FILE, blob: await zipToBlob(zip) };
    }
  }
}

export async function exportProjects(projects: readonly ModProject[], opts: ExportOptions): Promise<ExportResult> {
  if (projects.length === 0) throw new Error('No projects selected for export');
  const parts = questParts(projects);
  if (parts.length > 0) return exportWithQuests(projects.filter((p) => !isQuestProjectId(p.id)), parts, opts);
  switch (opts.kind) {
    case 'merged-pack':
      return { fileName: MERGED_FILE, blob: await zipToBlob(buildPackZip(mergeSameNamespace(projects), opts)) };
    case 'separate-packs':
      return { fileName: SEPARATE_FILE, blob: await zipToBlob(await separateZip(projects, opts)) };
    case 'lang-files':
      return langFiles(mergeSameNamespace(projects), opts);
  }
}
