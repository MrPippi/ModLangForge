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
