import { describe, expect, it } from 'vitest';
import { compounds, listField, MAX_SNBT_DEPTH, parseSnbt, SnbtParseError, stringField } from './index';

const str = (value: string) => ({ kind: 'string', value });
const num = (raw: string) => ({ kind: 'number', raw });

describe('parseSnbt', () => {
  it('reads FTB-style files: newlines instead of commas, unquoted keys, suffixes, typed arrays and comments', () => {
    const text = [
      '# FTB Quests chapter',
      '{',
      '\tid: "44A5523F7A909209"',
      '\tgroup: ""',
      '\torder_index: 0',
      '\tsize: 1.0d',
      '\tcount: 3L',
      '\thide: false',
      '\tflags: [I; 1, 2 3]',
      '\t// a comment line',
      '\ttitle = Mining',
      '\tsubtitle: [',
      '\t\t"Line one"',
      '\t\t"Line two",,',
      '\t]',
      '\t/* block */ empty: {}',
      '}',
    ].join('\n');
    expect(parseSnbt(text)).toEqual({
      kind: 'compound',
      entries: {
        id: str('44A5523F7A909209'), group: str(''), order_index: num('0'), size: num('1.0d'), count: num('3L'),
        hide: { kind: 'boolean', value: false }, flags: { kind: 'array', type: 'I', items: ['1', '2', '3'] },
        title: str('Mining'), subtitle: { kind: 'list', items: [str('Line one'), str('Line two')] },
        empty: { kind: 'compound', entries: {} },
      },
    });
  });

  it('accepts the JSON5 style used by split lang files', () => {
    const c = parseSnbt('{\n  "a": "x", // trailing comment\n  "b": ["y", "z",],\n}\n');
    expect(c.entries).toEqual({ a: str('x'), b: { kind: 'list', items: [str('y'), str('z')] } });
  });

  it('handles quotes and escapes like FTB Library, plus \\u escapes', () => {
    const c = parseSnbt(String.raw`{ a: "q\"b\\s\tt\nn", b: 'it\'s "ok"', c: "café", d: "\\&a", e: "x\&y", "quoted key": 1b }`);
    expect(c.entries).toEqual({
      a: str('q"b\\s\tt\nn'), b: str('it\'s "ok"'), c: str('café'), d: str('\\&a'), e: str('xy'), 'quoted key': num('1b'),
    });
  });

  it('keeps keys such as __proto__ and constructor as plain own entries', () => {
    const c = parseSnbt('{ __proto__: "x", constructor: "y", toString: [] }');
    expect(Object.getPrototypeOf(c.entries)).toBe(Object.prototype);
    expect(Object.keys(c.entries)).toEqual(['__proto__', 'constructor', 'toString']);
    expect(stringField(c, '__proto__')).toBe('x');
    expect(stringField(c, 'constructor')).toBe('y');
    expect(stringField(c, 'valueOf')).toBeUndefined();
    expect(listField(c, 'toString')).toEqual([]);
  });

  it('lets a repeated key replace the earlier value and strips a BOM', () => {
    expect(stringField(parseSnbt('﻿{ a: "1"\n a: "2" }'), 'a')).toBe('2');
  });

  it.each([
    ['{\n\ta: "abc\n}', '第 2 行：字串缺少結尾的引號（字串不可跨行）'],
    ['{\n\ta: 1\n', '第 1 行：缺少結尾的 }'],
    ['{ a: [1, 2', '第 1 行：缺少結尾的 ]'],
    ['{ a 1 }', '第 1 行：「a」後面應該是冒號'],
    ['{ a: @ }', '第 1 行：無法辨識的字元「@」'],
    ['[1, 2]', '第 1 行：最外層必須是 { } 物件'],
    ['{ a: 1 } b', '第 1 行：結尾有多餘的內容'],
    ['', '第 1 行：檔案意外結束'],
    ['{ a: [I; 1, "x"] }', '第 1 行：型別陣列只能放數字'],
    ['{ /* never closed', '第 1 行：註解缺少結尾的 */'],
  ])('reports %j with a line number', (text, message) => {
    expect(() => parseSnbt(text)).toThrow(SnbtParseError);
    expect(() => parseSnbt(text)).toThrow(message);
  });

  it(`rejects nesting deeper than ${MAX_SNBT_DEPTH} levels instead of overflowing the stack`, () => {
    const deep = `{ a: ${'['.repeat(10_000)}${']'.repeat(10_000)} }`;
    expect(() => parseSnbt(deep)).toThrow(`第 1 行：巢狀超過 ${MAX_SNBT_DEPTH} 層`);
  });
});

describe('field helpers', () => {
  it('reads typed fields and keeps only compounds from lists', () => {
    const c = parseSnbt('{ s: "x", n: 1, l: [{ a: 1 }, "skip", { b: 2 }] }');
    expect(stringField(c, 'n')).toBeUndefined();
    expect(listField(c, 's')).toBeUndefined();
    expect(compounds(listField(c, 'l')).map((x) => Object.keys(x.entries))).toEqual([['a'], ['b']]);
    expect(compounds(undefined)).toEqual([]);
  });
});
