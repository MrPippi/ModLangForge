import { resolve } from 'node:path';
import { countViolations, findCandidates, mergeGlossaries, type MineEntry, renderMineReport } from '@mlf/core/glossary';
import { loadAllMods } from '@mlf/core/node';

const DATA_DIR = resolve(import.meta.dirname, '..', 'data');

async function main(): Promise<void> {
  const { mods, glossary } = await loadAllMods(DATA_DIR);
  const entries: MineEntry[] = mods.flatMap((m) =>
    Object.entries(m.zh).flatMap(([key, target]) =>
      Object.hasOwn(m.en, key) ? [{ modId: m.meta.modId, key, source: m.en[key]!, target }] : []));
  const byMod = new Map(mods.map((m) => [m.meta.modId, mergeGlossaries(glossary, m.glossary)] as const));
  const termsFor = (modId: string) => byMod.get(modId) ?? glossary;
  console.log(renderMineReport(findCandidates(entries), countViolations(entries, termsFor)));
}

main().catch((err: unknown) => {
  console.error('glossary:mine 執行失敗', err);
  process.exitCode = 1;
});
