import JSZip from 'jszip';
import type { ModProject } from '../types';
import { buildGuidePackFiles } from './buildGuideFiles';
import { buildLangText, langFileName } from './buildLangFiles';
import { packFormatFor } from './packFormats';
import type { ExportOptions, ExportResult } from './types';

const ZIP_MIME = 'application/zip';

async function zipToBlob(zip: JSZip): Promise<Blob> {
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return new Blob([bytes as BlobPart], { type: ZIP_MIME });
}

function packMcmeta(opts: ExportOptions): string {
  const meta = { pack: { pack_format: packFormatFor(opts.mcVersion), description: opts.description } };
  return JSON.stringify(meta, null, 2) + '\n';
}

function buildPackZip(projects: readonly ModProject[], opts: ExportOptions): JSZip {
  const zip = new JSZip();
  zip.file('pack.mcmeta', packMcmeta(opts));
  for (const p of projects) {
    zip.file(`assets/${p.modId}/lang/${langFileName(p.format)}`, buildLangText(p, opts.untranslated));
    for (const [path, text] of buildGuidePackFiles(p, opts.untranslated)) zip.file(path, text);
  }
  return zip;
}

async function separatePacks(projects: readonly ModProject[], opts: ExportOptions): Promise<ExportResult> {
  const outer = new JSZip();
  for (const p of projects) {
    const inner = await buildPackZip([p], opts).generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    outer.file(`${p.modId}-zh_tw.zip`, inner);
  }
  return { fileName: 'ModLangForge-packs.zip', blob: await zipToBlob(outer) };
}

async function langFiles(projects: readonly ModProject[], opts: ExportOptions): Promise<ExportResult> {
  const [only] = projects;
  if (projects.length === 1 && only) {
    const mime = only.format === 'json' ? 'application/json' : 'text/plain';
    const blob = new Blob([buildLangText(only, opts.untranslated)], { type: `${mime};charset=utf-8` });
    return { fileName: langFileName(only.format), blob };
  }
  const zip = new JSZip();
  for (const p of projects) {
    zip.file(`${p.modId}/${langFileName(p.format)}`, buildLangText(p, opts.untranslated));
  }
  return { fileName: 'ModLangForge-lang.zip', blob: await zipToBlob(zip) };
}

export async function exportProjects(projects: readonly ModProject[], opts: ExportOptions): Promise<ExportResult> {
  if (projects.length === 0) throw new Error('No projects selected for export');
  switch (opts.kind) {
    case 'merged-pack':
      return { fileName: 'ModLangForge-zh_tw.zip', blob: await zipToBlob(buildPackZip(projects, opts)) };
    case 'separate-packs':
      return separatePacks(projects, opts);
    case 'lang-files':
      return langFiles(projects, opts);
  }
}
