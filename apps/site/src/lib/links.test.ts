// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AVATAR_ORIGIN, avatarUrl, contributorsUrl, contributorUrl } from './config';

describe('community links', () => {
  it('builds avatar, contributor and filtered list URLs', () => {
    expect(avatarUrl('8667ba71b85a4004af54457a9734eed7', 48)).toBe('https://mc-heads.net/avatar/8667ba71b85a4004af54457a9734eed7/48');
    expect(contributorUrl(12)).toBe('/contributors/12/');
    expect(contributorsUrl()).toBe('/contributors/');
    expect(contributorsUrl('create')).toBe('/contributors/?mod=create');
  });

  it('allows the avatar origin in the CSP img-src', () => {
    const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
    expect(headers).toMatch(new RegExp(`img-src [^;]*${AVATAR_ORIGIN.replace(/[.]/g, '\\.')}`));
  });
});
