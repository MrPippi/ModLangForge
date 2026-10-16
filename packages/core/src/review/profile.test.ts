import { describe, expect, it } from 'vitest';
import { DISPLAY_NAME_MAX, isMinecraftName, mergeContributors, sanitizeName, validateDisplayName } from './index';

describe('sanitizeName', () => {
  it('replaces control, zero-width and bidi characters and collapses whitespace', () => {
    expect(sanitizeName('Eve\nCo-authored-by: Mallory <m@x>')).toBe('Eve Co-authored-by: Mallory <m@x>');
    expect(sanitizeName('\u202eevil\u202c  name\t')).toBe('evil name');
    expect(sanitizeName('a\u0000b\u200bc\u2028d')).toBe('a b c d');
  });

  it('normalizes to NFC and keeps emoji ZWJ sequences', () => {
    expect(sanitizeName('e\u0301')).toBe('\u00e9');
    expect(sanitizeName('\u{1f469}\u200d\u{1f4bb} dev')).toBe('\u{1f469}\u200d\u{1f4bb} dev');
  });

  it('truncates by code point without splitting surrogate pairs', () => {
    expect(sanitizeName('\u{1f600}'.repeat(5), 3)).toBe('\u{1f600}\u{1f600}\u{1f600}');
    expect([...sanitizeName('字'.repeat(80))]).toHaveLength(64);
  });
});

describe('validateDisplayName', () => {
  it('returns the cleaned name', () => {
    expect(validateDisplayName('  史蒂夫\n ')).toEqual({ ok: true, name: '史蒂夫' });
  });

  it('rejects blank and over-long names', () => {
    expect(validateDisplayName(' \u200b\t')).toEqual({ ok: false, reason: 'empty' });
    expect(validateDisplayName('字'.repeat(DISPLAY_NAME_MAX + 1))).toEqual({ ok: false, reason: 'too_long' });
    expect(validateDisplayName('字'.repeat(DISPLAY_NAME_MAX)).ok).toBe(true);
  });
});

describe('isMinecraftName', () => {
  it.each(['Steve', 'jeb_', 'a', 'A'.repeat(16), 'Player_123'])('accepts %s', (name) => {
    expect(isMinecraftName(name)).toBe(true);
  });

  it.each(['', 'A'.repeat(17), 'Steve!', '史蒂夫', 'a b', 'name\n'])('rejects %j', (name) => {
    expect(isMinecraftName(name)).toBe(false);
  });
});

describe('mergeContributors', () => {
  it('sanitizes incoming names before deduping (commit trailers cannot be forged)', () => {
    expect(mergeContributors(['A'], ['Eve\nCo-authored-by: x', 'A\u200b', null])).toEqual([
      'A',
      'Eve Co-authored-by: x',
    ]);
  });
});
