import { describe, expect, it } from 'vitest';
import { fakeFetch } from '../test/fakeFetch';
import {
  CF_API, CF_DOWNLOAD, CF_FAKE_KEY, CF_MANIFEST, CF_MANIFEST_121, CF_OLD_DOWNLOAD, curseforgeRoutes, curseZipBytes, KUBEJS_EN, QUEST_EN, QUEST_LANG_SNBT,
} from '../test/modpackFixtures';
import { apiInit, fileMatches, importFromCurseforge, latestClientFile, listCurseforgeFiles, noDownloadMessage, searchCurseforge, USER_AGENT } from './index';

const args = { ref: 'example-pack', apiKey: CF_FAKE_KEY };

describe('importFromCurseforge', () => {
  it('imports the latest client file by slug with mods, KubeJS English and notes', async () => {
    expect(await importFromCurseforge(fakeFetch(await curseforgeRoutes()), args)).toEqual({
      platform: 'curseforge', projectId: '555', slug: 'example-pack', name: 'Example Pack', authors: ['someone'],
      version: '1.4.0', mcVersion: '1.20.1', loader: 'forge',
      mods: [{ platform: 'curseforge', projectId: '238222', slug: 'jei' }],
      kubejs: { kubejs: KUBEJS_EN },
      notes: ['CurseForge 查不到專案 32274，未列入模組清單', '略過非模組專案 faithful'],
    });
  });

  it('looks up mod slugs with one POST of numeric ids', async () => {
    const f = fakeFetch(await curseforgeRoutes());
    await importFromCurseforge(f, args);
    const post = f.calls.find((c) => c.url === `${CF_API}/mods`);
    expect(post?.init?.method).toBe('POST');
    expect(JSON.parse(post?.init?.body ?? '{}')).toEqual({ modIds: [238222, 32274, 999] });
  });

  it('sends the key only to the CurseForge API', async () => {
    const f = fakeFetch(await curseforgeRoutes());
    await importFromCurseforge(f, args);
    const api = f.calls.filter((c) => c.url.startsWith(`${CF_API}/`));
    expect(api.length).toBeGreaterThan(0);
    for (const call of api) {
      expect(call.init?.headers?.['x-api-key']).toBe(CF_FAKE_KEY);
      expect(call.init?.redirect).toBe('error');
    }
    const others = f.calls.filter((c) => !c.url.startsWith(`${CF_API}/`));
    expect(others.map((c) => c.url)).toEqual([CF_DOWNLOAD]);
    for (const call of others) expect(JSON.stringify(call.init ?? {})).not.toContain(CF_FAKE_KEY);
  });

  it('finds numeric project ids and honours --version by display name, file name or id', async () => {
    const f = fakeFetch(await curseforgeRoutes());
    await importFromCurseforge(f, { ...args, ref: '555', version: 'Example Pack 1.3.0' });
    expect(f.calls.map((c) => c.url)).toEqual(expect.arrayContaining([`${CF_API}/mods/555`, CF_OLD_DOWNLOAD]));
    expect(f.calls.some((c) => c.url.includes('/mods/search'))).toBe(false);
    for (const version of ['example-1.3.0.zip', '1']) {
      const g = fakeFetch(await curseforgeRoutes());
      await importFromCurseforge(g, { ...args, version });
      expect(g.calls.map((c) => c.url)).toContain(CF_OLD_DOWNLOAD);
    }
    await expect(importFromCurseforge(fakeFetch(await curseforgeRoutes()), { ...args, version: '9.9' })).rejects.toThrow('CurseForge 上找不到檔案 9.9');
  });

  it('stops with a clear message when third-party downloads are not allowed', async () => {
    const routes = await curseforgeRoutes();
    const files = { data: [{ id: 2, displayName: 'Example Pack 1.4.0', fileName: 'example-1.4.0.zip', fileDate: '2026-02-01T00:00:00Z', downloadUrl: null, isServerPack: false }] };
    const f = fakeFetch({ ...routes, [`${CF_API}/mods/555/files?pageSize=50&index=0`]: { pagination: { index: 0, pageSize: 50, resultCount: 1, totalCount: 1 }, ...files } });
    await expect(importFromCurseforge(f, args)).rejects.toThrow(noDownloadMessage('Example Pack 1.4.0'));
    expect(noDownloadMessage('x')).toContain('--file <路徑>');
  });

  it('searches every page of the file list for the default and --version', async () => {
    const file = (id: number, date: string, url: string) => ({ id, displayName: `Example Pack ${id}`, fileName: `example-${id}.zip`, fileDate: date, downloadUrl: url, isServerPack: false });
    const page = (index: number, data: unknown[]) => ({ pagination: { index, pageSize: 1, resultCount: data.length, totalCount: 2 }, data });
    const routes = {
      ...(await curseforgeRoutes()),
      [`${CF_API}/mods/555/files?pageSize=50&index=0`]: page(0, [file(1, '2026-01-01T00:00:00Z', CF_OLD_DOWNLOAD)]),
      [`${CF_API}/mods/555/files?pageSize=50&index=1`]: page(1, [file(2, '2026-02-01T00:00:00Z', CF_DOWNLOAD)]),
    };
    const latest = fakeFetch(routes);
    await importFromCurseforge(latest, args);
    expect(latest.calls.map((c) => c.url)).toContain(CF_DOWNLOAD);
    const wanted = fakeFetch(routes);
    await importFromCurseforge(wanted, { ...args, version: '2' });
    expect(wanted.calls.map((c) => c.url)).toContain(CF_DOWNLOAD);
    expect(wanted.calls.filter((c) => c.url.includes('/files?')).length).toBe(2);
  });

  it('rejects a file list without valid pagination', async () => {
    const routes = { ...(await curseforgeRoutes()), [`${CF_API}/mods/555/files?pageSize=50&index=0`]: { data: [] } };
    await expect(importFromCurseforge(fakeFetch(routes), args)).rejects.toThrow();
  });

  it('uses a local file without listing or downloading files', async () => {
    const f = fakeFetch(await curseforgeRoutes());
    const result = await importFromCurseforge(f, { ...args, localFile: { name: 'manual.zip', bytes: await curseZipBytes() } });
    expect(result.version).toBe('1.4.0');
    expect(f.calls.some((c) => c.url.includes('/files') || c.url.startsWith('https://edge.forgecdn.net/'))).toBe(false);
  });

  it('falls back to the display name when the manifest has no version', async () => {
    const { version: _v, ...noVersion } = CF_MANIFEST;
    const routes = { ...(await curseforgeRoutes()), [CF_DOWNLOAD]: await curseZipBytes(noVersion) };
    expect((await importFromCurseforge(fakeFetch(routes), args)).version).toBe('Example Pack 1.4.0');
  });

  it('rejects non-modpacks and unknown slugs', async () => {
    const routes = await curseforgeRoutes();
    const mod = { id: 555, name: 'Example', slug: 'example-pack', classId: 6, authors: [{ name: 'someone' }] };
    const notPack = { ...routes, [`${CF_API}/mods/search?gameId=432&classId=4471&slug=example-pack`]: { data: [mod] } };
    await expect(importFromCurseforge(fakeFetch(notPack), args)).rejects.toThrow('example-pack 不是整合包');
    await expect(importFromCurseforge(fakeFetch(routes), { ...args, ref: 'nothing' })).rejects.toThrow('CurseForge 上找不到整合包 nothing');
  });

  it('carries FTB quest text after the mod notes', async () => {
    const bytes = await curseZipBytes(CF_MANIFEST_121, { 'overrides/config/ftbquests/quests/lang/en_us.snbt': `${QUEST_LANG_SNBT.slice(0, -1)}\ttask.5555555555555555.title: "x"\n}` });
    const result = await importFromCurseforge(fakeFetch(await curseforgeRoutes(bytes)), args);
    expect(result.ftbquests).toEqual({ status: 'supported', layout: 'single', en: QUEST_EN });
    expect(result.notes).toEqual([
      'CurseForge 查不到專案 32274，未列入模組清單', '略過非模組專案 faithful', '略過 1 條不在翻譯範圍或格式不符的任務文字（例如獎勵表、任務項目的標題）',
    ]);
  });
});

