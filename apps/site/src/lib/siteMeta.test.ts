import { describe, expect, it } from 'vitest';
import { isSitemapPage, PLACEHOLDER_REPO, resolveRepo, robotsTxt } from './siteMeta';

describe('resolveRepo', () => {
  it('accepts owner/name', () => {
    expect(resolveRepo('someone/ModLangForge')).toBe('someone/ModLangForge');
    expect(resolveRepo(' a-b.c/d_e ')).toBe('a-b.c/d_e');
  });

  it('falls back to the placeholder when missing or malformed', () => {
    expect(resolveRepo(undefined)).toBe(PLACEHOLDER_REPO);
    expect(resolveRepo('')).toBe(PLACEHOLDER_REPO);
    expect(resolveRepo('no-slash')).toBe(PLACEHOLDER_REPO);
    expect(resolveRepo('a/b/c')).toBe(PLACEHOLDER_REPO);
    expect(resolveRepo('https://github.com/a/b')).toBe(PLACEHOLDER_REPO);
  });
});

describe('robotsTxt', () => {
  it('points the sitemap at the configured site', () => {
    expect(robotsTxt(new URL('https://example.org/'))).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://example.org/sitemap-index.xml\n',
    );
  });
});

describe('isSitemapPage', () => {
  it('excludes noindex pages', () => {
    expect(isSitemapPage('https://example.org/pack/')).toBe(false);
    expect(isSitemapPage('https://example.org/pack')).toBe(false);
    expect(isSitemapPage('https://example.org/404/')).toBe(false);
    expect(isSitemapPage('https://example.org/mods/create/')).toBe(true);
    expect(isSitemapPage('https://example.org/')).toBe(true);
  });
});
