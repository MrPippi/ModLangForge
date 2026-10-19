import { describe, expect, it, vi } from 'vitest';
import type { ModSummary } from '../lib/summary';
import { CATALOG_INDEX_URL, CatalogIndexError, fetchCatalogIndex } from './catalogIndex';

const summary: ModSummary = {
  modId: 'create', name: 'Create', nameZh: '機械動力', summary: 's', mcVersions: ['1.20.1'], loaders: ['forge'],
  status: 'reviewed', percent: 100, total: 10, updatedAt: '2026-10-15', icon: null, hasGuide: false,
  translated: 10, banner: null, downloads: null, builtinPercent: null,
};

function fakeFetch(body: unknown, status = 200) {
  return vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response);
}

describe('fetchCatalogIndex', () => {
  it('returns validated mods', async () => {
    const f = fakeFetch({ version: 1, generatedAt: 'x', mods: [summary] });
    await expect(fetchCatalogIndex(undefined, f)).resolves.toEqual([summary]);
    expect(f).toHaveBeenCalledWith(CATALOG_INDEX_URL, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('accepts built-in entries and defaults a missing builtinPercent to null', async () => {
    const { builtinPercent: _omit, ...legacy } = summary;
    const builtin = { ...summary, modId: 'litematica', status: 'builtin', builtinPercent: 100, total: 0, translated: 0 };
    const f = fakeFetch({ version: 1, generatedAt: 'x', mods: [builtin, legacy] });
    const mods = await fetchCatalogIndex(undefined, f);
    expect(mods[0]).toMatchObject({ status: 'builtin', builtinPercent: 100 });
    expect(mods[1]!.builtinPercent).toBeNull();
  });

  it('aborts the request when the caller aborts', async () => {
    const f = fakeFetch({ version: 1, generatedAt: 'x', mods: [] });
    const controller = new AbortController();
    await fetchCatalogIndex(controller.signal, f);
    const passed = (f.mock.calls[0] as unknown as [string, RequestInit])[1].signal!;
    expect(passed.aborted).toBe(false);
    controller.abort();
    expect(passed.aborted).toBe(true);
  });

  it('times out a stalled request', async () => {
    const stalled = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason))),
    );
    await expect(fetchCatalogIndex(undefined, stalled as unknown as typeof fetch, 10)).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('rejects non-2xx responses', async () => {
    await expect(fetchCatalogIndex(undefined, fakeFetch({}, 503))).rejects.toThrow(CatalogIndexError);
  });

  it('rejects an unknown API version', async () => {
    const f = fakeFetch({ version: 2, generatedAt: 'x', mods: [summary] });
    await expect(fetchCatalogIndex(undefined, f)).rejects.toThrow(CatalogIndexError);
  });

  it('rejects mods with missing or invalid fields', async () => {
    const { percent: _omit, ...broken } = summary;
    await expect(fetchCatalogIndex(undefined, fakeFetch({ version: 1, generatedAt: 'x', mods: [broken] }))).rejects.toThrow(CatalogIndexError);
    await expect(
      fetchCatalogIndex(undefined, fakeFetch({ version: 1, generatedAt: 'x', mods: [{ ...summary, status: 'done' }] })),
    ).rejects.toThrow(CatalogIndexError);
  });

  it('accepts only same-site icon paths and defaults a missing icon to null', async () => {
    const { icon: _omit, ...noIcon } = summary;
    await expect(fetchCatalogIndex(undefined, fakeFetch({ version: 1, generatedAt: 'x', mods: [noIcon] }))).resolves.toEqual([summary]);
    const withIcon = { ...summary, icon: '/mod-icons/create.webp' };
    await expect(fetchCatalogIndex(undefined, fakeFetch({ version: 1, generatedAt: 'x', mods: [withIcon] }))).resolves.toEqual([withIcon]);
    await expect(
      fetchCatalogIndex(undefined, fakeFetch({ version: 1, generatedAt: 'x', mods: [{ ...summary, icon: 'https://evil.example/x.webp' }] })),
    ).rejects.toThrow(CatalogIndexError);
  });

  it('defaults banner, downloads and translated for an older index', async () => {
    const { banner: _b, downloads: _d, translated: _t, ...old } = summary;
    const mods = await fetchCatalogIndex(undefined, fakeFetch({ version: 1, generatedAt: 'x', mods: [old] }));
    expect(mods[0]).toMatchObject({ banner: null, downloads: null, translated: 0 });
  });

  it('rejects a banner outside this site', async () => {
    const ok = { ...summary, banner: '/mod-banners/create.webp', downloads: { count: 5, platform: 'curseforge' as const } };
    await expect(fetchCatalogIndex(undefined, fakeFetch({ version: 1, generatedAt: 'x', mods: [ok] }))).resolves.toEqual([ok]);
    await expect(
      fetchCatalogIndex(undefined, fakeFetch({ version: 1, generatedAt: 'x', mods: [{ ...summary, banner: 'https://evil.example/x.webp' }] })),
    ).rejects.toThrow(CatalogIndexError);
  });

  it('rejects downloads with an unknown platform or a bare number', async () => {
    for (const downloads of [{ count: 5, platform: 'github' }, 5]) {
      await expect(fetchCatalogIndex(undefined, fakeFetch({ version: 1, generatedAt: 'x', mods: [{ ...summary, downloads }] }))).rejects.toThrow(CatalogIndexError);
    }
  });

  it('defaults a missing hasGuide to false and rejects non-boolean values', async () => {
    const { hasGuide: _omit, ...old } = summary;
    await expect(fetchCatalogIndex(undefined, fakeFetch({ version: 1, generatedAt: 'x', mods: [old] }))).resolves.toEqual([summary]);
    const withGuide = { ...summary, hasGuide: true };
    await expect(fetchCatalogIndex(undefined, fakeFetch({ version: 1, generatedAt: 'x', mods: [withGuide] }))).resolves.toEqual([withGuide]);
    await expect(
      fetchCatalogIndex(undefined, fakeFetch({ version: 1, generatedAt: 'x', mods: [{ ...summary, hasGuide: 'yes' }] })),
    ).rejects.toThrow(CatalogIndexError);
  });
});
