/**
 * 從 Modrinth 依下載量取得熱門模組，擷取 en_us 並在 data/mods 建立待翻譯的資料夾。
 * 用法：npm run fetch:modrinth -- --limit 15 [--scan 300]
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { MAX_JAR_BYTES, readJar } from '@mlf/core/jar';
import {
  buildDraftMeta, type ModrinthHit, type ModrinthVersion, pickVersion, PREFERRED_MC_VERSIONS, primaryFile, selectForTranslation,
} from '@mlf/core/pipeline';
import type { DetectedMod } from '@mlf/core';

const API = 'https://api.modrinth.com/v2';
const USER_AGENT = 'ModLangForge/0.1 (+https://github.com/MrPippi/ModLangForge)';
const PAGE_SIZE = 100;
const MODS_DIR = resolve(import.meta.dirname, '..', 'data', 'mods');

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.json()) as T;
}

async function searchPage(offset: number): Promise<ModrinthHit[]> {
  const facets = JSON.stringify([['project_type:mod'], PREFERRED_MC_VERSIONS.map((v) => `versions:${v}`)]);
  const url = `${API}/search?index=downloads&limit=${PAGE_SIZE}&offset=${offset}&facets=${encodeURIComponent(facets)}`;
  return (await getJson<{ hits: ModrinthHit[] }>(url)).hits;
}

async function downloadJar(v: ModrinthVersion): Promise<Uint8Array | null> {
  const file = primaryFile(v);
  if (!file || !file.filename.endsWith('.jar')) return null;
  const res = await fetch(file.url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${file.url}`);
  const size = Number(res.headers.get('content-length') ?? 0);
  if (size > MAX_JAR_BYTES) return null;
  return new Uint8Array(await res.arrayBuffer());
}

function largestNamespace(mods: readonly DetectedMod[]): DetectedMod | undefined {
  return [...mods].filter((m) => m.format === 'json').sort((a, b) => b.order.length - a.order.length)[0];
}

async function writeMod(modId: string, meta: Record<string, unknown>, en: Readonly<Record<string, string>>): Promise<void> {
  const dir = join(MODS_DIR, modId);
  await mkdir(dir, { recursive: true });
  const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
  await writeFile(join(dir, 'mod.json'), json(meta), 'utf8');
  await writeFile(join(dir, 'en_us.json'), json(en), 'utf8');
  await writeFile(join(dir, 'zh_tw.json'), '{}\n', 'utf8');
}

async function processHit(hit: ModrinthHit, existing: Set<string>, today: string): Promise<string> {
  const version = pickVersion(await getJson<ModrinthVersion[]>(`${API}/project/${hit.project_id}/version`));
  if (!version) return 'skip: no 1.21.1/1.20.1 version';
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
  const meta = buildDraftMeta({ hit, modId: detected.modId, modVersion: version.version_number, builtinPercent: selection.builtinPercent, today });
  await writeMod(detected.modId, meta, selection.en);
  existing.add(detected.modId);
  const builtin = selection.builtinPercent !== undefined ? `, builtin ${selection.builtinPercent}%` : '';
  return `ADDED ${detected.modId} (${Object.keys(selection.en).length} keys${builtin})`;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { limit: { type: 'string', default: '15' }, scan: { type: 'string', default: '300' } } });
  const limit = Number(values.limit);
  const scan = Number(values.scan);
  const existing = new Set((await readdir(MODS_DIR, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name));
  const today = new Date().toLocaleDateString('sv-SE');
  let added = 0;
  for (let offset = 0; offset < scan && added < limit; offset += PAGE_SIZE) {
    for (const hit of await searchPage(offset)) {
      if (added >= limit) break;
      let outcome: string;
      try {
        outcome = await processHit(hit, existing, today);
      } catch (err) {
        outcome = `error: ${err instanceof Error ? err.message : String(err)}`;
      }
      if (outcome.startsWith('ADDED')) added += 1;
      console.log(`${hit.slug.padEnd(32)} ${outcome}`);
    }
  }
  console.log(`\n新增 ${added} 個模組到 data/mods（zh_tw.json 為空，待翻譯）`);
}

main().catch((err: unknown) => {
  console.error('fetch-modrinth 執行失敗', err);
  process.exitCode = 1;
});
