import { describe, expect, it } from 'vitest';
import type { GlossaryTerm } from '../glossary';
import { validateModData } from './validateMod';

const meta = {
  modId: 'create',
  name: 'Create',
  summary: '測試模組',
  authors: ['tester'],
  links: { modrinth: 'https://modrinth.com/mod/create' },
  mcVersions: ['1.20.1'],
  sourceVersions: [{ mcVersion: '1.20.1', loader: 'forge' }],
  loaders: ['forge'],
  format: 'json',
  translation: { status: 'partial', license: 'CC-BY-SA-4.0', source: { name: 'test', url: null } },
  updatedAt: '2026-10-15',
};

const en = { a: 'Cogwheel', b: 'Enchantment Table', c: 'Shaft' };
const terms: GlossaryTerm[] = [
  { en: 'Cogwheel', zh: '齒輪', level: 'warning' },
  { en: 'Enchantment', zh: '附魔', level: 'error' },
];

describe('validateModData glossary checks', () => {
  it('reports glossary violations on zh_tw.json with the term level', () => {
    const issues = validateModData('create', meta, en, { a: '齒輪', b: '魔咒台', c: '軸' }, terms);
    expect(issues).toEqual([{ level: 'error', file: 'zh_tw.json', key: 'b', message: '術語「Enchantment」應譯為「附魔」' }]);
  });

  it('reports warnings for warning-level terms', () => {
    const issues = validateModData('create', meta, en, { a: '輪子' }, terms);
    expect(issues).toEqual([{ level: 'warning', file: 'zh_tw.json', key: 'a', message: '術語「Cogwheel」應譯為「齒輪」' }]);
  });

  it('runs no glossary checks when no terms are given', () => {
    expect(validateModData('create', meta, en, { a: '輪子' })).toEqual([]);
  });
});
