/**
 * fetch:modrinth 與 fetch:curseforge 共用的收錄流程：讀 jar、判斷要收錄／建內建條目／略過，並寫入 data。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DetectedMod } from '@mlf/core';
import { BUILTIN_DIR } from '@mlf/core/catalog';
import { readJar } from '@mlf/core/jar';
import { buildBuiltinMeta, buildDraftMeta, buildSourceRef, type DraftProject, type PlatformBuild, selectForTranslation } from '@mlf/core/pipeline';
import { DATA_DIR, largestNamespace, MODS_DIR, toJson } from './modrinth';

/** 寫入 meta 之前的最後加工（例如補上 CurseForge 連結）；回傳新的 meta 與要附在結果後面的說明 */
export type EnrichMeta = (meta: Readonly<Record<string, unknown>>) => Promise<{ readonly meta: Readonly<Record<string, unknown>>; readonly note: string | null }>;

export interface IngestArgs {
  readonly draft: DraftProject;
  readonly build: PlatformBuild;
  readonly jar: Uint8Array;
  /** 已存在的 modId；收錄成功後會加入，避免同一次執行重複收錄 */
  readonly existing: Set<string>;
  readonly today: string;
  /** 只輸出判斷結果，不寫入任何檔案 */
  readonly dryRun: boolean;
  readonly enrichMeta?: EnrichMeta;
}

export const UNKNOWN_SOURCE_SKIP = 'skip: unknown mc version or loader';

async function writeMod(modId: string, meta: Readonly<Record<string, unknown>>, en: Readonly<Record<string, string>>): Promise<void> {
  const dir = join(MODS_DIR, modId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'mod.json'), toJson(meta), 'utf8');
  await writeFile(join(dir, 'en_us.json'), toJson(en), 'utf8');
  await writeFile(join(dir, 'zh_tw.json'), '{}\n', 'utf8');
}

async function writeBuiltin(modId: string, meta: Readonly<Record<string, unknown>>): Promise<void> {
  const dir = join(DATA_DIR, BUILTIN_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${modId}.json`), toJson(meta), 'utf8');
}

const keepMeta: EnrichMeta = async (meta) => ({ meta, note: null });

/** 回傳結果字串：`ADDED …`、`ADDED-BUILTIN …` 或 `skip: …`（dryRun 時格式相同，但不寫入） */
export async function ingestBuild({ draft, build, jar, existing, today, dryRun, enrichMeta = keepMeta }: IngestArgs): Promise<string> {
  const source = buildSourceRef(build);
  if (!source) return UNKNOWN_SOURCE_SKIP;
  let detected: DetectedMod | undefined;
  try {
    detected = largestNamespace(await readJar(jar, build.file.name || 'mod.jar'));
  } catch (err) {
    return `skip: ${err instanceof Error ? err.message : String(err)}`;
  }
  if (!detected) return 'skip: no json lang';
  if (existing.has(detected.modId)) return `skip: ${detected.modId} already in data`;
  const selection = selectForTranslation(detected);
  if (selection.action === 'skip') return `skip: ${selection.reason}`;
  const modId = detected.modId;
  if (selection.action === 'builtin') {
    const { meta, note } = await enrichMeta(buildBuiltinMeta({ project: draft, modId, source, today }));
    if (!dryRun) await writeBuiltin(modId, meta);
    existing.add(modId);
    return `ADDED-BUILTIN ${modId}${note !== null ? ` (${note})` : ''}`;
  }
  const { meta, note } = await enrichMeta(buildDraftMeta({ project: draft, modId, source, builtinPercent: selection.builtinPercent, today }));
  if (!dryRun) await writeMod(modId, meta, selection.en);
  existing.add(modId);
  const builtin = selection.builtinPercent !== undefined ? `, builtin ${selection.builtinPercent}%` : '';
  const cf = note !== null ? `, ${note}` : '';
  return `ADDED ${modId} (${Object.keys(selection.en).length} keys${builtin}${cf})`;
}
