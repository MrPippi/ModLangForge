/**
 * 從 Modrinth（CurseForge 專有模組則從 CurseForge 截圖，需金鑰）下載各模組的展示圖，裁成 960x320 WebP 存到 apps/site/public/mod-banners/<modId>.webp。
 * 橫幅放在本站，網頁不必連到 Modrinth（CSP 不用放寬）。
 * data/banners-disabled.json 列出的模組不放橫幅，已存在的檔案會被刪除。
 * 用法：npm run banners:fetch [-- --force] [-- --only create,jei]
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { MODRINTH_CDN_PREFIX, bannerSources, type ModrinthProjectInfo } from '@mlf/core/pipeline';
import { CURSEFORGE_IMAGE_PREFIX, curseforgeBannerSources, findCurseforgeProject } from '@mlf/core/curseforgeMods';
import { redact } from '@mlf/core/modpackImport';
import { readCurseforgeKey } from './lib/curseforgeKey';
import { API, getJson, USER_AGENT } from './lib/modrinth';
import { listModIds, trackingSources, type TrackingSource } from './lib/modrinthLinks';

const ROOT = resolve(import.meta.dirname, '..');
const BANNER_DIR = join(ROOT, 'apps', 'site', 'public', 'mod-banners');
const DISABLED_FILE = join(ROOT, 'data', 'banners-disabled.json');
const BANNER_WIDTH = 1920;
const BANNER_HEIGHT = 640;
/** 原始圖上限；超過視為異常檔案不處理 */
const MAX_BANNER_BYTES = 16 * 1024 * 1024;
const CDN_HOST = new URL(MODRINTH_CDN_PREFIX).hostname;
const CURSEFORGE_IMAGE_HOST = new URL(CURSEFORGE_IMAGE_PREFIX).hostname;

async function loadDisabled(): Promise<ReadonlySet<string>> {
  const raw = JSON.parse(await readFile(DISABLED_FILE, 'utf8')) as unknown;
  if (!Array.isArray(raw) || !raw.every((id) => typeof id === 'string')) throw new Error('banners-disabled.json 必須是 modId 字串陣列');
  return new Set(raw as string[]);
}

async function downloadBanner(url: string): Promise<Uint8Array> {
  const parsed = new URL(url);
  // CurseForge 圖片 CDN 不帶金鑰（此函式從不送出金鑰），且不跟隨轉址
  if (parsed.protocol !== 'https:' || (parsed.hostname !== CDN_HOST && parsed.hostname !== CURSEFORGE_IMAGE_HOST)) {
    throw new Error(`unexpected banner host: ${url}`);
  }
  const res = await fetch(parsed, { headers: { 'User-Agent': USER_AGENT }, redirect: 'error' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_BANNER_BYTES) throw new Error(`banner too large (${bytes.byteLength} bytes)`);
  return bytes;
}

/** 依序嘗試下載（原圖優先），全部失敗時丟出最後一個錯誤 */
async function downloadFirst(urls: readonly string[]): Promise<Uint8Array> {
  let lastError: unknown = new Error('沒有可下載的橫幅網址');
  for (const url of urls) {
    try {
      return await downloadBanner(url);
    } catch (err) {
      lastError = err;
      console.warn(`  ${url}：${err instanceof Error ? err.message : String(err)}，改試下一個`);
    }
  }
  throw lastError;
}

/** 裁成固定比例，焦點放在畫面最顯眼處；動態圖只取第一格 */
function toWebp(bytes: Uint8Array): Promise<Buffer> {
  return sharp(bytes, { animated: false })
    .resize(BANNER_WIDTH, BANNER_HEIGHT, { fit: 'cover', position: 'attention' })
    .webp({ quality: 85 })
    .toBuffer();
}

/** 取得橫幅來源網址；回傳字串為略過原因 */
async function resolveSources(source: TrackingSource, apiKey: string | undefined): Promise<readonly string[] | string> {
  if (source.platform === 'modrinth') {
    const project = await getJson<ModrinthProjectInfo>(`${API}/project/${encodeURIComponent(source.slug)}`);
    const urls = bannerSources(project.gallery ?? []);
    return urls.length > 0 ? urls : 'skip: no gallery image on Modrinth';
  }
  if (!apiKey) return 'skip: 沒有 CurseForge 金鑰';
  const project = await findCurseforgeProject(fetch, apiKey, source.slug);
  if (!project) return 'skip: 找不到 CurseForge 專案';
  const urls = curseforgeBannerSources(project);
  return urls.length > 0 ? urls : 'skip: no screenshot on CurseForge';
}

async function processMod(
  modId: string, force: boolean, disabled: ReadonlySet<string>, trackers: ReadonlyMap<string, TrackingSource>, apiKey: string | undefined,
): Promise<string> {
  const out = join(BANNER_DIR, `${modId}.webp`);
  if (disabled.has(modId)) {
    if (!existsSync(out)) return 'skip: disabled';
    await rm(out);
    return 'removed: disabled';
  }
  if (!force && existsSync(out)) return 'skip: exists';
  const tracker = trackers.get(modId);
  if (!tracker) return 'skip: no Modrinth or CurseForge link';
  const sources = await resolveSources(tracker, apiKey);
  if (typeof sources === 'string') return sources;
  await writeFile(out, await toWebp(await downloadFirst(sources)));
  return 'ok';
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { force: { type: 'boolean', default: false }, only: { type: 'string' } } });
  const only = values.only ? new Set(values.only.split(',').map((s) => s.trim())) : null;
  const disabled = await loadDisabled();
  const modIds = (await listModIds()).filter((id) => !only || only.has(id));
  const apiKey = readCurseforgeKey();
  const trackers = await trackingSources(modIds);
  await mkdir(BANNER_DIR, { recursive: true });
  let failed = 0;
  for (const modId of modIds) {
    try {
      console.log(`${modId}: ${await processMod(modId, values.force, disabled, trackers, apiKey)}`);
    } catch (err) {
      failed += 1;
      console.error(`${modId}: error: ${redact(err instanceof Error ? err.message : String(err), apiKey)}`);
    }
  }
  if (failed > 0) process.exitCode = 1;
}

await main();
