import { describe, expect, it } from 'vitest';
import { versionRange } from './pickVersion';

describe('versionRange', () => {
  it('shows oldest to newest', () => {
    expect(versionRange(['1.21.1', '1.20.1', '1.20.6'])).toBe('1.20.1–1.21.1');
  });

  it('returns the single version as is', () => {
    expect(versionRange(['1.20.1'])).toBe('1.20.1');
  });

  it('returns empty text for no versions', () => {
    expect(versionRange([])).toBe('');
  });

  it('shows 26.x as the newest end of the range', () => {
    expect(versionRange(['26.3', '1.21.1', '1.21.10'])).toBe('1.21.1–26.3');
  });
});
