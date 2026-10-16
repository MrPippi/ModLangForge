import { describe, expect, it } from 'vitest';
import { isSitemapPage, DEFAULT_REPO, resolveRepo, robotsTxt, turnstileConfigError } from './siteMeta';

describe('resolveRepo', () => {
  it('accepts owner/name', () => {
    expect(resolveRepo('someone/ModLangForge')).toBe('someone/ModLangForge');
    expect(resolveRepo(' a-b.c/d_e ')).toBe('a-b.c/d_e');
  });

  it('falls back to the default repo when missing or malformed', () => {
    expect(resolveRepo(undefined)).toBe(DEFAULT_REPO);
    expect(resolveRepo('')).toBe(DEFAULT_REPO);
    expect(resolveRepo('no-slash')).toBe(DEFAULT_REPO);
    expect(resolveRepo('a/b/c')).toBe(DEFAULT_REPO);
    expect(resolveRepo('https://github.com/a/b')).toBe(DEFAULT_REPO);
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
    expect(isSitemapPage('https://example.org/admin/')).toBe(false);
    expect(isSitemapPage('https://example.org/pack')).toBe(false);
    expect(isSitemapPage('https://example.org/404/')).toBe(false);
    expect(isSitemapPage('https://example.org/mods/create/')).toBe(true);
    expect(isSitemapPage('https://example.org/')).toBe(true);
    expect(isSitemapPage('https://modlangforge.com/me/')).toBe(false);
    expect(isSitemapPage('https://modlangforge.com/contributors/profile/')).toBe(false);
    expect(isSitemapPage('https://modlangforge.com/contributors/')).toBe(true);
  });

  it('includes the contributors list but not the profile shell', () => {
    expect(isSitemapPage('https://modlangforge.com/contributors/')).toBe(true);
    expect(isSitemapPage('https://modlangforge.com/contributors')).toBe(true);
    expect(isSitemapPage('https://modlangforge.com/contributors/profile/')).toBe(false);
  });
});

describe('turnstileConfigError', () => {
  it('errors for a real site without a Turnstile key (so a stray Pages build fails instead of shipping)', () => {
    expect(turnstileConfigError({ SITE_URL: 'https://modlangforge.com' })).toMatch(/PUBLIC_TURNSTILE_SITE_KEY/);
    expect(turnstileConfigError({ SITE_URL: 'https://modlangforge.com', PUBLIC_TURNSTILE_SITE_KEY: '' })).toMatch(/PUBLIC_TURNSTILE_SITE_KEY/);
  });

  it('allows a configured key, no SITE_URL, or localhost', () => {
    expect(turnstileConfigError({ SITE_URL: 'https://modlangforge.com', PUBLIC_TURNSTILE_SITE_KEY: '0x4AAA' })).toBeNull();
    expect(turnstileConfigError({})).toBeNull();
    expect(turnstileConfigError({ SITE_URL: 'http://localhost:8787' })).toBeNull();
    expect(turnstileConfigError({ SITE_URL: 'http://127.0.0.1:4321' })).toBeNull();
  });
});
