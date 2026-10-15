import { describe, expect, it } from 'vitest';
import { catalogModSchema, catalogToProject, LICENSE_ALLOWLIST, validateModData, versionCoverage, type CatalogMod } from './index';

const valid = {
  modId: 'create',
  name: 'Create',
  nameZh: '機械動力',
  aliases: ['create mod'],
  summary: '以齒輪與動力學打造自動化機械。',
  authors: ['simibubi'],
  links: { modrinth: 'https://modrinth.com/mod/create' },
  sourceVersions: [{ modVersion: '6.0.6', mcVersion: '1.21.1', loader: 'forge', missingKeys: [] }],
  mcVersions: ['1.20.1', '1.21.1'],
  loaders: ['forge', 'fabric'],
  format: 'json',
  translation: {
    status: 'reviewed',
    license: 'CC-BY-SA-4.0',
    source: { name: 'ModLangForge 貢獻者', url: null },
    contributors: ['someone'],
  },
  updatedAt: '2026-10-15',
};

const with_ = (patch: Record<string, unknown>) => ({ ...valid, ...patch });

describe('catalogModSchema', () => {
  it('accepts a valid mod.json and fills defaults', () => {
    const parsed = catalogModSchema.parse(with_({ aliases: undefined }));
    expect(parsed.aliases).toEqual([]);
  });

  it('accepts every allowlisted license and an optional builtinPercent', () => {
    for (const license of LICENSE_ALLOWLIST) {
      const input = with_({ translation: { ...valid.translation, license, builtinPercent: 40 } });
      expect(catalogModSchema.safeParse(input).success).toBe(true);
    }
  });

  it.each([
    ['invalid modId', with_({ modId: 'Bad Id' })],
    ['dot modId', with_({ modId: '.' })],
    ['dot-dot modId', with_({ modId: '..' })],
    ['non-https link', with_({ links: { modrinth: 'http://modrinth.com/mod/create' } })],
    ['no links', with_({ links: {} })],
    ['unknown mc version', with_({ mcVersions: ['0.1'] })],
    ['empty mc versions', with_({ mcVersions: [] })],
    ['bad loader', with_({ loaders: ['rift'] })],
    ['summary too long', with_({ summary: '字'.repeat(121) })],
    ['bad status', with_({ translation: { ...valid.translation, status: 'done' } })],
    ['bad date', with_({ updatedAt: '2026/10/15' })],
    ['non-https source url', with_({ translation: { ...valid.translation, source: { name: 'x', url: 'ftp://x' } } })],
    ['license outside allowlist', with_({ translation: { ...valid.translation, license: 'CC-BY-NC-ND-4.0' } })],
    ['builtinPercent out of range', with_({ translation: { ...valid.translation, builtinPercent: 101 } })],
  ])('rejects %s', (_label, input) => {
    expect(catalogModSchema.safeParse(input).success).toBe(false);
  });
});

describe('validateModData', () => {
  const en = { a: 'Apple %s', b: 'Banana' };

  it('returns no issues for valid data', () => {
    expect(validateModData('create', valid, en, { a: '蘋果 %s' })).toEqual([]);
  });

  it('reports schema errors against mod.json', () => {
    const issues = validateModData('create', with_({ summary: '' }), en, {});
    expect(issues[0]).toMatchObject({ level: 'error', file: 'mod.json' });
  });

  it('reports folder / modId mismatch', () => {
    const issues = validateModData('other', valid, en, {});
    expect(issues).toEqual([expect.objectContaining({ level: 'error', file: 'mod.json' })]);
  });

  it('reports non-string-record lang files', () => {
    expect(validateModData('create', valid, ['x'], {})[0]).toMatchObject({ file: 'en_us.json', level: 'error' });
    expect(validateModData('create', valid, en, { a: 1 })[0]).toMatchObject({ file: 'zh_tw.json', level: 'error', key: 'a' });
  });

  it('does not crash on prototype-named keys', () => {
    const issues = validateModData('create', valid, en, { constructor: '建構', toString: '字串' });
    expect(issues.map((i) => i.key)).toEqual(['constructor', 'toString']);
  });

  it('reports zh_tw keys missing from en_us', () => {
    const issues = validateModData('create', valid, en, { c: '櫻桃' });
    expect(issues).toEqual([expect.objectContaining({ level: 'error', file: 'zh_tw.json', key: 'c' })]);
  });

  it('reports format code mismatches as warnings', () => {
    const issues = validateModData('create', valid, en, { a: '蘋果' });
    expect(issues).toEqual([expect.objectContaining({ level: 'warning', file: 'zh_tw.json', key: 'a' })]);
  });
});

