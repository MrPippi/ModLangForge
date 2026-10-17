import { describe, expect, it } from 'vitest';
import { progressTagText, progressTier } from './progress';

describe('progress helpers', () => {
  it('is complete only when every entry is translated', () => {
    expect(progressTagText(1340, 1340, 100)).toBe('✓ 完整翻譯');
    expect(progressTagText(1339, 1340, 100)).toBe('翻譯 99%');
    expect(progressTagText(0, 0, 0)).toBe('翻譯 0%');
    expect(progressTier(0, 0, 0)).toBe('low');
  });

  it('splits tiers at 70%', () => {
    expect(progressTier(70, 100, 70)).toBe('most');
    expect(progressTier(69, 100, 69)).toBe('low');
    expect(progressTier(100, 100, 100)).toBe('complete');
  });
});
