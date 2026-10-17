/**
 * 從 Modrinth 下載各模組的展示圖，裁成 960x320 WebP 存到 apps/site/public/mod-banners/<modId>.webp。
 * 橫幅放在本站，網頁不必連到 Modrinth（CSP 不用放寬）。
 * data/banners-disabled.json 列出的模組不放橫幅，已存在的檔案會被刪除。
 * 用法：npm run banners:fetch [-- --force] [-- --only create,jei]
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { MODRINTH_CDN_PREFIX, modrinthSlug, pickBannerUrl, type ModrinthProjectInfo } from '@mlf/core/pipeline';
import { API, getJson, MODS_DIR, USER_AGENT } from './lib/modrinth';

const ROOT = resolve(import.meta.dirname, '..');
const BANNER_DIR = join(ROOT, 'apps', 'site', 'public', 'mod-banners');
const DISABLED_FILE = join(ROOT, 'data', 'banners-disabled.json');
const BANNER_WIDTH = 960;
const BANNER_HEIGHT = 320;
/** 原始圖上限；超過視為異常檔案不處理 */
const MAX_BANNER_BYTES = 8 * 1024 * 1024;
const CDN_HOST = new URL(MODRINTH_CDN_PREFIX).hostname;

async function loadDisabled(): Promise<ReadonlySet<string>> {
  const raw = JSON.parse(await readFile(DISABLED_FILE, 'utf8')) as unknown;
  if (!Array.isArray(raw) || !raw.every((id) => typeof id === 'string')) throw new Error('banners-disabled.json 必須是 modId 字串陣列');
  return new Set(raw as string[]);
}

async function modrinthLink(modId: string): Promise<string | null> {
  const meta = JSON.parse(await readFile(join(MODS_DIR, modId, 'mod.json'), 'utf8')) as { links?: { modrinth?: string } };
  return modrinthSlug(meta.links?.modrinth);
}

async function downloadBanner(url: string): Promise<Uint8Array> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== CDN_HOST) throw new Error(`unexpected banner host: ${url}`);
  const res = await fetch(parsed, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_BANNER_BYTES) throw new Error(`banner too large (${bytes.byteLength} bytes)`);
  return bytes;
}

/** 裁成固定比例，焦點放在畫面最顯眼處；動態圖只取第一格 */
function toWebp(bytes: Uint8Array): Promise<Buffer> {
  return sharp(bytes, { animated: false })
    .resize(BANNER_WIDTH, BANNER_HEIGHT, { fit: 'cover', position: 'attention' })
    .webp({ quality: 78 })
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
  const slug = await modrinthLink(modId);
  if (!slug) return 'skip: no Modrinth link';
  const project = await getJson<ModrinthProjectInfo>(`${API}/project/${encodeURIComponent(slug)}`);
  const url = pickBannerUrl(project.gallery ?? []);
  if (!url) return 'skip: no gallery image on Modrinth';
  await writeFile(out, await toWebp(await downloadBanner(url)));
  return 'ok';
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { force: { type: 'boolean', default: false }, only: { type: 'string' } } });
  const only = values.only ? new Set(values.only.split(',').map((s) => s.trim())) : null;
  const disabled = await loadDisabled();
  const entries = await readdir(MODS_DIR, { withFileTypes: true });
  const modIds = entries.filter((e) => e.isDirectory() && (!only || only.has(e.name))).map((e) => e.name).sort();
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
