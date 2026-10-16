import { describe, expect, it } from 'vitest';
import { guideFilePrefix, guideKey, guidePackPath, isValidBookName, parseGuidePath } from './index';

describe('parseGuidePath', () => {
  it('splits a book path into book and path under en_us', () => {
    expect(parseGuidePath('guide/en_us/entries/basics/intro.json')).toEqual({ book: 'guide', rel: 'entries/basics/intro.json' });
  });

  it.each([
    ['guide/en_us/templates/custom.json'],
    ['guide/zh_tw/entries/a.json'],
    ['guide/en_us/entries/a.txt'],
    ['../en_us/a.json'],
    ['Bad Book/en_us/a.json'],
    ['guide/en_us/../../x.json'],
    ['guide/en_us/entries//a.json'],
    ['guide/en_us/a\\..\\b.json'],
    ['en_us/a.json'],
  ])('rejects %s', (path) => {
    expect(parseGuidePath(path)).toBeNull();
  });
});

describe('book names and keys', () => {
  it('accepts namespace-like book names only', () => {
    expect(isValidBookName('guide_book-2.x')).toBe(true);
    expect(isValidBookName('.')).toBe(false);
    expect(isValidBookName('..')).toBe(false);
    expect(isValidBookName('Guide')).toBe(false);
  });

  it('builds keys and file prefixes without the en_us segment', () => {
    const path = { book: 'guide', rel: 'entries/basics/intro.json' };
    expect(guideKey(path, 'pages/0/text')).toBe('guide/entries/basics/intro.json#pages/0/text');
    expect(guideFilePrefix(path)).toBe('guide/entries/basics/intro.json');
  });
});

describe('guidePackPath', () => {
  it('maps a source file to its zh_tw location in the resource pack', () => {
    expect(guidePackPath('demo', 'guide/en_us/entries/a.json')).toBe('assets/demo/patchouli_books/guide/zh_tw/entries/a.json');
  });

  it('refuses paths that could escape the book folder', () => {
    expect(guidePackPath('demo', '../en_us/a.json')).toBeNull();
    expect(guidePackPath('demo', 'guide/en_us/../../../evil.json')).toBeNull();
  });
});
