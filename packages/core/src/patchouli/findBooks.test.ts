import { describe, expect, it } from 'vitest';
import { findBooks, SKIP_REASONS } from './index';

const ENTRY = JSON.stringify({ name: 'Intro', pages: [{ type: 'patchouli:text', text: 'Hi' }] });

function find(namespace: string, files: Record<string, string>) {
  const read = async (path: string): Promise<string> => {
    const text = files[path];
    if (text === undefined) throw new Error(`missing ${path}`);
    return text;
  };
  return findBooks(namespace, Object.keys(files), read);
}

describe('findBooks', () => {
  it('collects en_us content of resource-pack books, skipping templates, other locales and non-JSON files', async () => {
    const guide = await find('demo', {
      'data/demo/patchouli_books/guide/book.json': JSON.stringify({ name: 'demo.book', use_resource_pack: true }),
      'assets/demo/patchouli_books/guide/en_us/categories/basics.json': ENTRY,
      'assets/demo/patchouli_books/guide/en_us/entries/basics/intro.json': ENTRY,
      'assets/demo/patchouli_books/guide/en_us/templates/custom.json': ENTRY,
      'assets/demo/patchouli_books/guide/zh_tw/entries/basics/intro.json': ENTRY,
      'assets/demo/patchouli_books/guide/en_us/entries/basics/icon.png': 'x',
    });
    expect(guide).toEqual({
      files: { 'guide/en_us/categories/basics.json': ENTRY, 'guide/en_us/entries/basics/intro.json': ENTRY },
      skipped: [],
    });
  });

  it.each([['data/demo/patchouli_books/guide/book.json'], ['assets/demo/patchouli_books/guide/book.json']])(
    'skips books whose %s sets "i18n": true',
    async (bookJson) => {
      const guide = await find('demo', {
        [bookJson]: JSON.stringify({ name: 'demo.book', i18n: true }),
        'assets/demo/patchouli_books/guide/en_us/entries/a.json': ENTRY,
      });
      expect(guide).toEqual({ files: {}, skipped: [{ book: 'guide', reason: SKIP_REASONS.i18n }] });
    },
  );

  it('skips books whose content lives under data/', async () => {
    const guide = await find('demo', {
      'data/demo/patchouli_books/guide/book.json': '{}',
      'data/demo/patchouli_books/guide/en_us/entries/a.json': ENTRY,
    });
    expect(guide).toEqual({ files: {}, skipped: [{ book: 'guide', reason: SKIP_REASONS.data }] });
  });

  it('ignores books of other namespaces and returns undefined without books', async () => {
    expect(await find('demo', { 'assets/other/patchouli_books/guide/en_us/entries/a.json': ENTRY })).toBeUndefined();
    expect(await find('demo', { 'assets/demo/lang/en_us.json': '{}' })).toBeUndefined();
  });

  it('reports unsafe names, broken JSON and books without English content; accepts a BOM', async () => {
    const guide = await find('demo', {
      'assets/demo/patchouli_books/Bad Book/en_us/entries/a.json': ENTRY,
      'assets/demo/patchouli_books/broken/en_us/entries/a.json': '{"name":',
      'assets/demo/patchouli_books/empty/book.json': '{}',
      'assets/demo/patchouli_books/badmeta/book.json': '{',
      'assets/demo/patchouli_books/ok/en_us/entries/a.json': '﻿' + ENTRY,
    });
    expect(guide?.files).toEqual({ 'ok/en_us/entries/a.json': '﻿' + ENTRY });
    expect(guide?.skipped).toEqual([
      { book: 'Bad Book', reason: SKIP_REASONS.invalidName },
      { book: 'badmeta', reason: SKIP_REASONS.invalidJson('assets/demo/patchouli_books/badmeta/book.json') },
      { book: 'broken', reason: SKIP_REASONS.invalidJson('assets/demo/patchouli_books/broken/en_us/entries/a.json') },
      { book: 'empty', reason: SKIP_REASONS.noContent },
    ]);
  });
});
