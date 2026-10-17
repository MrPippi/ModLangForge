/**
 * 從 Modrinth 依下載量取得熱門模組，擷取 en_us 並在 data/mods 建立待翻譯的資料夾。
 * 用法：npm run fetch:modrinth -- --limit 15 [--scan 300]
 * 模組內建繁中已涵蓋全部 key 時，改在 data/builtin-mods 建立輕量條目（不含譯文）。
 * 有 CURSEFORGE_API_KEY（環境變數或專案根目錄 .env）時，新增的模組會一併寫入確定相符的 CurseForge 連結；沒有金鑰時只寫 Modrinth 連結。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { draftCurseforgeLink } from '@mlf/core/curseforgeLinks';
import { readJar } from '@mlf/core/jar';
import { CURSEFORGE_KEY_ENV, redact } from '@mlf/core/modpackImport';
import {
  buildBuiltinMeta, buildDraftMeta, type ModrinthHit, type ModrinthVersion, pickVersion, PREFERRED_MC_VERSIONS, primaryFile, resolveSourceRef,
  selectForTranslation,
} from '@mlf/core/pipeline';
import type { DetectedMod } from '@mlf/core';
import { BUILTIN_DIR } from '@mlf/core/catalog';
import { readCurseforgeKey } from './lib/curseforgeKey';
import { API, DATA_DIR, downloadJar, getJson, largestNamespace, MODS_DIR, toJson } from './lib/modrinth';
import { listModIds } from './lib/modrinthLinks';

const PAGE_SIZE = 100;

async function searchPage(offset: number): Promise<ModrinthHit[]> {
  const facets = JSON.stringify([['project_type:mod'], PREFERRED_MC_VERSIONS.map((v) => `versions:${v}`)]);
  const url = `${API}/search?index=downloads&limit=${PAGE_SIZE}&offset=${offset}&facets=${encodeURIComponent(facets)}`;
  return (await getJson<{ hits: ModrinthHit[] }>(url)).hits;
}

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

async function processHit(hit: ModrinthHit, existing: Set<string>, today: string, apiKey: string | undefined): Promise<string> {
  const version = pickVersion(await getJson<ModrinthVersion[]>(`${API}/project/${hit.project_id}/version`));
  if (!version) return 'skip: no 1.21.1/1.20.1 version';
  const source = resolveSourceRef(version);
  if (!source) return 'skip: unknown mc version or loader';
  const jar = await downloadJar(version);
  if (!jar) return 'skip: no usable jar';
  let detected: DetectedMod | undefined;
  try {
    detected = largestNamespace(await readJar(jar, primaryFile(version)?.filename ?? 'mod.jar'));
  } catch (err) {
    return `skip: ${err instanceof Error ? err.message : String(err)}`;
  }
  if (!detected) return 'skip: no json lang';
  if (existing.has(detected.modId)) return `skip: ${detected.modId} already in data`;
  const selection = selectForTranslation(detected);
  if (selection.action === 'skip') return `skip: ${selection.reason}`;
  if (selection.action === 'builtin') {
    const meta = buildBuiltinMeta({ hit, modId: detected.modId, source, today });
    await writeBuiltin(detected.modId, meta);
    existing.add(detected.modId);
    return `ADDED-BUILTIN ${detected.modId}`;
  }
  const draft = buildDraftMeta({ hit, modId: detected.modId, source, builtinPercent: selection.builtinPercent, today });
  const { meta, note } = await draftCurseforgeLink({ fetch, apiKey }, draft, { slug: hit.slug, name: hit.title, authors: [hit.author] });
  await writeMod(detected.modId, meta, selection.en);
  existing.add(detected.modId);
  const builtin = selection.builtinPercent !== undefined ? `, builtin ${selection.builtinPercent}%` : '';
  const cf = note !== null ? `, ${note}` : '';
  return `ADDED ${detected.modId} (${Object.keys(selection.en).length} keys${builtin}${cf})`;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { limit: { type: 'string', default: '15' }, scan: { type: 'string', default: '300' } } });
  const limit = Number(values.limit);
  const scan = Number(values.scan);
  const existing = new Set(await listModIds());
  const today = new Date().toLocaleDateString('sv-SE');
  const apiKey = readCurseforgeKey();
  let added = 0;
  let addedBuiltin = 0;
  for (let offset = 0; offset < scan && added < limit; offset += PAGE_SIZE) {
    for (const hit of await searchPage(offset)) {
      if (added >= limit) break;
      let outcome: string;
      try {
        outcome = await processHit(hit, existing, today, apiKey);
      } catch (err) {
        outcome = `error: ${err instanceof Error ? err.message : String(err)}`;
      }
      if (outcome.startsWith('ADDED')) added += 1;
      if (outcome.startsWith('ADDED-BUILTIN')) addedBuiltin += 1;
      console.log(`${hit.slug.padEnd(32)} ${outcome}`);
    }
  }
  console.log(`\n新增 ${added - addedBuiltin} 個模組到 data/mods（zh_tw.json 為空，待翻譯）、${addedBuiltin} 個內建繁中條目到 data/builtin-mods`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('fetch-modrinth 執行失敗：', redact(message, process.env[CURSEFORGE_KEY_ENV]?.trim()));
  process.exitCode = 1;
});
