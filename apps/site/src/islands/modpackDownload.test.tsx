import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { zipFileNames } from '@mlf/core/test/zipFiles';
import { parseSnbt, readQuestLang } from '@mlf/core/ftbquests';
import { buildModpackQuestFile, buildModpackResourcePack, fetchIncludedMods, fetchModpackData, modpackPackFileName } from './downloadModpack';
import ModpackDownload from './ModpackDownload';

const modMeta = (modId: string) => ({
  modId, name: modId.toUpperCase(), aliases: [], summary: 's', authors: ['a'], links: { modrinth: `https://modrinth.com/mod/${modId}` },
  mcVersions: ['1.20.1'], loaders: ['forge'], format: 'json', sourceVersions: [{ mcVersion: '1.20.1', loader: 'forge' }],
  translation: { status: 'partial', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null }, contributors: [] }, updatedAt: '2026-10-15',
});
const modBody = (modId: string, extra: Record<string, unknown> = {}) => ({
  version: 1, meta: modMeta(modId), en_us: { a: 'Apple', b: 'Banana' }, zh_tw: { a: '蘋果' }, ...extra,
});

const packMeta = (mcVersion = '1.20.1', extra: Record<string, unknown> = {}) => ({
  id: 'example-pack', name: 'Example Pack', summary: 's', authors: ['a'], links: { modrinth: 'https://modrinth.com/modpack/example-pack' },
  source: { platform: 'modrinth', projectId: 'AbCd1234', version: '1.0.0', mcVersion, loader: 'forge' },
  mods: [
    { platform: 'modrinth', projectId: '1', slug: 'create' },
    { platform: 'modrinth', projectId: '2', slug: 'gone' },
    { platform: 'modrinth', projectId: '3', slug: 'missing' },
  ],
  translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null }, contributors: [] },
  updatedAt: '2026-10-17',
  ...extra,
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

const TITLE = 'quest.44A5523F7A909209.title';
const DESC = 'quest.44A5523F7A909209.quest_desc';
const QUEST_EN = { [TITLE]: 'Welcome', [DESC]: 'Line one\nLine two' };
const QUEST_ZH = { [DESC]: '第一行\n第二行\n第三行' };

