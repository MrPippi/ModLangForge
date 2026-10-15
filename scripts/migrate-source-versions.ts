/**
 * 一次性遷移：把 mod.json 的 modVersion 轉為 sourceVersions（查 Modrinth 判斷 MC 版本與載入器）。
 * 用法：npm run migrate:source-versions
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { migrateMeta, migrationSourceRef, modrinthSlug, type ModrinthVersion, type SourceRef } from '@mlf/core/pipeline';
import { API, getJson, MODS_DIR, toJson } from './lib/modrinth';

async function lookupRef(raw: Readonly<Record<string, unknown>>): Promise<SourceRef | null> {
  const links = raw.links as { modrinth?: string } | undefined;
  const slug = modrinthSlug(links?.modrinth);
  if (typeof raw.modVersion !== 'string' || !slug) return null;
  return migrationSourceRef(await getJson<ModrinthVersion[]>(`${API}/project/${slug}/version`), raw.modVersion);
}

async function migrateOne(modId: string): Promise<string> {
  const file = join(MODS_DIR, modId, 'mod.json');
  const raw = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  if (Array.isArray(raw.sourceVersions)) return 'skip: 已遷移';
  const ref = await lookupRef(raw);
  if (!ref) return 'MANUAL: 無法從 Modrinth 判斷，請手動填寫 sourceVersions';
  await writeFile(file, toJson(migrateMeta(raw, ref)), 'utf8');
  return `ok: ${ref.mcVersion} ${ref.loader} ${ref.modVersion ?? ''}`;
}

async function main(): Promise<void> {
  const dirs = (await readdir(MODS_DIR, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  for (const modId of dirs) {
    let outcome: string;
    try {
      outcome = await migrateOne(modId);
    } catch (err) {
      outcome = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
    console.log(`${modId.padEnd(28)} ${outcome}`);
  }
}

main().catch((err: unknown) => {
  console.error('migrate-source-versions 執行失敗', err);
  process.exitCode = 1;
});
