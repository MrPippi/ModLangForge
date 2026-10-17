import { describe, expect, it } from 'vitest';
import { type BackfillDone, renderBackfillReport } from './index';

const CF = (slug: string) => `https://www.curseforge.com/minecraft/mc-mods/${slug}`;

const DONE: BackfillDone = {
  kind: 'done',
  dryRun: false,
  entries: [
    { kind: 'skipped', modId: 'create' },
    { kind: 'written', modId: 'jei', url: CF('jei'), via: 'slug' },
    { kind: 'written', modId: 'sodium', url: CF('sodium'), via: 'name' },
    { kind: 'review', modId: 'carryon', name: 'Carry On', reason: 'name-mismatch', candidates: [{ name: 'Carry Everything', slug: 'carryon', url: CF('carryon') }] },
    { kind: 'review', modId: 'examplelegacy', name: 'Example Legacy Mod', reason: 'none', candidates: [] },
    { kind: 'failed', modId: 'foo', message: 'HTTP 500 https://api.curseforge.com/v1/mods/search?x' },
  ],
};

describe('renderBackfillReport', () => {
  it('lists every group with counts in Traditional Chinese', () => {
    expect(renderBackfillReport(DONE)).toEqual([
      '已寫入：2 個',
      `  jei  ${CF('jei')}（slug 與名稱相同）`,
      `  sodium  ${CF('sodium')}（名稱唯一相同、作者相符）`,
      '需要人工確認：2 個',
      '  carryon（Carry On）：slug 相同但名稱不同',
      `    候選：Carry Everything  ${CF('carryon')}`,
      '  examplelegacy（Example Legacy Mod）：CurseForge 上找不到同名模組',
      '查詢失敗：1 個',
      '  foo：HTTP 500 https://api.curseforge.com/v1/mods/search?x',
      '已有連結、略過：1 個',
    ]);
  });

  it('says nothing was written on a dry run', () => {
    expect(renderBackfillReport({ kind: 'done', dryRun: true, entries: [] })).toEqual([
      '將寫入（--dry-run，未寫檔）：0 個', '需要人工確認：0 個', '查詢失敗：0 個', '已有連結、略過：0 個',
    ]);
  });
});
