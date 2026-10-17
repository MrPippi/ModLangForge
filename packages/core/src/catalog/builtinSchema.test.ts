import { describe, expect, it } from 'vitest';
import { builtinModSchema, checkBuiltinConflicts } from './builtinSchema';

const litematica = {
  modId: 'litematica',
  name: 'Litematica',
  summary: '建築投影輔助模組',
  authors: ['masa'],
  links: { modrinth: 'https://modrinth.com/mod/litematica' },
  mcVersions: ['1.20.1'],
  loaders: ['fabric'],
  checkedVersion: { modVersion: '0.15.4', mcVersion: '1.20.1', loader: 'fabric' },
  updatedAt: '2026-10-17',
};

describe('builtinModSchema', () => {
  it('接受合法條目且 aliases 預設為空', () => {
    const r = builtinModSchema.safeParse(litematica);
    expect(r.success).toBe(true);
    expect(r.success && r.data.aliases).toEqual([]);
  });

  it.each([
    ['nameZh', { nameZh: '投影' }],
    ['translation', { translation: {} }],
  ])('拒絕 %s 欄位', (_name, extra) => {
    expect(builtinModSchema.safeParse({ ...litematica, ...extra }).success).toBe(false);
  });

  it('links 沒有 modrinth 時失敗', () => {
    const links = { curseforge: 'https://www.curseforge.com/minecraft/mc-mods/litematica' };
    expect(builtinModSchema.safeParse({ ...litematica, links }).success).toBe(false);
  });
});

describe('checkBuiltinConflicts', () => {
  it('回報同時存在的 modId', () => {
    expect(checkBuiltinConflicts(['a', 'b'], ['b', 'c'])).toEqual(['b 同時存在於 data/mods 與 data/builtin-mods']);
  });
});