const questBody = (layout: 'single' | 'split' = 'single', zh: Record<string, string> = QUEST_ZH, overrides: Record<string, unknown> = {}) => packBody({
  meta: packMeta('1.21.1', { ftbquests: { status: 'supported', layout } }),
  ftbquests: { status: 'supported', layout, en_us: QUEST_EN, zh_tw: zh },
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

async function download(body: unknown, create: unknown = modBody('create')): Promise<{ fileName: string; zip: JSZip } | null> {
  const f = fakeFetch(routes(body, create));
  const pack = await fetchModpackData('example-pack', f);
  const result = await buildModpackResourcePack(pack, await fetchIncludedMods(pack, f));
  return result && { fileName: result.fileName, zip: await readZip(result.blob) };
}

async function questFile(body: unknown): Promise<{ fileName: string; text: string; texts: Record<string, string> } | null> {
  const result = buildModpackQuestFile(await fetchModpackData('example-pack', fakeFetch(routes(body))));
  if (!result) return null;
  const text = await result.blob.text();
  return { fileName: result.fileName, text, texts: { ...readQuestLang(parseSnbt(text)).texts } };
}

describe('fetchModpackData', () => {
  it('validates the payload and keeps resolved mods', async () => {
    const pack = await fetchModpackData('example-pack', fakeFetch(routes()));
    expect(pack.mods.map((m) => m.modId)).toEqual(['create', 'gone', null]);
    expect(pack.kubejs).toEqual({ kubejs: { en: { 'item.kubejs.gear': 'Gear', 'item.kubejs.casing': 'Casing' }, zh: { 'item.kubejs.gear': '齒輪' } } });
    expect(pack.ftbquests).toBeUndefined();
  });

  it('rejects an own __proto__ namespace or lang key', async () => {
    const lang = JSON.parse('{"__proto__":"x"}') as Record<string, string>;
    for (const kubejs of [JSON.parse('{"__proto__":{"en_us":{},"zh_tw":{}}}'), { kubejs: { en_us: lang, zh_tw: {} } }]) {
      await expect(fetchModpackData('example-pack', fakeFetch(routes(packBody({ kubejs }))))).rejects.toThrow();
    }
  });

  it('rejects namespaces that could escape assets/<ns>/lang/', async () => {
    for (const ns of ['../evil', '..', 'KubeJS', 'a b']) {
      const body = packBody({ kubejs: { [ns]: { en_us: { a: 'A' }, zh_tw: {} } } });
      await expect(fetchModpackData('example-pack', fakeFetch(routes(body)))).rejects.toThrow();
    }
  });

  it('keeps supported quest text and drops the unsupported marker', async () => {
    expect((await fetchModpackData('example-pack', fakeFetch(routes(questBody())))).ftbquests).toEqual({ layout: 'single', en: QUEST_EN, zh: QUEST_ZH });
    const old = packBody({ meta: packMeta('1.20.1', { ftbquests: { status: 'unsupported-version' } }), ftbquests: { status: 'unsupported-version' } });
    expect((await fetchModpackData('example-pack', fakeFetch(routes(old)))).ftbquests).toBeUndefined();
  });

  it('rejects quest payloads with unknown layouts or keys', async () => {
    for (const ftbquests of [
      { status: 'supported', layout: '../config', en_us: {}, zh_tw: {} },
      { status: 'supported', layout: 'single', en_us: { 'task.5555555555555555.title': 'x' }, zh_tw: {} },
      { status: 'supported', layout: 'single', en_us: {}, zh_tw: JSON.parse('{"__proto__":"x"}') as Record<string, string> },
    ]) {
      await expect(fetchModpackData('example-pack', fakeFetch(routes(packBody({ ftbquests }))))).rejects.toThrow();
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

describe('built-in mods in downloads', () => {
  const withBuiltin = () => packBody({
    mods: [
      { platform: 'modrinth', projectId: '1', slug: 'create', modId: 'create' },
      { platform: 'modrinth', projectId: '4', slug: 'litematica', modId: 'litematica', builtin: true },
    ],
  });

  it('never requests built-in mods', async () => {
    const f = fakeFetch(routes(withBuiltin()));
    const pack = await fetchModpackData('example-pack', f);
    await fetchIncludedMods(pack, f);
    expect(f.mock.calls.map(([url]) => url)).not.toContain('/api/v1/mods/litematica.json');
  });

  it('leaves built-in mods out of the resource pack', async () => {
    const out = await download(withBuiltin());
    expect(zipFileNames(out!.zip).some((n) => n.startsWith('assets/litematica/'))).toBe(false);
  });
});

describe('buildModpackResourcePack', () => {
  it('is itself the resource pack: pack.mcmeta at the zip root, no wrapper or guide', async () => {
    const out = await download(packBody());
    expect(out?.fileName).toBe('example-pack-zh_tw-1.20.1.zip');
    expect(zipFileNames(out!.zip)).toEqual(['assets/create/lang/zh_tw.json', 'assets/kubejs/lang/zh_tw.json', 'pack.mcmeta']);
  });

  it('packs included mods with guides and KubeJS text using the modpack pack_format', async () => {
    const guide = { files: { 'guide/en_us/entries/a.json': JSON.stringify({ name: 'A' }) }, zh_tw: { 'guide/entries/a.json#name': '甲' } };
    const { zip } = (await download(packBody(), modBody('create', { guide })))!;
    expect(await readJson(zip, 'pack.mcmeta')).toMatchObject({ pack: { pack_format: 15 } });
    expect(await readJson(zip, 'assets/create/lang/zh_tw.json')).toEqual({ a: '蘋果', b: 'Banana' });
    expect(await readJson(zip, 'assets/kubejs/lang/zh_tw.json')).toEqual({ 'item.kubejs.gear': '齒輪' });
    expect(await readJson(zip, 'assets/create/patchouli_books/guide/zh_tw/entries/a.json')).toEqual({ name: '甲' });
    expect(zipFileNames(zip)).toEqual([
      'assets/create/lang/zh_tw.json', 'assets/create/patchouli_books/guide/zh_tw/entries/a.json', 'assets/kubejs/lang/zh_tw.json', 'pack.mcmeta',
    ]);
  });

  it('follows the modpack Minecraft version', async () => {
    const pack = await fetchModpackData('example-pack', fakeFetch(routes(packBody({ meta: packMeta('1.21.1') }))));
    const result = await buildModpackResourcePack(pack, []);
    expect(result?.fileName).toBe(modpackPackFileName('example-pack', '1.21.1'));
    expect(await readJson(await readZip(result!.blob), 'pack.mcmeta')).toMatchObject({ pack: { pack_format: 34 } });
  });

  it('writes min_format and max_format for a 26.3 modpack', async () => {
    const pack = await fetchModpackData('example-pack', fakeFetch(routes(packBody({ meta: packMeta('26.3') }))));
    const result = await buildModpackResourcePack(pack, []);
    expect(result?.fileName).toBe(modpackPackFileName('example-pack', '26.3'));
    expect(await readJson(await readZip(result!.blob), 'pack.mcmeta')).toEqual({
      pack: { description: expect.stringContaining('Example Pack'), min_format: [97, 1], max_format: [97, 1] },
    });
  });

  it('merges KubeJS text into a mod namespace with the same name', async () => {
    const body = packBody({ kubejs: { create: { en_us: { b: 'Big Banana', k: 'Kube' }, zh_tw: { k: '方塊' } } } });
    const { zip } = (await download(body, modBody('create', { zh_tw: { a: '蘋果', b: '香蕉' } })))!;
    expect(await readJson(zip, 'assets/create/lang/zh_tw.json')).toEqual({ a: '蘋果', b: '香蕉', k: '方塊' });
  });

  it('leaves out untranslated KubeJS lines so they never replace existing Chinese', async () => {
    const { zip } = (await download(packBody(), modBody('create', { zh_tw: { a: '蘋果', b: '乙' } })))!;
    expect(await readJson(zip, 'assets/kubejs/lang/zh_tw.json')).toEqual({ 'item.kubejs.gear': '齒輪' });
    const body = packBody({ kubejs: { kubejs: { en_us: { x: 'X' }, zh_tw: {} } } });
    const only = await fetchModpackData('example-pack', fakeFetch(routes(body)));
    expect(await readJson(await readZip((await buildModpackResourcePack(only, []))!.blob), 'assets/kubejs/lang/zh_tw.json')).toEqual({});
  });

  it('has no resource pack for a modpack that only has quest text', async () => {
    expect(await download(questBody('single', QUEST_ZH, { mods: [], kubejs: {} }))).toBeNull();
  });

  it('does not put quest text in the resource pack', async () => {
    expect(zipFileNames((await download(questBody()))!.zip)).toEqual(['assets/create/lang/zh_tw.json', 'assets/kubejs/lang/zh_tw.json', 'pack.mcmeta']);
  });
});

describe('buildModpackQuestFile', () => {
  it('writes only translated lines as string lists to zh_tw.snbt for the single layout', async () => {
    const out = await questFile(questBody());
    expect(out?.fileName).toBe('zh_tw.snbt');
    expect(out?.texts).toEqual(QUEST_ZH);
    expect(out?.text).toContain(`"${DESC}": [\n\t\t"第一行",\n\t\t"第二行",\n\t\t"第三行"\n\t]`);
  });

  it('is named modlangforge.snbt for the split layout', async () => {
    expect((await questFile(questBody('split')))?.fileName).toBe('modlangforge.snbt');
  });

  it('is null when no quest line is translated or quests are unsupported', async () => {
    expect(await questFile(questBody('single', {}))).toBeNull();
    expect(await questFile(packBody())).toBeNull();
  });
});

describe('ModpackDownload', () => {
  it('downloads the resource pack with the primary button and shows no quest button without quests', async () => {
    const onSave = vi.fn();
    render(<ModpackDownload modpackId="example-pack" hasPack fetchImpl={fakeFetch(routes())} onSave={onSave} />);
    expect(screen.queryByRole('button', { name: '下載 FTB 任務翻譯' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '下載資源包' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0].fileName).toBe('example-pack-zh_tw-1.20.1.zip');
  });

  it('downloads the quest file with its own button and shows where to put it', async () => {
    const onSave = vi.fn();
    render(<ModpackDownload modpackId="example-pack" hasPack questLayout="split" fetchImpl={fakeFetch(routes(questBody('split')))} onSave={onSave} />);
    expect(screen.getByText(/config\/ftbquests\/quests\/lang\/zh_tw\//)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '下載 FTB 任務翻譯' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0].fileName).toBe('modlangforge.snbt');
  });

  it('hides the resource pack button for a quest-only modpack', () => {
    render(<ModpackDownload modpackId="example-pack" hasPack={false} questLayout="single" fetchImpl={fakeFetch({})} onSave={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '下載資源包' })).toBeNull();
    expect(screen.getByRole('button', { name: '下載 FTB 任務翻譯' })).toBeInTheDocument();
  });

  it('shows an error with retry when loading fails', async () => {
    render(<ModpackDownload modpackId="example-pack" hasPack fetchImpl={fakeFetch({})} onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '下載資源包' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('下載失敗');
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument();
  });
});
