import { describe, expect, it } from 'vitest';
import { flatten, rebuild } from './index';

const ENTRY = {
  name: 'B Entry',
  icon: 'minecraft:stone',
  category: 'demo:basics',
  pages: [
    { type: 'patchouli:text', text: 'Hello $(item)world$().', title: 'Page Title' },
    { type: 'patchouli:crafting', recipe: 'demo:x', text: '' },
    'not a page',
    { type: 'patchouli:link', text: 'Visit', url: 'https://example.com', link_text: 'Website', anchor: 'a' },
    { type: 'patchouli:text', text: 5 },
  ],
};
const CATEGORY = { description: 'Basics desc', name: 'Basics', icon: 'minecraft:book', sortnum: 1 };

const files = {
  'guide/en_us/entries/b.json': JSON.stringify(ENTRY),
  'guide/en_us/categories/basics.json': JSON.stringify(CATEGORY),
  'guide/en_us/templates/custom.json': JSON.stringify({ components: [{ type: 'text', text: 'x' }] }),
  'guide/en_us/broken.json': '{',
};

describe('flatten', () => {
  it('extracts whitelisted string fields in path order, then field order', () => {
    const { order, source } = flatten(files);
    expect(order).toEqual([
      'guide/categories/basics.json#name',
      'guide/categories/basics.json#description',
      'guide/entries/b.json#name',
      'guide/entries/b.json#pages/0/title',
      'guide/entries/b.json#pages/0/text',
      'guide/entries/b.json#pages/3/text',
      'guide/entries/b.json#pages/3/link_text',
    ]);
    expect(source['guide/entries/b.json#pages/0/text']).toBe('Hello $(item)world$().');
    expect(source['guide/categories/basics.json#description']).toBe('Basics desc');
  });

  it('strips a BOM before parsing', () => {
    const { order } = flatten({ 'guide/en_us/a.json': '﻿' + JSON.stringify({ name: 'A' }) });
    expect(order).toEqual(['guide/a.json#name']);
  });

  it('returns nothing for empty input', () => {
    expect(flatten({})).toEqual({ source: {}, order: [] });
  });
});

describe('rebuild', () => {
  const translations = {
    'guide/entries/b.json#pages/0/text': '你好 $(item)世界$()。',
    'guide/categories/basics.json#name': '基礎',
    'guide/entries/b.json#name': '',
    'guide/entries/b.json#pages/4/text': '數字',
    'guide/entries/b.json#pages/1/text': '空白',
  };

  it('fills translations and keeps English for untranslated fields', () => {
    const out = rebuild(files, translations);
    expect(JSON.parse(out['guide/en_us/categories/basics.json'] ?? '{}')).toEqual({ ...CATEGORY, name: '基礎' });
    const entry = JSON.parse(out['guide/en_us/entries/b.json'] ?? '{}');
    expect(entry.name).toBe('B Entry');
    expect(entry.pages[0]).toEqual({ type: 'patchouli:text', text: '你好 $(item)世界$()。', title: 'Page Title' });
    expect(entry.icon).toBe('minecraft:stone');
  });

  it('leaves empty, non-string and non-object values untouched', () => {
    const entry = JSON.parse(rebuild(files, translations)['guide/en_us/entries/b.json'] ?? '{}');
    expect(entry.pages[1]).toEqual(ENTRY.pages[1]);
    expect(entry.pages[2]).toBe('not a page');
    expect(entry.pages[4]).toEqual({ type: 'patchouli:text', text: 5 });
  });

  it('returns the same paths and passes unparsable or template files through verbatim', () => {
    const out = rebuild(files, translations);
    expect(Object.keys(out).sort()).toEqual(Object.keys(files).sort());
    expect(out['guide/en_us/broken.json']).toBe('{');
    expect(out['guide/en_us/templates/custom.json']).toBe(files['guide/en_us/templates/custom.json']);
  });

  it('round-trips: rebuilding with the flattened source restores the original JSON', () => {
    const tricky = {
      'book/en_us/entries/x.json': JSON.stringify({
        name: 'X ✓', category: 'demo:c', read_by_default: true, sortnum: 3,
        extra_recipe_mappings: { 'demo:a': 1, 10: 2 },
        pages: [
          { type: 'patchouli:multiblock', name: 'Altar', multiblock: { pattern: [['A']], mapping: { A: 'minecraft:stone' } }, text: 'Line$(br)two' },
          { type: 'patchouli:image', images: ['demo:a.png'], title: 'Pic', border: true },
        ],
      }),
      ...files,
    };
    const out = rebuild(tricky, flatten(tricky).source);
    for (const [path, text] of Object.entries(tricky)) {
      if (path.endsWith('broken.json')) continue;
      expect(JSON.parse(out[path] ?? 'null')).toEqual(JSON.parse(text));
    }
  });

  it('writes pretty JSON with a trailing newline and does not mutate its inputs', () => {
    const snapshot = JSON.stringify([files, translations]);
    const out = rebuild(files, translations);
    expect(out['guide/en_us/categories/basics.json']).toMatch(/^\{\n {2}"description"[\s\S]*\}\n$/);
    expect(JSON.stringify([files, translations])).toBe(snapshot);
  });
});
