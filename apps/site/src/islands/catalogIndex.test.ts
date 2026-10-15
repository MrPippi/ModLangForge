import { describe, expect, it, vi } from 'vitest';
import type { ModSummary } from '../lib/summary';
import { CATALOG_INDEX_URL, CatalogIndexError, fetchCatalogIndex } from './catalogIndex';

const summary: ModSummary = {
  modId: 'create', name: 'Create', nameZh: '機械動力', summary: 's', mcVersions: ['1.20.1'], loaders: ['forge'],
  status: 'reviewed', percent: 100, total: 10, updatedAt: '2026-10-15',
};

function fakeFetch(body: unknown, status = 200) {
  return vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response);
}

describe('fetchCatalogIndex', () => {
  it('returns validated mods', async () => {
    const f = fakeFetch({ version: 1, generatedAt: 'x', mods: [summary] });
    await expect(fetchCatalogIndex(undefined, f)).resolves.toEqual([summary]);
    expect(f).toHaveBeenCalledWith(CATALOG_INDEX_URL, expect.objectContaining({ signal: undefined }));
  });

  it('passes the abort signal through', async () => {
    const f = fakeFetch({ version: 1, generatedAt: 'x', mods: [] });
    const controller = new AbortController();
    await fetchCatalogIndex(controller.signal, f);
    expect(f).toHaveBeenCalledWith(CATALOG_INDEX_URL, { signal: controller.signal });
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
});
