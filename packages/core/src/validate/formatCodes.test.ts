import { describe, expect, it } from 'vitest';
import { checkFormat, checkTokens, extractTokens } from './formatCodes';

describe('extractTokens', () => {
  it('extracts printf, MessageFormat, color codes and newlines', () => {
    expect(extractTokens('%s %d %.2f %1$s %% {0} §a §L \\n')).toEqual([
      '%s', '%d', '%.2f', '%1$s', '%%', '{0}', '§a', '§l', '\\n',
    ]);
  });

  it('returns empty for plain text', () => {
    expect(extractTokens('鑽石劍')).toEqual([]);
  });
});

describe('checkFormat', () => {
  it('returns null for empty target', () => {
    expect(checkFormat('Hello %s', '')).toBeNull();
  });

  it('reports missing placeholder', () => {
    expect(checkFormat('Hello %s', '你好')).toEqual({ missing: ['%s'], extra: [] });
  });

  it('reports extra color code', () => {
    expect(checkFormat('Sword', '§a劍')).toEqual({ missing: [], extra: ['§a'] });
  });

  it('ignores order differences', () => {
    expect(checkFormat('%1$s gave %2$s', '%2$s 收到 %1$s 給的')).toBeNull();
  });

  it('treats {0} as token', () => {
    expect(checkFormat('{0} items', '物品')).toEqual({ missing: ['{0}'], extra: [] });
  });

  it('counts duplicates', () => {
    expect(checkFormat('%s and %s', '%s 和')).toEqual({ missing: ['%s'], extra: [] });
  });

  it('normalizes color code case', () => {
    expect(checkFormat('§AHi', '§a嗨')).toBeNull();
  });
});

describe('checkTokens', () => {
  it('compares token multisets with a custom extractor', () => {
    const words = (text: string) => text.split(' ').filter((w) => w !== '');
    expect(checkTokens('a b b', 'b a', words)).toEqual({ missing: ['b'], extra: [] });
    expect(checkTokens('a b', '', words)).toBeNull();
  });
});
