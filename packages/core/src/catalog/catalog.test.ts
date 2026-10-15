import { describe, expect, it } from 'vitest';
import { catalogModSchema, catalogToProject, LICENSE_ALLOWLIST, validateModData, type CatalogMod } from './index';

const valid = {
  modId: 'create',
  name: 'Create',
  nameZh: '機械動力',
  aliases: ['create mod'],
  summary: '以齒輪與動力學打造自動化機械。',
  authors: ['simibubi'],
  links: { modrinth: 'https://modrinth.com/mod/create' },
  modVersion: '6.0.6',
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

  it('uses unknown version when modVersion missing', () => {
    const meta = catalogModSchema.parse(with_({ modVersion: undefined }));
    expect(catalogToProject(meta, {}, {}).version).toBe('unknown');
  });
});
