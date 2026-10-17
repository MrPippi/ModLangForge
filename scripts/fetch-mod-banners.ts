/**
 * 從 Modrinth 下載各模組的展示圖，裁成 960x320 WebP 存到 apps/site/public/mod-banners/<modId>.webp。
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
import { API, getJson, USER_AGENT } from './lib/modrinth';
import { listModIds, readModrinthSlug } from './lib/modrinthLinks';

const ROOT = resolve(import.meta.dirname, '..');
const BANNER_DIR = join(ROOT, 'apps', 'site', 'public', 'mod-banners');
const DISABLED_FILE = join(ROOT, 'data', 'banners-disabled.json');
const BANNER_WIDTH = 1920;
const BANNER_HEIGHT = 640;
/** 原始圖上限；超過視為異常檔案不處理 */
const MAX_BANNER_BYTES = 16 * 1024 * 1024;
const CDN_HOST = new URL(MODRINTH_CDN_PREFIX).hostname;

async function loadDisabled(): Promise<ReadonlySet<string>> {
  const raw = JSON.parse(await readFile(DISABLED_FILE, 'utf8')) as unknown;
  if (!Array.isArray(raw) || !raw.every((id) => typeof id === 'string')) throw new Error('banners-disabled.json 必須是 modId 字串陣列');
  return new Set(raw as string[]);
}

async function downloadBanner(url: string): Promise<Uint8Array> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== CDN_HOST) throw new Error(`unexpected banner host: ${url}`);
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

async function processMod(modId: string, force: boolean, disabled: ReadonlySet<string>): Promise<string> {
  const out = join(BANNER_DIR, `${modId}.webp`);
  if (disabled.has(modId)) {
    if (!existsSync(out)) return 'skip: disabled';
    await rm(out);
    return 'removed: disabled';
  }
  if (!force && existsSync(out)) return 'skip: exists';
  const slug = await readModrinthSlug(modId);
  if (!slug) return 'skip: no Modrinth link';
  const project = await getJson<ModrinthProjectInfo>(`${API}/project/${encodeURIComponent(slug)}`);
  const sources = bannerSources(project.gallery ?? []);
  if (sources.length === 0) return 'skip: no gallery image on Modrinth';
  await writeFile(out, await toWebp(await downloadFirst(sources)));
  return 'ok';
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { force: { type: 'boolean', default: false }, only: { type: 'string' } } });
  const only = values.only ? new Set(values.only.split(',').map((s) => s.trim())) : null;
  const disabled = await loadDisabled();
  const modIds = (await listModIds()).filter((id) => !only || only.has(id));
  await mkdir(BANNER_DIR, { recursive: true });
  let failed = 0;
  for (const modId of modIds) {
    try {
      console.log(`${modId}: ${await processMod(modId, values.force, disabled)}`);
    } catch (err) {
      failed += 1;
      console.error(`${modId}: error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (failed > 0) process.exitCode = 1;
}

await main();
