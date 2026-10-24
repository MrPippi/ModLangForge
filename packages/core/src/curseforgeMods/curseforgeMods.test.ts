import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MAX_JAR_BYTES } from '../jar/errors';
import { CURSEFORGE_API, type CurseforgeFile } from '../modpackImport/curseforge';
import type { FetchLike, FetchResponse } from '../modpackImport/http';
import type { PlatformBuild } from '../pipeline/build';
import { fakeFetch } from '../test/fakeFetch';
import {
  CURSEFORGE_JAR_HOSTS, CurseforgeDownloadBlocked, curseforgeRankingPage, downloadCurseforgeJar, findCurseforgeProject,
  fromCurseforgeFile, listCurseforgeBuilds,
} from './index';

const KEY = 'test-key-not-real';
const JAR_URL = 'https://edge.forgecdn.net/files/1/2/ae2-19.2.17.jar';

const file = (extra: Partial<CurseforgeFile> = {}): CurseforgeFile => ({
  id: 7, displayName: 'AE2', fileName: 'ae2-19.2.17.jar', fileDate: '2026-01-02T00:00:00Z', downloadUrl: JAR_URL,
  isServerPack: false, gameVersions: ['1.21.1', 'NeoForge', 'Client'], isAvailable: true, fileStatus: 4, hashes: [], ...extra,
});

describe('fromCurseforgeFile', () => {
  it('marks beta and alpha files as prereleases', () => {
    expect(fromCurseforgeFile(file({ releaseType: 2 }))?.prerelease).toBe(true);
    expect(fromCurseforgeFile(file({ releaseType: 3 }))?.prerelease).toBe(true);
    expect(fromCurseforgeFile(file({ releaseType: 1 }))?.prerelease).toBeUndefined();
  });

  it('maps gameVersions', () => {
    expect(fromCurseforgeFile(file())).toMatchObject({
      platform: 'curseforge', id: '7', modVersion: 'ae2-19.2.17', mcVersions: ['1.21.1'], loaders: ['neoforge'],
      publishedAt: '2026-01-02T00:00:00Z', file: { name: 'ae2-19.2.17.jar', url: JAR_URL },
    });
  });

  it('keeps file.url null when downloadUrl is null', () => {
    expect(fromCurseforgeFile(file({ downloadUrl: null }))?.file).toEqual({ name: 'ae2-19.2.17.jar', url: null });
  });

  it('takes the sha1 hash (algo 1)', () => {
    const build = fromCurseforgeFile(file({ hashes: [{ value: 'md5', algo: 2 }, { value: 'abc', algo: 1 }] }));
    expect(build?.file.sha1).toBe('abc');
  });

  it('drops files without supported versions', () => {
    expect(fromCurseforgeFile(file({ gameVersions: ['Client', 'Java 21'] }))).toBeNull();
    expect(fromCurseforgeFile(file({ gameVersions: ['1.21.1', 'Client'] }))).toBeNull();
    expect(fromCurseforgeFile(file({ gameVersions: ['1.2.5', 'Forge'] }))).toBeNull();
  });

  it('drops server packs and non-jar files', () => {
    expect(fromCurseforgeFile(file({ isServerPack: true }))).toBeNull();
    expect(fromCurseforgeFile(file({ fileName: 'ae2.zip' }))).toBeNull();
  });

  it('drops unavailable or unapproved files but accepts missing flags', () => {
    expect(fromCurseforgeFile(file({ isAvailable: false }))).toBeNull();
    expect(fromCurseforgeFile(file({ fileStatus: 3 }))).toBeNull();
    expect(fromCurseforgeFile(file({ isAvailable: null, fileStatus: undefined }))).not.toBeNull();
  });

  it('keeps beta files', () => {
    expect(fromCurseforgeFile(file({ fileName: 'ae2-19.2.17-beta.jar' }))?.modVersion).toBe('ae2-19.2.17-beta');
  });
});

describe('listCurseforgeBuilds', () => {
  it('lists convertible files only', async () => {
    const data = [file(), file({ id: 8, isServerPack: true })];
    const f = fakeFetch({ [`${CURSEFORGE_API}/mods/9/files?pageSize=50&index=0`]: { pagination: { index: 0, totalCount: 2 }, data } });
    expect((await listCurseforgeBuilds(f, KEY, 9)).map((b) => b.id)).toEqual(['7']);
  });
});

