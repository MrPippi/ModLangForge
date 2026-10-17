/**
 * 為缺少 links.curseforge 的模組查詢 CurseForge 並寫入連結；只在確定是同一個模組時寫入，其餘列出候選供人工確認。
 * 用法：npm run backfill:curseforge [-- --dry-run] [-- --mod <modId>]
 * 需要 CURSEFORGE_API_KEY（環境變數或專案根目錄 .env）；金鑰不會寫入檔案，也不會印出。
 */
import { parseArgs } from 'node:util';
import { type BackfillArgs, renderBackfillReport, runCurseforgeBackfill } from '@mlf/core/curseforgeLinks';
import { CURSEFORGE_KEY_ENV, redact } from '@mlf/core/modpackImport';
import { readCurseforgeKey } from './lib/curseforgeKey';
import { listModIds, readModJson, writeModJson } from './lib/modFiles';

function parseCli(): BackfillArgs {
  const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false }, mod: { type: 'string' } } });
  return { dryRun: values['dry-run'] ?? false, ...(values.mod !== undefined ? { modId: values.mod } : {}) };
}

async function main(): Promise<void> {
  const args = parseCli();
  const apiKey = readCurseforgeKey();
  const result = await runCurseforgeBackfill(
    { fetch, apiKey, listMods: listModIds, readMod: readModJson, writeMod: writeModJson },
    args,
  );
  if (result.kind === 'error') {
    console.error(result.message);
    process.exitCode = 1;
    return;
  }
  for (const line of renderBackfillReport(result)) console.log(line);
  if (result.entries.some((e) => e.kind === 'failed')) process.exitCode = 1;
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('backfill-curseforge 執行失敗：', redact(message, process.env[CURSEFORGE_KEY_ENV]?.trim()));
  process.exitCode = 1;
});
