import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_BUILDS, parseMaxBuilds } from './index';

describe('parseMaxBuilds', () => {
  it('defaults when omitted or empty', () => {
    expect(DEFAULT_MAX_BUILDS).toBe(100);
    expect(parseMaxBuilds(undefined)).toBe(DEFAULT_MAX_BUILDS);
    expect(parseMaxBuilds('')).toBe(DEFAULT_MAX_BUILDS);
  });

  it('accepts positive integers', () => {
    expect(parseMaxBuilds('5')).toBe(5);
  });

  it.each(['0', '-3', 'abc', '2.5', '10; rm -rf /', '1e3'])('rejects %s', (raw) => {
    expect(() => parseMaxBuilds(raw)).toThrow('--max-builds');
  });
});
