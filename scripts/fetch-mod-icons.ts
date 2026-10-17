/**
 * 從 Modrinth 下載各模組的圖示，縮成 128px WebP 存到 apps/site/public/mod-icons/<modId>.webp。
 * 圖示放在本站，網頁不必連到 Modrinth（CSP 不用放寬，也不會把訪客資訊送給第三方）。
 * 用法：npm run icons:fetch [-- --force] [-- --only create,jei]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { API, getJson, USER_AGENT } from './lib/modrinth';
import { listModIds, readModrinthSlug } from './lib/modrinthLinks';

const ICON_DIR = resolve(import.meta.dirname, '..', 'apps', 'site', 'public', 'mod-icons');
const ICON_SIZE = 128;
/** 原始圖示上限；超過視為異常檔案不處理 */
const MAX_ICON_BYTES = 2 * 1024 * 1024;

async function downloadIcon(url: string): Promise<Uint8Array> {
  if (!url.startsWith('https://cdn.modrinth.com/')) throw new Error(`unexpected icon host: ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_ICON_BYTES) throw new Error(`icon too large (${bytes.byteLength} bytes)`);
  return bytes;
}

/** 等比縮放置中，透明補邊；動態圖只取第一格 */
function toWebp(bytes: Uint8Array): Promise<Buffer> {
  return sharp(bytes, { animated: false })
    .resize(ICON_SIZE, ICON_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 82 })
    .toBuffer();
}

async function processMod(modId: string, force: boolean): Promise<string> {
  const out = join(ICON_DIR, `${modId}.webp`);
  if (!force && existsSync(out)) return 'skip: exists';
  const slug = await readModrinthSlug(modId);
  if (!slug) return 'skip: no Modrinth link';
  const project = await getJson<{ icon_url: string | null }>(`${API}/project/${encodeURIComponent(slug)}`);
  if (!project.icon_url) return 'skip: no icon on Modrinth';
  await writeFile(out, await toWebp(await downloadIcon(project.icon_url)));
  return 'ok';
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { force: { type: 'boolean', default: false }, only: { type: 'string' } } });
  const only = values.only ? new Set(values.only.split(',').map((s) => s.trim())) : null;
  const modIds = (await listModIds()).filter((id) => !only || only.has(id));
  await mkdir(ICON_DIR, { recursive: true });
  let failed = 0;
  for (const modId of modIds) {
    try {
      console.log(`${modId}: ${await processMod(modId, values.force)}`);
    } catch (err) {
      failed += 1;
      console.error(`${modId}: error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (failed > 0) process.exitCode = 1;
}

await main();
