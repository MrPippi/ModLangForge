import { describe, expect, it } from 'vitest';
import { catalogModpackSchema, isValidModpackId, isValidNamespace, langRecordSchema, modpackModKey } from './index';

const VALID = {
  id: 'example-pack',
  name: 'Example Pack',
  nameZh: '範例整合包',
  summary: '繁中簡介',
  authors: ['someone'],
  links: { modrinth: 'https://modrinth.com/modpack/example-pack', curseforge: 'https://www.curseforge.com/minecraft/modpacks/example-pack' },
  source: { platform: 'modrinth', projectId: 'AbCd1234', version: '1.4.0', mcVersion: '1.20.1', loader: 'forge' },
  mods: [
    { platform: 'modrinth', projectId: 'LNytGWDc', slug: 'create' },
    { platform: 'curseforge', projectId: '238222', slug: 'jei' },
  ],
  translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: '機器翻譯', url: null } },
  updatedAt: '2026-10-17',
};

function messages(raw: unknown): string[] {
  const result = catalogModpackSchema.safeParse(raw);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}：${i.message}`);
}

describe('catalogModpackSchema', () => {
  it('accepts the documented example and defaults contributors', () => {
    const parsed = catalogModpackSchema.parse(VALID);
    expect(parsed.translation.contributors).toEqual([]);
    expect(parsed.mods).toHaveLength(2);
  });

  it('allows the same projectId on different platforms', () => {
    const mods = [{ platform: 'modrinth', projectId: '1', slug: 'a' }, { platform: 'curseforge', projectId: '1', slug: 'a' }];
    expect(messages({ ...VALID, mods })).toEqual([]);
  });

  it('rejects duplicate (platform, projectId) pairs', () => {
    const mods = [{ platform: 'modrinth', projectId: '1', slug: 'a' }, { platform: 'modrinth', projectId: '1', slug: 'b' }];
    expect(messages({ ...VALID, mods })).toEqual(['mods：模組（平台＋專案 ID）不可重複']);
  });

  it.each([['Example'], ['..'], ['.'], ['a/b'], [''], ['index']])('rejects id %j', (id) => {
    expect(messages({ ...VALID, id })).toEqual(['id：id 只能包含 a-z 0-9 _ . -，且不可為 .、.. 或 index']);
  });

  it('rejects unknown Minecraft versions, loaders and platforms', () => {
    expect(messages({ ...VALID, source: { ...VALID.source, mcVersion: '1.99' } })).toEqual(['source.mcVersion：不支援的 Minecraft 版本']);
    expect(messages({ ...VALID, source: { ...VALID.source, loader: 'rift' } })[0]).toMatch(/^source\.loader：/);
    expect(messages({ ...VALID, source: { ...VALID.source, platform: 'ftb' } })[0]).toMatch(/^source\.platform：/);
  });

  it('requires at least one https link', () => {
    expect(messages({ ...VALID, links: {} })).toEqual(['links：至少需要一個連結']);
    expect(messages({ ...VALID, links: { modrinth: 'http://modrinth.com/modpack/x' } })).toEqual(['links.modrinth：只接受 https:// 網址']);
  });

  it('limits the summary length and checks the date format', () => {
    expect(messages({ ...VALID, summary: 'x'.repeat(121) })[0]).toMatch(/^summary：/);
    expect(messages({ ...VALID, updatedAt: '2026/10/17' })).toEqual(['updatedAt：日期格式須為 YYYY-MM-DD']);
  });
});

describe('ids and namespaces', () => {
  it('accepts namespace-like ids and namespaces only', () => {
    expect(isValidModpackId('example-pack')).toBe(true);
    expect(isValidModpackId('index')).toBe(false);
    expect(isValidNamespace('kubejs')).toBe(true);
    expect(isValidNamespace('my_pack.v2')).toBe(true);
    for (const bad of ['KubeJS', '.', '..', 'a/b', 'a b', '']) expect(isValidNamespace(bad)).toBe(false);
  });

  it('keys mods by platform and project id', () => {
    expect(modpackModKey({ platform: 'curseforge', projectId: '238222' })).toBe('curseforge:238222');
  });

  it('validates lang records', () => {
    expect(langRecordSchema.safeParse({ a: 'A' }).success).toBe(true);
    expect(langRecordSchema.safeParse({ a: 1 }).success).toBe(false);
    expect(langRecordSchema.safeParse(JSON.parse('{"__proto__":"x"}')).success).toBe(false);
  });
});
