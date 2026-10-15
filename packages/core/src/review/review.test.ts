import { describe, expect, it } from 'vitest';
import { lookupEntry, maxProposedLength, SUGGESTION_LIMITS, validateSuggestion } from './index';

describe('maxProposedLength', () => {
  it('is 4x source, at least 50, at most 1000', () => {
    expect(maxProposedLength('abc')).toBe(50);
    expect(maxProposedLength('a'.repeat(100))).toBe(400);
    expect(maxProposedLength('a'.repeat(400))).toBe(SUGGESTION_LIMITS.maxChars);
  });
});

describe('validateSuggestion', () => {
  const base = { source: 'Apple %s', current: '蘋果 %s' };

  it('accepts a changed translation without warning', () => {
    expect(validateSuggestion({ ...base, proposed: '蘋果（%s）' })).toEqual({ ok: true, formatWarning: false });
  });

  it('flags format code mismatch but still accepts', () => {
    expect(validateSuggestion({ ...base, proposed: '蘋果' })).toEqual({ ok: true, formatWarning: true });
  });

  it('accepts a first translation when current is null', () => {
    expect(validateSuggestion({ source: 'Apple', current: null, proposed: '蘋果' })).toEqual({ ok: true, formatWarning: false });
  });

  it.each([
    ['empty', '   '],
    ['unchanged', '蘋果 %s'],
    ['too_long', '字'.repeat(51)],
  ] as const)('rejects %s', (reason, proposed) => {
    expect(validateSuggestion({ ...base, proposed })).toEqual({ ok: false, reason });
  });

  it('rejects an overlong note', () => {
    expect(validateSuggestion({ ...base, proposed: '蘋果！%s', note: 'x'.repeat(501) })).toEqual({ ok: false, reason: 'note_too_long' });
  });
});

describe('lookupEntry', () => {
  const en = { a: 'Apple', b: 'Banana' };
  const zh = { a: '蘋果' };

  it('returns source and current translation', () => {
    expect(lookupEntry(en, zh, 'a')).toEqual({ source: 'Apple', current: '蘋果' });
    expect(lookupEntry(en, zh, 'b')).toEqual({ source: 'Banana', current: null });
  });

  it('ignores missing and prototype-named keys', () => {
    expect(lookupEntry(en, zh, 'zzz')).toBeNull();
    expect(lookupEntry(en, zh, 'constructor')).toBeNull();
    expect(lookupEntry(en, zh, '__proto__')).toBeNull();
  });

  it('ignores non-string values', () => {
    expect(lookupEntry({ a: 1 }, {}, 'a')).toBeNull();
    expect(lookupEntry(en, { a: 2 }, 'a')).toEqual({ source: 'Apple', current: null });
  });
});
