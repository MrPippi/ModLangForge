import { describe, expect, it } from 'vitest';
import { keepBranchTranslations } from './index';

describe('keepBranchTranslations', () => {
  const en = { a: 'Apple', b: 'Back', c: 'Cat', d: 'Dog' };

  it('keeps translations added or changed on the tracking branch', () => {
    const r = keepBranchTranslations({
      base: { a: '蘋果', b: '後' },
      branch: { a: '蘋果', b: '返回', c: '貓' },
      current: { a: '蘋果', b: '後' },
      en,
    });
    expect(r.zh).toEqual({ a: '蘋果', b: '返回', c: '貓' });
    expect(r.kept).toEqual(['b', 'c']);
  });

  it('leaves the new run alone when the branch did not change anything', () => {
    const current = { a: '蘋果', d: '狗' };
    const r = keepBranchTranslations({ base: { a: '蘋果' }, branch: { a: '蘋果' }, current, en });
    expect(r.zh).toBe(current);
    expect(r.kept).toEqual([]);
  });

  it('drops branch translations whose key is no longer in en_us', () => {
    const r = keepBranchTranslations({ base: {}, branch: { gone: '舊' }, current: {}, en });
    expect(r.kept).toEqual([]);
  });

  it('skips empty branch values so an unfinished edit never blanks a translation', () => {
    const r = keepBranchTranslations({ base: { a: '蘋果' }, branch: { a: '' }, current: { a: '蘋果' }, en });
    expect(r.zh).toEqual({ a: '蘋果' });
  });

  it('does not mutate its inputs', () => {
    const current = { a: '蘋果' };
    keepBranchTranslations({ base: {}, branch: { c: '貓' }, current, en });
    expect(current).toEqual({ a: '蘋果' });
  });
});
