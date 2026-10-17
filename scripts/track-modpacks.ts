/**
 * 每週追蹤：檢查已收錄的整合包是否有新版本，有就沿用 add:modpack 的流程更新 data/modpacks/<id>/。
 * 用法：npm run track:modpacks -- [--summary <path>]
 * CurseForge 整合包需要 CURSEFORGE_API_KEY（環境變數或專案根目錄 .env）；未設定時略過並在摘要註明。金鑰不會寫入檔案，也不會印出。
 */
import { readdir, writeFile } from 'node:fs/promises';
import { parseTrackModpacksArgs, redact, renderModpackTrackSummary, trackModpacks } from '@mlf/core/modpackImport';
import { readCurseforgeKey } from './lib/curseforgeKey';
import { MODPACKS_DATA_DIR, readExisting, writeModpack } from './lib/modpackFiles';

async function modpackIds(): Promise<string[]> {
  const entries = await readdir(MODPACKS_DATA_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

async function main(): Promise<void> {
  const args = parseTrackModpacksArgs(process.argv.slice(2));
  const io = { fetch, apiKey: readCurseforgeKey(), readExisting, write: writeModpack };
  const report = await trackModpacks(io, await modpackIds(), new Date().toLocaleDateString('sv-SE'));
  const summary = renderModpackTrackSummary(report);
  console.log(summary);
  if (args.summary) await writeFile(args.summary, summary, 'utf8');
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('track-modpacks 執行失敗：', redact(message, readCurseforgeKey()));
  process.exitCode = 1;
});
