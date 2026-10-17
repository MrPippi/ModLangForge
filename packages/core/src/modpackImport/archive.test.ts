import { describe, expect, it } from 'vitest';
import { makeJar } from '../test/makeJar';
import { modrinthProjectIdFromUrl, parseCurseManifest, parseMrpackIndex, readCurseZip, readMrpack } from './index';

const INDEX = {
  formatVersion: 1, game: 'minecraft', versionId: '1.0.0', name: 'Example',
  files: [
    { path: 'mods/create.jar', downloads: ['https://cdn.modrinth.com/data/LNytGWDc/versions/abc/create.jar'] },
    { path: 'mods/create-dup.jar', downloads: ['https://cdn.modrinth.com/data/LNytGWDc/versions/def/create.jar'] },
    { path: 'mods/private.jar', downloads: ['https://example.com/private.jar'] },
    { path: 'resourcepacks/x.zip', downloads: ['https://cdn.modrinth.com/data/RPRPRPRP/versions/x/x.zip'] },
  ],
  dependencies: { minecraft: '1.20.1', forge: '47.2.0' },
};

const MANIFEST = {
  manifestType: 'minecraftModpack', manifestVersion: 1, name: 'Example', version: '1.4.0', author: 'someone', overrides: 'overrides',
  minecraft: { version: '1.20.1', modLoaders: [{ id: 'fabric-0.15.0', primary: false }, { id: 'forge-47.2.0', primary: true }] },
  files: [{ projectID: 238222, fileID: 1, required: true }, { projectID: 238222, fileID: 2, required: true }, { projectID: 32274, fileID: 3, required: true }],
};

describe('modrinthProjectIdFromUrl', () => {
  it('reads the project id from Modrinth CDN urls only', () => {
    expect(modrinthProjectIdFromUrl('https://cdn.modrinth.com/data/LNytGWDc/versions/abc/create.jar')).toBe('LNytGWDc');
    expect(modrinthProjectIdFromUrl('https://github.com/x/releases/create.jar')).toBeNull();
    expect(modrinthProjectIdFromUrl('https://cdn.modrinth.com/user/LNytGWDc/x.jar')).toBeNull();
  });
});

describe('parseMrpackIndex', () => {
  it('reads the Minecraft version, loader and unique mod project ids', () => {
    expect(parseMrpackIndex(INDEX)).toEqual({ mcVersion: '1.20.1', loader: 'forge', projectIds: ['LNytGWDc'], unknownFiles: ['mods/private.jar'] });
  });

  it.each([
    [{ 'fabric-loader': '0.15.0' }, 'fabric'],
    [{ 'quilt-loader': '0.20.0' }, 'quilt'],
    [{ neoforge: '21.1.1' }, 'neoforge'],
  ])('maps loader %j to %s', (loader, expected) => {
    expect(parseMrpackIndex({ ...INDEX, dependencies: { minecraft: '1.21.1', ...loader } }).loader).toBe(expected);
  });

  it('rejects unknown versions, missing loaders and malformed files', () => {
    expect(() => parseMrpackIndex({ ...INDEX, dependencies: { minecraft: '1.99', forge: '1' } })).toThrow('不支援的 Minecraft 版本：1.99');
    expect(() => parseMrpackIndex({ ...INDEX, dependencies: { minecraft: '1.20.1' } })).toThrow('沒有支援的模組載入器');
    expect(() => parseMrpackIndex({ ...INDEX, dependencies: { forge: '1' } })).toThrow('缺少 dependencies.minecraft');
    expect(() => parseMrpackIndex({ ...INDEX, formatVersion: 2 })).toThrow(/^modrinth\.index\.json 格式不符：/);
  });
});

describe('parseCurseManifest', () => {
  it('reads the primary loader, version and unique project ids', () => {
    expect(parseCurseManifest(MANIFEST)).toEqual({ mcVersion: '1.20.1', loader: 'forge', projectIds: ['238222', '32274'], version: '1.4.0' });
  });

  it('falls back to the first loader and omits a missing version', () => {
    const { version: _v, ...rest } = MANIFEST;
    const manifest = { ...rest, minecraft: { version: '1.20.1', modLoaders: [{ id: 'neoforge-47.1.0' }] } };
    expect(parseCurseManifest(manifest)).toEqual({ mcVersion: '1.20.1', loader: 'neoforge', projectIds: ['238222', '32274'] });
  });

  it('rejects unsupported loaders and versions', () => {
    expect(() => parseCurseManifest({ ...MANIFEST, minecraft: { version: '1.20.1', modLoaders: [{ id: 'rift-1.0' }] } })).toThrow('沒有支援的模組載入器');
    expect(() => parseCurseManifest({ ...MANIFEST, minecraft: { version: '1.7.10', modLoaders: [{ id: 'forge-10' }] } })).toThrow('不支援的 Minecraft 版本：1.7.10');
    expect(() => parseCurseManifest({ ...MANIFEST, manifestType: 'other' })).toThrow(/^manifest\.json 格式不符：/);
  });
});