describe('catalogToProject', () => {
  it('builds entries in en_us order with translation status', () => {
    const meta: CatalogMod = catalogModSchema.parse(with_({ format: 'lang' }));
    const p = catalogToProject(meta, { b: 'Banana', a: 'Apple' }, { a: '蘋果' });
    expect(p).toMatchObject({ id: 'create', modId: 'create', name: 'Create', version: '6.0.6', format: 'lang' });
    expect(p.entries).toEqual([
      { key: 'b', source: 'Banana', target: '', status: 'untranslated' },
      { key: 'a', source: 'Apple', target: '蘋果', status: 'translated' },
    ]);
  });

  it('uses unknown version when the first source has no modVersion', () => {
    const meta = catalogModSchema.parse(with_({ sourceVersions: [{ mcVersion: '1.21.1', loader: 'forge' }] }));
    expect(catalogToProject(meta, {}, {}).version).toBe('unknown');
  });

  it('rejects legacy mod.json without sourceVersions', () => {
    const issues = validateModData('create', with_({ sourceVersions: undefined, modVersion: '6.0.6' }), { a: 'A' }, {});
    expect(issues).toEqual([expect.objectContaining({ level: 'error', file: 'mod.json', message: expect.stringContaining('sourceVersions') })]);
  });
});

const sv = (patch: Record<string, unknown> = {}) => ({
  modVersion: '6.0.6', mcVersion: '1.21.1', loader: 'neoforge', missingKeys: [], ...patch,
});

describe('sourceVersions schema', () => {
  it('accepts source versions and defaults missingKeys', () => {
    const parsed = catalogModSchema.parse(with_({ sourceVersions: [{ mcVersion: '1.20.1', loader: 'forge' }] }));
    expect(parsed.sourceVersions).toEqual([{ mcVersion: '1.20.1', loader: 'forge', missingKeys: [] }]);
  });

  it('allows the same mc version on different loaders', () => {
    const input = with_({ sourceVersions: [sv(), sv({ loader: 'fabric' })] });
    expect(catalogModSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    ['empty list', []],
    ['unknown mc version', [sv({ mcVersion: '0.1' })]],
    ['bad loader', [sv({ loader: 'rift' })]],
    ['duplicate version', [sv(), sv()]],
    ['empty missing key', [sv({ missingKeys: [''] })]],
  ])('rejects %s', (_label, list) => {
    expect(catalogModSchema.safeParse(with_({ sourceVersions: list })).success).toBe(false);
  });
});

describe('validateModData sourceVersions', () => {
  const en = { a: 'Apple %s', b: 'Banana' };

  it('accepts missingKeys that exist in en_us', () => {
    const meta = with_({ sourceVersions: [sv(), sv({ mcVersion: '1.20.1', missingKeys: ['b'] })] });
    expect(validateModData('create', meta, en, {})).toEqual([]);
  });

  it('rejects missingKeys not in en_us', () => {
    const issues = validateModData('create', with_({ sourceVersions: [sv({ missingKeys: ['zzz'] })] }), en, {});
    expect(issues).toEqual([expect.objectContaining({ level: 'error', file: 'mod.json', key: 'zzz' })]);
  });

  it('rejects duplicated missingKeys', () => {
    const meta = with_({ sourceVersions: [sv(), sv({ mcVersion: '1.20.1', missingKeys: ['b', 'b'] })] });
    const issues = validateModData('create', meta, en, {});
    expect(issues).toEqual([expect.objectContaining({ level: 'error', file: 'mod.json', key: 'b' })]);
  });

  it('rejects keys missing from every source version', () => {
    const issues = validateModData('create', with_({ sourceVersions: [sv({ missingKeys: ['b'] })] }), en, {});
    expect(issues).toEqual([expect.objectContaining({ level: 'error', file: 'en_us.json', key: 'b' })]);
  });
});

describe('versionCoverage', () => {
  it("uses each version's own key set as the denominator", () => {
    const meta = catalogModSchema.parse(with_({ sourceVersions: [sv(), sv({ mcVersion: '1.20.1', missingKeys: ['b'] })] }));
    const result = versionCoverage(meta, { a: 'A', b: 'B' }, { a: '甲' });
    expect(result.map((r) => [r.source.mcVersion, r.translated, r.total, r.percent])).toEqual([
      ['1.21.1', 1, 2, 50],
      ['1.20.1', 1, 1, 100],
    ]);
  });

  it('treats empty translations as untranslated and handles zero keys', () => {
    const meta = catalogModSchema.parse(with_({ sourceVersions: [sv()] }));
    expect(versionCoverage(meta, { a: 'A' }, { a: '' })[0]).toMatchObject({ translated: 0, total: 1, percent: 0 });
    expect(versionCoverage(meta, {}, {})[0]).toMatchObject({ total: 0, percent: 0 });
  });
});
