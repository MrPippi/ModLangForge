import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildModpackPack, fetchIncludedMods, fetchModpackData, modpackPackFileName } from './downloadModpack';
import ModpackDownload from './ModpackDownload';

const modMeta = (modId: string) => ({
  modId, name: modId.toUpperCase(), aliases: [], summary: 's', authors: ['a'], links: { modrinth: `https://modrinth.com/mod/${modId}` },
  mcVersions: ['1.20.1'], loaders: ['forge'], format: 'json', sourceVersions: [{ mcVersion: '1.20.1', loader: 'forge' }],
  translation: { status: 'partial', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null }, contributors: [] }, updatedAt: '2026-10-15',
});
const modBody = (modId: string, extra: Record<string, unknown> = {}) => ({
  version: 1, meta: modMeta(modId), en_us: { a: 'Apple', b: 'Banana' }, zh_tw: { a: '蘋果' }, ...extra,
});

const packMeta = (mcVersion = '1.20.1') => ({
  id: 'example-pack', name: 'Example Pack', summary: 's', authors: ['a'], links: { modrinth: 'https://modrinth.com/modpack/example-pack' },
  source: { platform: 'modrinth', projectId: 'AbCd1234', version: '1.0.0', mcVersion, loader: 'forge' },
  mods: [
    { platform: 'modrinth', projectId: '1', slug: 'create' },
    { platform: 'modrinth', projectId: '2', slug: 'gone' },
    { platform: 'modrinth', projectId: '3', slug: 'missing' },
  ],
  translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null }, contributors: [] },
  updatedAt: '2026-10-17',
});
const packBody = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  meta: packMeta(),
  mods: [
    { platform: 'modrinth', projectId: '1', slug: 'create', modId: 'create' },
    { platform: 'modrinth', projectId: '2', slug: 'gone', modId: 'gone' },
    { platform: 'modrinth', projectId: '3', slug: 'missing', modId: null },
  ],
  kubejs: { kubejs: { en_us: { 'item.kubejs.gear': 'Gear', 'item.kubejs.casing': 'Casing' }, zh_tw: { 'item.kubejs.gear': '齒輪' } } },
  ...overrides,
});

const PACK_URL = '/api/v1/modpacks/example-pack.json';

function fakeFetch(bodies: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const found = Object.hasOwn(bodies, url) ? bodies[url] : undefined;
    return { ok: found !== undefined, status: found === undefined ? 404 : 200, json: async () => found };
  });
}

const routes = (pack: unknown = packBody(), create: unknown = modBody('create')) => ({ [PACK_URL]: pack, '/api/v1/mods/create.json': create });

async function readZip(blob: Blob): Promise<JSZip> {
  return JSZip.loadAsync(await blob.arrayBuffer());
}

async function readJson(zip: JSZip, path: string): Promise<unknown> {
  return JSON.parse((await zip.file(path)?.async('string')) ?? 'null');
}

describe('fetchModpackData', () => {
  it('validates the payload and keeps resolved mods', async () => {
    const pack = await fetchModpackData('example-pack', fakeFetch(routes()));
    expect(pack.mods.map((m) => m.modId)).toEqual(['create', 'gone', null]);
    expect(pack.kubejs).toEqual({ kubejs: { en: { 'item.kubejs.gear': 'Gear', 'item.kubejs.casing': 'Casing' }, zh: { 'item.kubejs.gear': '齒輪' } } });
  });

  it('rejects namespaces that could escape assets/<ns>/lang/', async () => {
    for (const ns of ['../evil', '..', 'KubeJS', 'a b']) {
      const body = packBody({ kubejs: { [ns]: { en_us: { a: 'A' }, zh_tw: {} } } });
      await expect(fetchModpackData('example-pack', fakeFetch(routes(body)))).rejects.toThrow();
    }
  });

  it('throws on HTTP errors', async () => {
    await expect(fetchModpackData('nope', fakeFetch({}))).rejects.toThrow('HTTP 404');
  });
});

describe('fetchIncludedMods', () => {
  it('fetches each included mod once and skips removed mods', async () => {
    const f = fakeFetch(routes());
    const pack = await fetchModpackData('example-pack', f);
    const mods = await fetchIncludedMods(pack, f);
    expect(mods.map((m) => m.meta.modId)).toEqual(['create']);
    expect(f.mock.calls.map(([url]) => url).filter((url) => url.startsWith('/api/v1/mods/'))).toEqual(['/api/v1/mods/create.json', '/api/v1/mods/gone.json']);
  });
});

describe('buildModpackPack', () => {
  it('packs included mods with guides and KubeJS text using the modpack pack_format', async () => {
    const guide = { files: { 'guide/en_us/entries/a.json': JSON.stringify({ name: 'A' }) }, zh_tw: { 'guide/entries/a.json#name': '甲' } };
    const f = fakeFetch(routes(packBody(), modBody('create', { guide })));
    const pack = await fetchModpackData('example-pack', f);
    const result = await buildModpackPack(pack, await fetchIncludedMods(pack, f));
    expect(result.fileName).toBe('example-pack-zh_tw-1.20.1.zip');
    const zip = await readZip(result.blob);
    expect(await readJson(zip, 'pack.mcmeta')).toMatchObject({ pack: { pack_format: 15 } });
    expect(await readJson(zip, 'assets/create/lang/zh_tw.json')).toEqual({ a: '蘋果', b: 'Banana' });
    expect(await readJson(zip, 'assets/kubejs/lang/zh_tw.json')).toEqual({ 'item.kubejs.gear': '齒輪', 'item.kubejs.casing': 'Casing' });
    expect(await readJson(zip, 'assets/create/patchouli_books/guide/zh_tw/entries/a.json')).toEqual({ name: '甲' });
  });

  it('follows the modpack Minecraft version', async () => {
    const f = fakeFetch(routes(packBody({ meta: packMeta('1.21.1') })));
    const pack = await fetchModpackData('example-pack', f);
    const result = await buildModpackPack(pack, []);
    expect(result.fileName).toBe(modpackPackFileName('example-pack', '1.21.1'));
    expect(await readJson(await readZip(result.blob), 'pack.mcmeta')).toMatchObject({ pack: { pack_format: 34 } });
  });

  it('merges KubeJS text into a mod namespace with the same name', async () => {
    const body = packBody({ kubejs: { create: { en_us: { b: 'Big Banana', k: 'Kube' }, zh_tw: { k: '方塊' } } } });
    const f = fakeFetch(routes(body));
    const pack = await fetchModpackData('example-pack', f);
    const zip = await readZip((await buildModpackPack(pack, await fetchIncludedMods(pack, f))).blob);
    expect(await readJson(zip, 'assets/create/lang/zh_tw.json')).toEqual({ a: '蘋果', b: 'Big Banana', k: '方塊' });
  });
});

describe('ModpackDownload', () => {
  it('downloads the modpack resource pack', async () => {
    const onSave = vi.fn();
    render(<ModpackDownload modpackId="example-pack" fetchImpl={fakeFetch(routes())} onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: '下載整合包資源包' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0].fileName).toBe('example-pack-zh_tw-1.20.1.zip');
  });

  it('shows an error with retry when loading fails', async () => {
    render(<ModpackDownload modpackId="example-pack" fetchImpl={fakeFetch({})} onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '下載整合包資源包' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('下載失敗');
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument();
  });
});