const hit = (extra: Record<string, unknown>) => ({
  id: 1, name: 'AE2', slug: 'ae2', classId: 6, authors: [{ name: 'a' }], downloadCount: 5,
  logo: { url: 'https://media.forgecdn.net/l.png', thumbnailUrl: 'https://media.forgecdn.net/t.png' },
  screenshots: [{ url: 'https://media.forgecdn.net/s1.png' }, { url: 'https://media.forgecdn.net/s2.png' }], ...extra,
});

describe('findCurseforgeProject', () => {
  const url = `${CURSEFORGE_API}/mods/search?gameId=432&classId=6&slug=ae2`;

  it('ignores non-mod and partial matches', async () => {
    const f = fakeFetch({ [url]: { data: [hit({ slug: 'ae2-addon' }), hit({ classId: 4471 })] } });
    expect(await findCurseforgeProject(f, KEY, 'ae2')).toBeNull();
  });

  it('returns the exact mod match and sends the key', async () => {
    const f = fakeFetch({ [url]: { data: [hit({ slug: 'ae2-addon' }), hit({})] } });
    expect(await findCurseforgeProject(f, KEY, 'ae2')).toEqual({
      id: 1, name: 'AE2', slug: 'ae2', authors: ['a'], downloadCount: 5, logoUrl: 'https://media.forgecdn.net/l.png',
      screenshotUrls: ['https://media.forgecdn.net/s1.png', 'https://media.forgecdn.net/s2.png'],
    });
    expect(f.calls[0]?.init?.headers?.['x-api-key']).toBe(KEY);
  });

  it('tolerates missing logo, screenshots and downloadCount', async () => {
    const f = fakeFetch({ [url]: { data: [hit({ logo: null, screenshots: null, downloadCount: null })] } });
    expect(await findCurseforgeProject(f, KEY, 'ae2')).toMatchObject({ logoUrl: null, screenshotUrls: [], downloadCount: null });
  });
});

const jarBytes = new Uint8Array([1, 2, 3, 4]);
const sha1Of = (b: Uint8Array) => createHash('sha1').update(b).digest('hex');
const buildOf = (fileInfo: PlatformBuild['file']): PlatformBuild => ({ ...fromCurseforgeFile(file())!, file: fileInfo });

