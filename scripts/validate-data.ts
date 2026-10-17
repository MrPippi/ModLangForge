import { resolve } from 'node:path';
import { formatIssues, formatModpackIssues, GLOBAL_GLOSSARY_ID, loadAllModpacks, loadAllMods } from '@mlf/core/node';

const DATA_DIR = resolve(import.meta.dirname, '..', 'data');

async function main(): Promise<void> {
  const { mods, issues, glossary } = await loadAllMods(DATA_DIR);
  const packs = await loadAllModpacks(DATA_DIR, glossary);
  [...formatIssues(issues, 'data'), ...formatModpackIssues(packs.issues, 'data')].forEach((line) => console.log(line));
  const all = [...issues, ...packs.issues];
  const errors = all.filter((i) => i.level === 'error').length;
  const warnings = all.length - errors;
  const failedMods = new Set(issues.filter((i) => i.level === 'error' && i.modId !== GLOBAL_GLOSSARY_ID).map((i) => i.modId)).size;
  const failedPacks = new Set(packs.issues.filter((i) => i.level === 'error').map((i) => i.modpackId)).size;
  console.log(`已檢查 ${mods.length + failedMods} 個模組、${packs.modpacks.length + failedPacks} 個整合包：${errors} 個錯誤、${warnings} 個警告`);
  if (errors > 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error('validate-data 執行失敗', err);
  process.exitCode = 1;
});