describe('readMrpack / readCurseZip', () => {
  it('extracts KubeJS English per valid namespace, skipping invalid, empty and non-English files', async () => {
    const bytes = await makeJar({
      'modrinth.index.json': JSON.stringify(INDEX),
      'overrides/kubejs/assets/kubejs/lang/en_us.json': '﻿' + JSON.stringify({ 'item.kubejs.gear': 'Gear', n: 5 }),
      'overrides/kubejs/assets/kubejs/lang/zh_tw.json': JSON.stringify({ x: 'y' }),
      'overrides/kubejs/assets/Bad/lang/en_us.json': JSON.stringify({ a: 'A' }),
      'overrides/kubejs/assets/empty/lang/en_us.json': '{}',
      'overrides/kubejs/assets/other/lang/en_us.json': JSON.stringify({ o: 'O' }),
      'client-overrides/kubejs/assets/client/lang/en_us.json': JSON.stringify({ c: 'C' }),
      'overrides/config/kubejs/assets/cfg/lang/en_us.json': JSON.stringify({ c: 'C' }),
    });
    const { index, kubejs } = await readMrpack(bytes, 'pack.mrpack');
    expect(index.projectIds).toEqual(['LNytGWDc']);
    expect(kubejs).toEqual({ kubejs: { 'item.kubejs.gear': 'Gear' }, other: { o: 'O' } });
  });

  it('reads a CurseForge zip', async () => {
    const bytes = await makeJar({
      'manifest.json': JSON.stringify(MANIFEST),
      'overrides/kubejs/assets/kubejs/lang/en_us.json': JSON.stringify({ a: 'A' }),
    });
    const { manifest, kubejs } = await readCurseZip(bytes, 'pack.zip');
    expect(manifest.projectIds).toEqual(['238222', '32274']);
    expect(kubejs).toEqual({ kubejs: { a: 'A' } });
  });

  it('reports missing index files, broken zips, broken JSON and broken lang files', async () => {
    await expect(readMrpack(await makeJar({ 'manifest.json': '{}' }), 'p.mrpack')).rejects.toThrow('p.mrpack 裡沒有 modrinth.index.json');
    await expect(readCurseZip(new Uint8Array([1, 2, 3]), 'x.zip')).rejects.toThrow('x.zip 不是有效的壓縮檔');
    await expect(readMrpack(await makeJar({ 'modrinth.index.json': '{' }), 'p.mrpack')).rejects.toThrow('modrinth.index.json JSON 解析失敗');
    await expect(readMrpack(await makeJar({
      'modrinth.index.json': JSON.stringify(INDEX),
      'overrides/kubejs/assets/kubejs/lang/en_us.json': '{',
    }), 'p.mrpack')).rejects.toThrow('overrides/kubejs/assets/kubejs/lang/en_us.json 讀取失敗');
  });
});

describe('decompressed size budget', () => {
  const BIG = JSON.stringify({ k: 'x'.repeat(200) });

  it('readMrpack rejects when the shared budget is exceeded', async () => {
    const bytes = await makeJar({
      'modrinth.index.json': JSON.stringify(INDEX),
      'overrides/kubejs/assets/kubejs/lang/en_us.json': BIG,
    });
    await expect(readMrpack(bytes, 'p.mrpack', { maxUncompressedBytes: 100 })).rejects.toThrow('p.mrpack 解壓後內容超過 0 MB 上限');
  });

  it('readCurseZip rejects when the shared budget is exceeded', async () => {
    const bytes = await makeJar({
      'manifest.json': JSON.stringify(MANIFEST),
      'overrides/kubejs/assets/kubejs/lang/en_us.json': BIG,
    });
    await expect(readCurseZip(bytes, 'p.zip', { maxUncompressedBytes: 100 })).rejects.toThrow('p.zip 解壓後內容超過 0 MB 上限');
  });

  it('counts every entry against one budget across namespaces', async () => {
    const bytes = await makeJar({
      'modrinth.index.json': JSON.stringify(INDEX),
      'overrides/kubejs/assets/a/lang/en_us.json': BIG,
      'overrides/kubejs/assets/b/lang/en_us.json': BIG,
    });
    const budget = JSON.stringify(INDEX).length + BIG.length + 1;
    await expect(readMrpack(bytes, 'p.mrpack', { maxUncompressedBytes: budget })).rejects.toThrow('解壓後內容超過');
    await expect(readMrpack(bytes, 'p.mrpack')).resolves.toBeDefined();
  });
});