describe('downloadCurseforgeJar', () => {
  it('downloads and verifies the sha1', async () => {
    const f = fakeFetch({ [JAR_URL]: jarBytes });
    expect(await downloadCurseforgeJar(f, buildOf({ name: 'a.jar', url: JAR_URL, sha1: sha1Of(jarBytes) }))).toEqual(jarBytes);
  });

  it('rejects hash mismatch', async () => {
    const f = fakeFetch({ [JAR_URL]: jarBytes });
    await expect(downloadCurseforgeJar(f, buildOf({ name: 'a.jar', url: JAR_URL, sha1: 'deadbeef' }))).rejects.toThrow(/sha1/);
  });

  it('rejects foreign hosts without fetching', async () => {
    const f = fakeFetch({});
    await expect(downloadCurseforgeJar(f, buildOf({ name: 'a.jar', url: 'https://evil.example/x.jar' }))).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
    expect(CURSEFORGE_JAR_HOSTS).toEqual(['https://edge.forgecdn.net/', 'https://mediafilez.forgecdn.net/']);
  });

  it('throws CurseforgeDownloadBlocked for null url', async () => {
    const f = fakeFetch({});
    await expect(downloadCurseforgeJar(f, buildOf({ name: 'a.jar', url: null }))).rejects.toBeInstanceOf(CurseforgeDownloadBlocked);
    await expect(downloadCurseforgeJar(f, buildOf({ name: 'a.jar', url: null }))).rejects.toThrow('作者不允許第三方下載');
  });

  it('does not send the api key and handles redirects itself', async () => {
    const f = fakeFetch({ [JAR_URL]: jarBytes });
    await downloadCurseforgeJar(f, buildOf({ name: 'a.jar', url: JAR_URL }));
    expect(JSON.stringify(f.calls[0]?.init ?? {})).not.toContain('x-api-key');
    expect(f.calls[0]?.init?.redirect).toBe('manual');
  });

  const redirectTo = (location: string): FetchResponse => ({
    ok: false, status: 302, headers: { get: (name) => (name.toLowerCase() === 'location' ? location : null) },
    json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0),
  });
  const withRedirect = (location: string): FetchLike & { urls: string[] } => {
    const target = fakeFetch({ 'https://mediafilez.forgecdn.net/files/1/2/ae2.jar': jarBytes });
    const urls: string[] = [];
    const impl: FetchLike = async (url, init) => {
      urls.push(url);
      return url === JAR_URL ? redirectTo(location) : target(url, init);
    };
    return Object.assign(impl, { urls });
  };

  it('follows a redirect to another whitelisted CDN host', async () => {
    const f = withRedirect('https://mediafilez.forgecdn.net/files/1/2/ae2.jar');
    expect(await downloadCurseforgeJar(f, buildOf({ name: 'a.jar', url: JAR_URL }))).toEqual(jarBytes);
    expect(f.urls).toEqual([JAR_URL, 'https://mediafilez.forgecdn.net/files/1/2/ae2.jar']);
  });

  it('resolves a relative Location against the current url and checks the allowlist', async () => {
    const target = fakeFetch({ 'https://edge.forgecdn.net/files/1/2/other.jar': jarBytes });
    const urls: string[] = [];
    const f: FetchLike = async (url, init) => {
      urls.push(url);
      return url === JAR_URL ? redirectTo('/files/1/2/other.jar') : target(url, init);
    };
    expect(await downloadCurseforgeJar(f, buildOf({ name: 'a.jar', url: JAR_URL }))).toEqual(jarBytes);
    expect(urls).toEqual([JAR_URL, 'https://edge.forgecdn.net/files/1/2/other.jar']);
  });

  it('rejects after more than 3 redirects', async () => {
    const urls: string[] = [];
    const f: FetchLike = async (url) => {
      urls.push(url);
      return redirectTo(`${JAR_URL}?n=${urls.length}`);
    };
    await expect(downloadCurseforgeJar(f, buildOf({ name: 'a.jar', url: JAR_URL }))).rejects.toThrow('轉址次數過多');
    expect(urls).toHaveLength(4);
  });

  it('rejects a jar larger than MAX_JAR_BYTES', async () => {
    const big: FetchResponse = {
      ok: true, status: 200, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(MAX_JAR_BYTES + 1),
    };
    await expect(downloadCurseforgeJar(async () => big, buildOf({ name: 'a.jar', url: JAR_URL }))).rejects.toThrow(/超過/);
  });

  it('rejects a redirect to a host outside the whitelist without requesting it', async () => {
    const f = withRedirect('https://evil.example/ae2.jar');
    await expect(downloadCurseforgeJar(f, buildOf({ name: 'a.jar', url: JAR_URL }))).rejects.toThrow(/不在允許清單/);
    expect(f.urls).toEqual([JAR_URL]);
  });
});

describe('listCurseforgeBuilds truncation', () => {
  it('reports truncation after the page limit while keeping the files fetched', async () => {
    let calls = 0;
    const f: FetchLike = async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({ pagination: { index: 0, totalCount: 1_000_000 }, data: [{ ...file(), id: calls }] }), arrayBuffer: async () => new ArrayBuffer(0) };
    };
    const seen: number[][] = [];
    const builds = await listCurseforgeBuilds(f, KEY, 1, (fetched, total) => seen.push([fetched, total]));
    expect(builds).toHaveLength(100);
    expect(seen).toEqual([[100, 1_000_000]]);
  });

  it('does not report when everything was fetched', async () => {
    const f = fakeFetch({ [`${CURSEFORGE_API}/mods/1/files?pageSize=50&index=0`]: { pagination: { index: 0, totalCount: 1 }, data: [file()] } });
    const onTruncated = (): void => { throw new Error('unexpected'); };
    expect(await listCurseforgeBuilds(f, KEY, 1, onTruncated)).toHaveLength(1);
  });
});

describe('curseforgeRankingPage', () => {
  it('builds the ranking query', async () => {
    const url = `${CURSEFORGE_API}/mods/search?gameId=432&classId=6&sortField=6&sortOrder=desc&pageSize=50&index=50`;
    const f = fakeFetch({ [url]: { data: [hit({})] } });
    expect((await curseforgeRankingPage(f, KEY, 50)).map((p) => p.slug)).toEqual(['ae2']);
    expect(f.calls[0]?.url).toBe(url);
  });
});
