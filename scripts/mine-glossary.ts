import { resolve } from 'node:path';
import { countViolations, findCandidates, mergeGlossaries, type MineEntry, renderMineReport } from '@mlf/core/glossary';
import { type DataIssue, formatIssues, GLOBAL_GLOSSARY_ID, loadAllMods } from '@mlf/core/node';

const DATA_DIR = resolve(import.meta.dirname, '..', 'data');

/** 有錯誤的模組不在 loadAllMods 的結果中，全域術語表無效時 glossary 為空；兩者都要在報告中標出 */
function reportWarnings(issues: readonly DataIssue[]): string[] {
  const errors = issues.filter((i) => i.level === 'error');
  const excluded = [...new Set(errors.filter((i) => i.modId !== GLOBAL_GLOSSARY_ID).map((i) => i.modId))];
  return [
    ...(errors.some((i) => i.modId === GLOBAL_GLOSSARY_ID) ? ['data/glossary.json 無效，未套用全域術語（請執行 npm run validate:data 查看原因）'] : []),
    ...(excluded.length > 0 ? [`以下模組有錯誤，未納入統計：${excluded.join('、')}（請執行 npm run validate:data 查看原因）`] : []),
  ];
}

async function main(): Promise<void> {
  const { mods, glossary, issues } = await loadAllMods(DATA_DIR);
  formatIssues(issues.filter((i) => i.level === 'error'), 'data').forEach((line) => console.error(line));
  const entries: MineEntry[] = mods.flatMap((m) =>
    Object.entries(m.zh).flatMap(([key, target]) =>
      Object.hasOwn(m.en, key) ? [{ modId: m.meta.modId, key, source: m.en[key]!, target }] : []));
  const byMod = new Map(mods.map((m) => [m.meta.modId, mergeGlossaries(glossary, m.glossary)] as const));
  const termsFor = (modId: string) => byMod.get(modId) ?? glossary;
  console.log(renderMineReport(findCandidates(entries), countViolations(entries, termsFor), reportWarnings(issues)));
}

main().catch((err: unknown) => {
  console.error('glossary:mine 執行失敗', err);
  process.exitCode = 1;
});
