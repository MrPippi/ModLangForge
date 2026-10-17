import { describe, expect, it } from 'vitest';
import { fakeFetch } from '../test/fakeFetch';
import { KUBEJS_EN, MR_API, MR_INDEX_121, MR_OLD_PACK_URL, modrinthRoutes, mrpackBytes, QUEST_EN, QUEST_LANG_SNBT } from '../test/modpackFixtures';
import { importFromModrinth, latestModrinthPackVersion, listModrinthPackVersions, USER_AGENT } from './index';

describe('importFromModrinth', () => {
  it('imports the latest version with its mods, KubeJS English and notes', async () => {
    const result = await importFromModrinth(fakeFetch(await modrinthRoutes()), { ref: 'example-pack' });
    expect(result).toEqual({
      platform: 'modrinth', projectId: 'AbCd1234', slug: 'example-pack', name: 'Example Pack', authors: ['someone'],
      version: '1.4.0', mcVersion: '1.20.1', loader: 'forge',
      mods: [{ platform: 'modrinth', projectId: 'LNytGWDc', slug: 'create' }],
      kubejs: { kubejs: KUBEJS_EN },
      notes: ['略過非 Modrinth 來源的檔案：mods/private.jar', 'Modrinth 查不到專案 u6dRKJwZ，未列入模組清單'],
    });
  });

  it('downloads the requested version', async () => {
    const f = fakeFetch(await modrinthRoutes());
    expect((await importFromModrinth(f, { ref: 'example-pack', version: '1.3.0' })).version).toBe('1.3.0');
    expect(f.calls.map((c) => c.url)).toContain(MR_OLD_PACK_URL);
    await expect(importFromModrinth(f, { ref: 'example-pack', version: '9.9' })).rejects.toThrow('Modrinth 上找不到版本 9.9');
  });

  it('rejects projects that are not modpacks and versions without a .mrpack', async () => {
    const routes = await modrinthRoutes();
    const notPack = { ...routes, [`${MR_API}/project/example-pack`]: { id: 'AbCd1234', slug: 'example-pack', title: 'X', project_type: 'mod' } };
    await expect(importFromModrinth(fakeFetch(notPack), { ref: 'example-pack' })).rejects.toThrow('example-pack 不是整合包（類型：mod）');
    const noFile = {
      ...routes,
      [`${MR_API}/project/AbCd1234/version`]: [
        { version_number: '2.0.0', date_published: '2026-03-01T00:00:00Z', files: [{ url: 'https://cdn.modrinth.com/x/readme.txt', filename: 'readme.txt', primary: true }] },
      ],
    };
    await expect(importFromModrinth(fakeFetch(noFile), { ref: 'example-pack' })).rejects.toThrow('2.0.0 沒有 .mrpack 檔案');
  });

  it('encodes the reference, sends the User-Agent and reports HTTP and payload errors', async () => {
    const f = fakeFetch(await modrinthRoutes());
    await expect(importFromModrinth(f, { ref: 'Example Pack' })).rejects.toThrow(`HTTP 404 ${MR_API}/project/Example%20Pack`);
    expect(f.calls[0]?.init?.headers?.['User-Agent']).toBe(USER_AGENT);
    const broken = { ...(await modrinthRoutes()), [`${MR_API}/project/AbCd1234/members`]: {} };
    await expect(importFromModrinth(fakeFetch(broken), { ref: 'example-pack' })).rejects.toThrow(/^Modrinth 成員 格式不符：/);
  });

  it('carries FTB quest text from a 1.21 pack', async () => {
    const bytes = await mrpackBytes({ 'overrides/config/ftbquests/quests/lang/en_us.snbt': QUEST_LANG_SNBT }, MR_INDEX_121);
    const result = await importFromModrinth(fakeFetch(await modrinthRoutes(bytes)), { ref: 'example-pack' });
    expect(result).toMatchObject({ mcVersion: '1.21.1', loader: 'neoforge', ftbquests: { status: 'supported', layout: 'single', en: QUEST_EN } });
  });

  it('marks quest files of packs below 1.21 as unsupported and says so', async () => {
    const bytes = await mrpackBytes({ 'overrides/config/ftbquests/quests/chapters/a.snbt': '{}' });
    const result = await importFromModrinth(fakeFetch(await modrinthRoutes(bytes)), { ref: 'example-pack' });
    expect(result.ftbquests).toEqual({ status: 'unsupported-version' });
    expect(result.notes.at(-1)).toBe('整合包為 Minecraft 1.20.1（低於 1.21），FTB 任務文字暫不支援翻譯，已略過');
  });
});

describe('listModrinthPackVersions / latestModrinthPackVersion', () => {
  it('picks the newest date_published like add:modpack', async () => {
    const versions = await listModrinthPackVersions(fakeFetch(await modrinthRoutes()), 'AbCd1234');
    expect(versions.map((v) => v.version_number)).toEqual(['1.3.0', '1.4.0']);
    expect(latestModrinthPackVersion(versions)?.version_number).toBe('1.4.0');
    // 非變動：輸入陣列在呼叫後順序不變
    expect(versions.map((v) => v.version_number)).toEqual(['1.3.0', '1.4.0']);
    expect(latestModrinthPackVersion([])).toBeUndefined();
  });

  it('encodes the project id and validates the payload', async () => {
    const f = fakeFetch({ [`${MR_API}/project/a%2Fb/version`]: [{ version_number: '' }] });
    await expect(listModrinthPackVersions(f, 'a/b')).rejects.toThrow('Modrinth 版本 格式不符');
  });
});
