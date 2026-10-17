import { makeJar } from './makeJar';

export const MR_API = 'https://api.modrinth.com/v2';
export const MR_PACK_URL = 'https://cdn.modrinth.com/data/AbCd1234/versions/v140/example-1.4.0.mrpack';
export const MR_OLD_PACK_URL = 'https://cdn.modrinth.com/data/AbCd1234/versions/v130/example-1.3.0.mrpack';

export const MR_INDEX = {
  formatVersion: 1, game: 'minecraft', versionId: '1.4.0', name: 'Example Pack',
  files: [
    { path: 'mods/create.jar', downloads: ['https://cdn.modrinth.com/data/LNytGWDc/versions/abc/create.jar'] },
    { path: 'mods/jei.jar', downloads: ['https://cdn.modrinth.com/data/u6dRKJwZ/versions/def/jei.jar'] },
    { path: 'mods/private.jar', downloads: ['https://example.com/private.jar'] },
    { path: 'resourcepacks/pack.zip', downloads: ['https://cdn.modrinth.com/data/RPRPRPRP/versions/x/pack.zip'] },
  ],
  dependencies: { minecraft: '1.20.1', forge: '47.2.0' },
};

export const KUBEJS_EN = { 'item.kubejs.gear': 'Gear', 'item.kubejs.casing': 'Casing %s' };

export function mrpackBytes(): Promise<Uint8Array> {
  return makeJar({
    'modrinth.index.json': JSON.stringify(MR_INDEX),
    'overrides/kubejs/assets/kubejs/lang/en_us.json': JSON.stringify(KUBEJS_EN),
  });
}

/** Modrinth API 與 CDN 的假回應 */
export async function modrinthRoutes(): Promise<Record<string, unknown>> {
  const bytes = await mrpackBytes();
  return {
    [`${MR_API}/project/example-pack`]: { id: 'AbCd1234', slug: 'example-pack', title: 'Example Pack', project_type: 'modpack' },
    [`${MR_API}/project/AbCd1234/members`]: [{ user: { username: 'someone' } }, { user: { username: 'someone' } }],
    [`${MR_API}/project/AbCd1234/version`]: [
      { version_number: '1.3.0', date_published: '2026-01-01T00:00:00Z', files: [{ url: MR_OLD_PACK_URL, filename: 'example-1.3.0.mrpack', primary: true }] },
      {
        version_number: '1.4.0', date_published: '2026-02-01T00:00:00Z',
        files: [
          { url: 'https://cdn.modrinth.com/data/AbCd1234/versions/v140/readme.txt', filename: 'readme.txt', primary: true },
          { url: MR_PACK_URL, filename: 'example-1.4.0.mrpack', primary: false },
        ],
      },
    ],
    [MR_PACK_URL]: bytes,
    [MR_OLD_PACK_URL]: bytes,
    [`${MR_API}/projects?ids=${encodeURIComponent(JSON.stringify(['LNytGWDc', 'u6dRKJwZ']))}`]: [{ id: 'LNytGWDc', slug: 'create' }],
  };
}

export const CF_API = 'https://api.curseforge.com/v1';
/** 測試用假金鑰；真正的金鑰只存在 .env 或環境變數 */
export const CF_FAKE_KEY = 'fake-key-for-tests';
export const CF_DOWNLOAD = 'https://edge.forgecdn.net/files/1/2/example-1.4.0.zip';
export const CF_OLD_DOWNLOAD = 'https://edge.forgecdn.net/files/1/1/example-1.3.0.zip';

export const CF_MANIFEST = {
  manifestType: 'minecraftModpack', manifestVersion: 1, name: 'Example Pack', version: '1.4.0', author: 'someone', overrides: 'overrides',
  minecraft: { version: '1.20.1', modLoaders: [{ id: 'forge-47.2.0', primary: true }] },
  files: [
    { projectID: 238222, fileID: 1, required: true },
    { projectID: 32274, fileID: 2, required: true },
    { projectID: 999, fileID: 3, required: true },
  ],
};

export function curseZipBytes(manifest: unknown = CF_MANIFEST): Promise<Uint8Array> {
  return makeJar({
    'manifest.json': JSON.stringify(manifest),
    'overrides/kubejs/assets/kubejs/lang/en_us.json': JSON.stringify(KUBEJS_EN),
  });
}

const CF_PACK = { id: 555, name: 'Example Pack', slug: 'example-pack', classId: 4471, authors: [{ name: 'someone' }] };

/** CurseForge API 與 CDN 的假回應（POST /mods 依網址回應） */
export async function curseforgeRoutes(): Promise<Record<string, unknown>> {
  const bytes = await curseZipBytes();
  return {
    [`${CF_API}/mods/search?gameId=432&classId=4471&slug=example-pack`]: { data: [CF_PACK] },
    [`${CF_API}/mods/search?gameId=432&classId=4471&slug=nothing`]: { data: [] },
    [`${CF_API}/mods/555`]: { data: CF_PACK },
    [`${CF_API}/mods/555/files?pageSize=50&index=0`]: {
      pagination: { index: 0, pageSize: 50, resultCount: 3, totalCount: 3 },
      data: [
        { id: 1, displayName: 'Example Pack 1.3.0', fileName: 'example-1.3.0.zip', fileDate: '2026-01-01T00:00:00Z', downloadUrl: CF_OLD_DOWNLOAD, isServerPack: false },
        { id: 2, displayName: 'Example Pack 1.4.0', fileName: 'example-1.4.0.zip', fileDate: '2026-02-01T00:00:00Z', downloadUrl: CF_DOWNLOAD, isServerPack: false },
        { id: 3, displayName: 'Example Pack Server 1.5.0', fileName: 'server-1.5.0.zip', fileDate: '2026-03-01T00:00:00Z', downloadUrl: 'https://edge.forgecdn.net/files/1/3/server-1.5.0.zip', isServerPack: true },
      ],
    },
    [CF_DOWNLOAD]: bytes,
    [CF_OLD_DOWNLOAD]: bytes,
    [`${CF_API}/mods`]: { data: [{ id: 238222, slug: 'jei', classId: 6 }, { id: 999, slug: 'faithful', classId: 12 }] },
  };
}
