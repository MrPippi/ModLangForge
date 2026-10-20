import { describe, expect, it } from 'vitest';
import { builtinModSchema, checkBuiltinConflicts, checkCurseforgeLinks } from './builtinSchema';

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

  it('只有 CurseForge 連結也通過', () => {
    const links = { curseforge: 'https://www.curseforge.com/minecraft/mc-mods/litematica' };
    expect(builtinModSchema.safeParse({ ...litematica, links }).success).toBe(true);
  });

  it('兩個平台連結都沒有時失敗並說明原因', () => {
    const r = builtinModSchema.safeParse({ ...litematica, links: {} });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues.map((i) => i.message)).toContain('內建條目必須提供 Modrinth 或 CurseForge 連結');
  });
});

describe('checkCurseforgeLinks', () => {
  const cf = 'https://www.curseforge.com/minecraft/mc-mods/some-mod';
  it('有 Modrinth 連結或 CurseForge 連結格式正確時通過', () => {
    expect(
      checkCurseforgeLinks([
        { modId: 'a', links: { modrinth: 'https://modrinth.com/mod/a' } },
        { modId: 'b', links: { curseforge: cf } },
        { modId: 'c', links: { modrinth: 'https://modrinth.com/mod/c', curseforge: 'https://example.com/x' } },
      ]),
    ).toEqual([]);
  });

  it('只有 CurseForge 連結但格式不符時回報', () => {
    expect(checkCurseforgeLinks([{ modId: 'd', links: { curseforge: 'https://www.curseforge.com/minecraft/modpacks/x' } }])).toEqual([
      'd: CurseForge 連結格式不符（應為 https://www.curseforge.com/minecraft/mc-mods/<slug>）',
    ]);
  });
});

describe('checkBuiltinConflicts', () => {
  it('回報同時存在的 modId', () => {
    expect(checkBuiltinConflicts(['a', 'b'], ['b', 'c'])).toEqual(['b 同時存在於 data/mods 與 data/builtin-mods']);
  });
});
