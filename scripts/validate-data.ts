import { resolve } from 'node:path';
import { formatIssues, loadAllMods } from '@mlf/core/node';

const DATA_DIR = resolve(import.meta.dirname, '..', 'data');

async function main(): Promise<void> {
  const { mods, issues } = await loadAllMods(DATA_DIR);
  formatIssues(issues, 'data').forEach((line) => console.log(line));
  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.length - errors;
  console.log(`已檢查 ${mods.length + new Set(issues.filter((i) => i.level === 'error').map((i) => i.modId)).size} 個模組：${errors} 個錯誤、${warnings} 個警告`);
  if (errors > 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error('validate-data 執行失敗', err);
  process.exitCode = 1;
});
