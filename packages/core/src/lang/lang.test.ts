import { describe, expect, it } from 'vitest';
import { LangParseError, parseJsonLang, parseLangFile, parseLangText, serializeLang } from './index';

describe('parseJsonLang', () => {
  it('keeps key order', () => {
    const r = parseJsonLang('{"b":"B","a":"A","c":"C"}');
    expect(r.order).toEqual(['b', 'a', 'c']);
    expect(r.entries).toEqual({ a: 'A', b: 'B', c: 'C' });
  });

  it('strips UTF-8 BOM', () => {
    const r = parseJsonLang('﻿{"a":"A"}');
    expect(r.entries).toEqual({ a: 'A' });
  });

  it('skips non-string values with a warning', () => {
    const r = parseJsonLang('{"a":"A","b":1,"c":{"x":"y"}}');
    expect(r.order).toEqual(['a']);
    expect(r.warnings).toHaveLength(2);
  });

  it('throws LangParseError on invalid JSON', () => {
    expect(() => parseJsonLang('{"a":')).toThrow(LangParseError);
  });

  it('throws when top level is not an object', () => {
    expect(() => parseJsonLang('["a"]')).toThrow(LangParseError);
    expect(() => parseJsonLang('null')).toThrow(LangParseError);
  });
});

describe('parseLangFile', () => {
  it('skips comments and blank lines', () => {
    const r = parseLangFile('# comment\n\nitem.a=A\n  \nitem.b=B\n');
    expect(r.order).toEqual(['item.a', 'item.b']);
  });

  it('splits only on first =', () => {
    expect(parseLangFile('a=b=c').entries).toEqual({ a: 'b=c' });
  });

  it('handles CRLF and BOM', () => {
    const r = parseLangFile('﻿a=A\r\nb=B\r\n');
    expect(r.entries).toEqual({ a: 'A', b: 'B' });
  });

  it('warns on lines without =', () => {
    const r = parseLangFile('a=A\nbroken line\n');
    expect(r.order).toEqual(['a']);
    expect(r.warnings).toHaveLength(1);
  });
});

describe('parseLangText', () => {
  it('dispatches by format', () => {
    expect(parseLangText('{"a":"A"}', 'json').entries).toEqual({ a: 'A' });
    expect(parseLangText('a=A', 'lang').entries).toEqual({ a: 'A' });
  });
});

describe('serializeLang', () => {
  it('serializes JSON with 2-space indent, unescaped CJK and trailing newline', () => {
    const out = serializeLang([['a', '鑽石'], ['b', 'x']], 'json');
    expect(out).toBe('{\n  "a": "鑽石",\n  "b": "x"\n}\n');
  });

  it('serializes .lang as key=value lines', () => {
    expect(serializeLang([['a', 'A'], ['b', 'B']], 'lang')).toBe('a=A\nb=B\n');
  });

  it('round-trips both formats', () => {
    const pairs: [string, string][] = [['z', '一'], ['a', 'with "quote" and \\n'], ['1', 'numeric key keeps order']];
    for (const format of ['json', 'lang'] as const) {
      const parsed = parseLangText(serializeLang(pairs, format), format);
      expect(parsed.order).toEqual(['z', 'a', '1']);
      expect(parsed.entries).toEqual(Object.fromEntries(pairs));
    }
  });
});
