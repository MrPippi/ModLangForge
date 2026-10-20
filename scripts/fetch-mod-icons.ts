/**
 * 從 Modrinth（CurseForge 專有模組則從 CurseForge，需金鑰）下載各模組的圖示，縮成 128px WebP 存到 apps/site/public/mod-icons/<modId>.webp。
 * 圖示放在本站，網頁不必連到 Modrinth（CSP 不用放寬，也不會把訪客資訊送給第三方）。
 * 用法：npm run icons:fetch [-- --force] [-- --only create,jei]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { CURSEFORGE_IMAGE_PREFIX, curseforgeIconSource, findCurseforgeProject } from '@mlf/core/curseforgeMods';
import { redact } from '@mlf/core/modpackImport';
import { readCurseforgeKey } from './lib/curseforgeKey';
import { API, getJson, USER_AGENT } from './lib/modrinth';
import { listModIds, trackingSources, type TrackingSource } from './lib/modrinthLinks';

const ICON_DIR = resolve(import.meta.dirname, '..', 'apps', 'site', 'public', 'mod-icons');
const ICON_SIZE = 128;
/** 原始圖示上限；超過視為異常檔案不處理 */
const MAX_ICON_BYTES = 2 * 1024 * 1024;

/** 下載圖示；CurseForge 圖片 CDN 不帶金鑰、不跟隨轉址 */
async function downloadIcon(url: string): Promise<Uint8Array> {
  const isCurseforge = url.startsWith(CURSEFORGE_IMAGE_PREFIX);
  if (!isCurseforge && !url.startsWith('https://cdn.modrinth.com/')) throw new Error(`unexpected icon host: ${url}`);
  const res = await fetch(url, isCurseforge ? { headers: { 'User-Agent': USER_AGENT }, redirect: 'error' } : { headers: { 'User-Agent': USER_AGENT } });
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

/** 取得圖示網址；回傳字串為略過原因 */
async function resolveIconUrl(source: TrackingSource, apiKey: string | undefined): Promise<{ url: string } | string> {
  if (source.platform === 'modrinth') {
    const project = await getJson<{ icon_url: string | null }>(`${API}/project/${encodeURIComponent(source.slug)}`);
    return project.icon_url ? { url: project.icon_url } : 'skip: no icon on Modrinth';
  }
  if (!apiKey) return 'skip: 沒有 CurseForge 金鑰';
  const project = await findCurseforgeProject(fetch, apiKey, source.slug);
  if (!project) return 'skip: 找不到 CurseForge 專案';
  const url = curseforgeIconSource(project);
  return url ? { url } : 'skip: no icon on CurseForge';
}

async function processMod(modId: string, force: boolean, sources: ReadonlyMap<string, TrackingSource>, apiKey: string | undefined): Promise<string> {
  const out = join(ICON_DIR, `${modId}.webp`);
  if (!force && existsSync(out)) return 'skip: exists';
  const source = sources.get(modId);
  if (!source) return 'skip: no Modrinth or CurseForge link';
  const resolved = await resolveIconUrl(source, apiKey);
  if (typeof resolved === 'string') return resolved;
  await writeFile(out, await toWebp(await downloadIcon(resolved.url)));
  return 'ok';
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { force: { type: 'boolean', default: false }, only: { type: 'string' } } });
  const only = values.only ? new Set(values.only.split(',').map((s) => s.trim())) : null;
  const modIds = (await listModIds()).filter((id) => !only || only.has(id));
  const apiKey = readCurseforgeKey();
  const sources = await trackingSources(modIds);
  await mkdir(ICON_DIR, { recursive: true });
  let failed = 0;
  for (const modId of modIds) {
    try {
      console.log(`${modId}: ${await processMod(modId, values.force, sources, apiKey)}`);
    } catch (err) {
      failed += 1;
      console.error(`${modId}: error: ${redact(err instanceof Error ? err.message : String(err), apiKey)}`);
    }
  }
  if (failed > 0) process.exitCode = 1;
}

await main();
