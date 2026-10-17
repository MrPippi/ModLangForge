/**
 * 新增或更新整合包：下載 .mrpack／CurseForge zip，寫入 data/modpacks/<id>/modpack.json 與 KubeJS 英文原文（不動 zh_tw.json）。
 * 用法：npm run add:modpack -- --modrinth <slug|id> [--version <版本號>]
 *       npm run add:modpack -- --curseforge <slug|id> [--version <檔案名稱>] [--file <zip 路徑>]
 * CurseForge 需要 CURSEFORGE_API_KEY（環境變數或專案根目錄 .env）；金鑰不會寫入檔案，也不會印出。
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { type AddModpackArgs, type AddModpackResult, CURSEFORGE_KEY_ENV, runAddModpack } from '@mlf/core/modpackImport';
import { readExisting, writeModpack } from './lib/modpackFiles';

const USAGE = '用法：npm run add:modpack -- --modrinth <slug|id> 或 --curseforge <slug|id>（可加 --version <版本>、--file <zip 路徑>）';
const ENV_FILE = resolve(import.meta.dirname, '..', '.env');

function parseCli(): AddModpackArgs {
  const { values } = parseArgs({
    options: { modrinth: { type: 'string' }, curseforge: { type: 'string' }, version: { type: 'string' }, file: { type: 'string' } },
  });
  const { modrinth, curseforge, version, file } = values;
  if ((modrinth === undefined) === (curseforge === undefined)) throw new Error(USAGE);
  const base = modrinth !== undefined
    ? { platform: 'modrinth' as const, ref: modrinth }
    : { platform: 'curseforge' as const, ref: curseforge ?? '' };
  return { ...base, ...(version !== undefined ? { version } : {}), ...(file !== undefined ? { filePath: file } : {}) };
}

function report(result: AddModpackResult): void {
  switch (result.kind) {
    case 'error':
      console.error(result.message);
      process.exitCode = 1;
      return;
    case 'conflict':
      for (const c of result.conflicts) console.log(`格式碼衝突  ${c.ns}:${c.key}\n  既有：${c.existing}\n  新版：${c.incoming}`);
      console.error('有格式碼衝突，未寫入任何檔案；請人工決定是否改寫原文。');
      process.exitCode = 1;
      return;
    case 'written':
      const { version, mcVersion, loader } = result.imported;
      console.log(`匯入版本：${version} · ${mcVersion} · ${loader}`);
      for (const note of result.notes) console.log(note);
      for (const change of result.changes) {
        for (const c of change.conflicts) console.log(`原文不同  ${change.ns}:${c.key}\n  既有：${c.existing}\n  新版：${c.incoming}`);
        console.log(`KubeJS ${change.ns}：${change.created ? '新增' : '更新'}，新增 ${change.addedKeys.length} 個 key`);
      }
      console.log(`${result.created ? '已新增' : '已更新'} data/modpacks/${result.id}（請確認名稱、簡介與作者）`);
  }
}

async function main(): Promise<void> {
  const args = parseCli();
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const result = await runAddModpack({
    fetch,
    apiKey: process.env[CURSEFORGE_KEY_ENV]?.trim() || undefined,
    readLocalFile: async (path) => new Uint8Array(await readFile(path)),
    readExisting,
    write: writeModpack,
  }, args, new Date().toLocaleDateString('sv-SE'));
  report(result);
}

main().catch((err: unknown) => {
  console.error('add-modpack 執行失敗：', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
