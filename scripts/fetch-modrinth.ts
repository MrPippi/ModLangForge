/**
 * 從 Modrinth 依下載量取得熱門模組，擷取 en_us 並在 data/mods 建立待翻譯的資料夾。
 * 用法：npm run fetch:modrinth -- --limit 15 [--scan 300]
 * 模組內建繁中已涵蓋全部 key 時，改在 data/builtin-mods 建立輕量條目（不含譯文）。
 * 有 CURSEFORGE_API_KEY（環境變數或專案根目錄 .env）時，新增的模組會一併寫入確定相符的 CurseForge 連結；沒有金鑰時只寫 Modrinth 連結。
 */
import { parseArgs } from 'node:util';
import { draftCurseforgeLink } from '@mlf/core/curseforgeLinks';
import { CURSEFORGE_KEY_ENV, redact } from '@mlf/core/modpackImport';
import { draftFromModrinthHit, fromModrinthVersion, type ModrinthHit, type ModrinthVersion, pickVersion, PREFERRED_MC_VERSIONS, resolveSourceRef } from '@mlf/core/pipeline';
import { readCurseforgeKey } from './lib/curseforgeKey';
import { type EnrichMeta, ingestBuild, UNKNOWN_SOURCE_SKIP } from './lib/ingest';
import { API, downloadJar, getJson } from './lib/modrinth';
import { listModIds } from './lib/modrinthLinks';

const PAGE_SIZE = 100;

async function searchPage(offset: number): Promise<ModrinthHit[]> {
  const facets = JSON.stringify([['project_type:mod'], PREFERRED_MC_VERSIONS.map((v) => `versions:${v}`)]);
  const url = `${API}/search?index=downloads&limit=${PAGE_SIZE}&offset=${offset}&facets=${encodeURIComponent(facets)}`;
  return (await getJson<{ hits: ModrinthHit[] }>(url)).hits;
}

async function processHit(hit: ModrinthHit, existing: Set<string>, today: string, apiKey: string | undefined): Promise<string> {
  const version = pickVersion(await getJson<ModrinthVersion[]>(`${API}/project/${hit.project_id}/version`));
  if (!version) return 'skip: no 1.21.1/1.20.1 version';
  if (!resolveSourceRef(version)) return UNKNOWN_SOURCE_SKIP;
  const jar = await downloadJar(version);
  if (!jar) return 'skip: no usable jar';
  const enrichMeta: EnrichMeta = (meta) => draftCurseforgeLink({ fetch, apiKey }, meta, { slug: hit.slug, name: hit.title, authors: [hit.author] });
  return ingestBuild({ draft: draftFromModrinthHit(hit), build: fromModrinthVersion(version), jar, existing, today, dryRun: false, enrichMeta });
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
