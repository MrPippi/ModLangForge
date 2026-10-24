import { describe, expect, it } from 'vitest';
import { reuseTranslations } from './reuseTranslations';

describe('reuseTranslations', () => {
  it('copies the translation of an existing key with the same English text', () => {
    const en = { 'block.m.oak': 'Oak Chair', 'item.m.oak': 'Oak Chair', 'item.m.new': 'Brand New' };
    expect(reuseTranslations(en, { 'block.m.oak': '橡木椅' }, ['item.m.oak', 'item.m.new'])).toEqual({ 'item.m.oak': '橡木椅' });
  });

  it('skips text that has more than one translation, and empty translations', () => {
    const en = { a: 'Open', b: 'Open', c: 'Close', d: 'Close', x: 'Open', y: 'Close' };
    expect(reuseTranslations(en, { a: '開啟', b: '打開', c: ' ' }, ['x', 'y'])).toEqual({});
  });

  it('does not reuse from other keys added in the same build', () => {
    expect(reuseTranslations({ a: 'Hi', b: 'Hi' }, { a: '嗨' }, ['a', 'b'])).toEqual({});
  });
});