describe('searchCurseforge', () => {
  const url = `${CF_API}/mods/search?gameId=432&classId=6&searchFilter=Just%20Enough%20Items&pageSize=20`;
  const jei = { id: 238222, name: 'Just Enough Items (JEI)', slug: 'jei', classId: 6, authors: [{ name: 'mezz' }] };

  it('encodes parameters in the given order and returns validated results', async () => {
    const f = fakeFetch({ [url]: { data: [jei] } });
    expect(await searchCurseforge(f, CF_FAKE_KEY, { gameId: 432, classId: 6, searchFilter: 'Just Enough Items', pageSize: 20 })).toEqual([jei]);
    expect(f.calls.map((c) => c.url)).toEqual([url]);
  });

  it('sends the key with redirect error', async () => {
    const f = fakeFetch({ [url]: { data: [] } });
    await searchCurseforge(f, CF_FAKE_KEY, { gameId: 432, classId: 6, searchFilter: 'Just Enough Items', pageSize: 20 });
    expect(f.calls[0]?.init).toEqual({
      headers: { 'User-Agent': USER_AGENT, 'x-api-key': CF_FAKE_KEY, Accept: 'application/json' },
      redirect: 'error',
    });
    expect(apiInit(CF_FAKE_KEY)).toEqual({ headers: { 'x-api-key': CF_FAKE_KEY, Accept: 'application/json' }, redirect: 'error' });
  });

  it('rejects malformed responses', async () => {
    const f = fakeFetch({ [url]: { data: [{ id: 'x' }] } });
    await expect(searchCurseforge(f, CF_FAKE_KEY, { gameId: 432, classId: 6, searchFilter: 'Just Enough Items', pageSize: 20 }))
      .rejects.toThrow('CurseForge 搜尋結果 格式不符');
  });
});

describe('listCurseforgeFiles / latestClientFile / fileMatches', () => {
  it('picks the newest non-server file like add:modpack, sending the key only with redirect: error', async () => {
    const f = fakeFetch(await curseforgeRoutes());
    const files = await listCurseforgeFiles(f, 555, CF_FAKE_KEY);
    expect(files.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(latestClientFile(files)?.displayName).toBe('Example Pack 1.4.0');
    expect(files.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(latestClientFile(files.filter((x) => x.isServerPack === true))).toBeUndefined();
    expect(f.calls[0]).toMatchObject({ url: `${CF_API}/mods/555/files?pageSize=50&index=0`, init: { redirect: 'error', headers: { 'x-api-key': CF_FAKE_KEY } } });
  });

  it('matches a stored version by display name, file name or id, like --version', async () => {
    const [, file] = await listCurseforgeFiles(fakeFetch(await curseforgeRoutes()), 555, CF_FAKE_KEY);
    for (const v of ['Example Pack 1.4.0', 'example-1.4.0.zip', '2']) expect(fileMatches(file!, v)).toBe(true);
    expect(fileMatches(file!, '1.4.0')).toBe(false);
  });
});
