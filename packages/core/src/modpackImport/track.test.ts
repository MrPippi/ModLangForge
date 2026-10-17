import { describe, expect, it } from 'vitest';
import { catalogModpackSchema, type ModpackPlatform } from '../modpack';
import { fakeFetch } from '../test/fakeFetch';
import {
  CF_API, CF_DOWNLOAD, CF_FAKE_KEY, CF_MANIFEST, curseforgeRoutes, curseZipBytes, MR_API, MR_INDEX_121, modrinthRoutes, mrpackBytes, QUEST_LANG_SNBT,
} from '../test/modpackFixtures';
import {
  type ExistingModpack, type FetchLike, type ModpackFiles, SKIP_EXAMPLE, SKIP_NO_KEY, SKIP_UP_TO_DATE, trackModpacks, type TrackModpacksIO,
} from './index';

const TODAY = '2026-10-17';
const MR_PROJECT = { id: 'AbCd1234', slug: 'tracked-pack', title: 'Tracked Pack', project_type: 'modpack' };
const CF_PROJECT = { data: { id: 555, name: 'Tracked Pack', slug: 'tracked-pack', classId: 4471, authors: [{ name: 'someone' }] } };

/** fixture 的 slug 是 example-pack（會被當成範例略過），改成 tracked-pack；追蹤以專案 ID 查詢 */
async function mrRoutes(bytes?: Uint8Array): Promise<Record<string, unknown>> {
  return { ...(await modrinthRoutes(bytes)), [`${MR_API}/project/AbCd1234`]: MR_PROJECT };
}

async function cfRoutes(bytes?: Uint8Array): Promise<Record<string, unknown>> {
  return { ...(await curseforgeRoutes(bytes)), [`${CF_API}/mods/555`]: CF_PROJECT };
}

function pack(
  id: string, platform: ModpackPlatform, projectId: string, version: string,
  opts: { mods?: number; kubejs?: ExistingModpack['kubejsEn'] } = {},
): ExistingModpack {
  const meta = catalogModpackSchema.parse({
    id, name: 'Tracked Pack', summary: '手寫簡介', authors: ['someone'],
    links: { [platform]: `https://example.com/${id}` },
    source: { platform, projectId, version, mcVersion: '1.20.1', loader: 'forge' },
    mods: Array.from({ length: opts.mods ?? 0 }, (_, i) => ({ platform, projectId: `p${i}`, slug: `m${i}` })),
    translation: { status: 'partial', license: 'CC-BY-SA-4.0', source: { name: '社群', url: null } }, updatedAt: '2026-10-01',
  });
  return { meta, kubejsEn: opts.kubejs ?? { kubejs: { 'item.kubejs.gear': 'Gear' } } };
}

interface Store {
  readonly io: TrackModpacksIO;
  readonly writes: { id: string; files: ModpackFiles }[];
}

/** 記憶體中的 data/modpacks；寫入後 readExisting 會讀到新內容 */
function store(fetchImpl: FetchLike, packs: readonly ExistingModpack[], apiKey?: string): Store {
  const data = new Map(packs.map((p) => [p.meta.id, p]));
  const writes: { id: string; files: ModpackFiles }[] = [];
  const io: TrackModpacksIO = {
    fetch: fetchImpl,
    apiKey,
    readExisting: async (id) => data.get(id) ?? null,
    write: async (id, files) => {
      writes.push({ id, files });
      data.set(id, { meta: files.meta, kubejsEn: { ...data.get(id)?.kubejsEn, ...files.kubejsEn } });
    },
  };
  return { io, writes };
}

describe('trackModpacks', () => {
  it('updates a Modrinth pack whose latest version is newer and reports the change', async () => {
    const { io, writes } = store(fakeFetch(await mrRoutes()), [pack('tracked-pack', 'modrinth', 'AbCd1234', '1.3.0', { mods: 5 })]);
    const report = await trackModpacks(io, ['tracked-pack'], TODAY);
    expect(report.entries).toEqual([{
      kind: 'updated', id: 'tracked-pack', name: 'Tracked Pack',
      from: { platform: 'modrinth', projectId: 'AbCd1234', version: '1.3.0', mcVersion: '1.20.1', loader: 'forge' },
      to: { version: '1.4.0', mcVersion: '1.20.1', loader: 'forge' },
      modsBefore: 5, modsAfter: 1, kubejsAddedKeys: 1, questAddedKeys: 0, differing: [],
      notes: expect.arrayContaining(['略過非 Modrinth 來源的檔案：mods/private.jar']),
    }]);
    expect(writes.map((w) => [w.id, w.files.meta.source.version])).toEqual([['tracked-pack', '1.4.0']]);
  });

  it('skips packs already at the latest version after listing versions only', async () => {
    const f = fakeFetch(await mrRoutes());
    const { io, writes } = store(f, [pack('tracked-pack', 'modrinth', 'AbCd1234', '1.4.0')]);
    expect((await trackModpacks(io, ['tracked-pack'], TODAY)).entries).toEqual([{ kind: 'skipped', id: 'tracked-pack', reason: SKIP_UP_TO_DATE }]);
    expect(f.calls.map((c) => c.url)).toEqual([`${MR_API}/project/AbCd1234/version`]);
    expect(writes).toEqual([]);
  });

  it('skips example packs and CurseForge packs without a key before any request', async () => {
    const f = fakeFetch(await cfRoutes());
    const { io } = store(f, [pack('example-pack', 'modrinth', 'ExAmPlE0', '1.0.0'), pack('tracked-pack', 'curseforge', '555', 'Example Pack 1.3.0')]);
    expect((await trackModpacks(io, ['example-pack', 'tracked-pack'], TODAY)).entries).toEqual([
      { kind: 'skipped', id: 'example-pack', reason: SKIP_EXAMPLE },
      { kind: 'skipped', id: 'tracked-pack', reason: SKIP_NO_KEY },
    ]);
    expect(f.calls).toEqual([]);
  });

  it('updates a CurseForge pack when the newest client file does not match the stored version', async () => {
    const { io, writes } = store(fakeFetch(await cfRoutes()), [pack('tracked-pack', 'curseforge', '555', 'Example Pack 1.3.0')], CF_FAKE_KEY);
    expect((await trackModpacks(io, ['tracked-pack'], TODAY)).entries[0]).toMatchObject({
      kind: 'updated', from: { version: 'Example Pack 1.3.0' }, to: { version: '1.4.0' }, modsAfter: 1,
    });
    expect(writes).toHaveLength(1);
  });

  it('treats a CurseForge pack whose manifest version equals the stored one as current without writing', async () => {
    const byManifest = fakeFetch(await cfRoutes());
    const a = store(byManifest, [pack('tracked-pack', 'curseforge', '555', '1.4.0')], CF_FAKE_KEY);
    expect((await trackModpacks(a.io, ['tracked-pack'], TODAY)).entries).toEqual([{ kind: 'skipped', id: 'tracked-pack', reason: SKIP_UP_TO_DATE }]);
    expect(a.writes).toEqual([]);
    const byFileName = fakeFetch(await cfRoutes());
    const b = store(byFileName, [pack('tracked-pack', 'curseforge', '555', 'example-1.4.0.zip')], CF_FAKE_KEY);
    expect((await trackModpacks(b.io, ['tracked-pack'], TODAY)).entries[0]).toMatchObject({ kind: 'skipped', reason: SKIP_UP_TO_DATE });
    expect(byFileName.calls.map((c) => c.url)).not.toContain(CF_DOWNLOAD);
  });

  it('reports differing English, new quest keys and a Minecraft version change', async () => {
    const bytes = await mrpackBytes({ 'overrides/config/ftbquests/quests/lang/en_us.snbt': QUEST_LANG_SNBT }, MR_INDEX_121);
    const { io } = store(fakeFetch(await mrRoutes(bytes)), [pack('tracked-pack', 'modrinth', 'AbCd1234', '1.3.0', { kubejs: { kubejs: { 'item.kubejs.gear': 'Old gear' } } })]);
    expect((await trackModpacks(io, ['tracked-pack'], TODAY)).entries[0]).toMatchObject({
      kind: 'updated', to: { version: '1.4.0', mcVersion: '1.21.1', loader: 'neoforge' },
      kubejsAddedKeys: 1, questAddedKeys: 3, differing: ['kubejs:item.kubejs.gear'],
    });
  });

  it('refuses to write when the platform slug now maps to another id', async () => {
    const routes = { ...(await mrRoutes()), [`${MR_API}/project/AbCd1234`]: { ...MR_PROJECT, slug: 'renamed-pack' } };
    const { io, writes } = store(fakeFetch(routes), [pack('tracked-pack', 'modrinth', 'AbCd1234', '1.3.0')]);
    expect((await trackModpacks(io, ['tracked-pack'], TODAY)).entries).toEqual([
      { kind: 'manual', id: 'tracked-pack', reason: '平台上的 slug 對應到 renamed-pack，與既有的 tracked-pack 不同，請人工確認' },
    ]);
    expect(writes).toEqual([]);
  });

  it('keeps going after failures and lists them as manual work', async () => {
    const routes = { ...(await mrRoutes()), [`${MR_API}/project/Empty000/version`]: [] };
    const { io, writes } = store(fakeFetch(routes), [
      pack('broken-pack', 'modrinth', 'Missing0', '1.0.0'),
      pack('empty-pack', 'modrinth', 'Empty000', '1.0.0'),
      pack('cf-pack', 'curseforge', 'abc', '1.0.0'),
      pack('tracked-pack', 'modrinth', 'AbCd1234', '1.3.0', { kubejs: { kubejs: { 'item.kubejs.casing': 'Casing' } } }),
      pack('next-pack', 'modrinth', 'AbCd1234', '1.4.0'),
    ], CF_FAKE_KEY);
    const report = await trackModpacks(io, ['broken-pack', 'ghost', 'empty-pack', 'cf-pack', 'tracked-pack', 'next-pack'], TODAY);
    expect(report.entries).toEqual([
      { kind: 'manual', id: 'broken-pack', reason: `處理失敗：HTTP 404 ${MR_API}/project/Missing0/version` },
      { kind: 'manual', id: 'ghost', reason: '找不到 data/modpacks/ghost/modpack.json' },
      { kind: 'manual', id: 'empty-pack', reason: '處理失敗：Modrinth 上沒有任何版本' },
      { kind: 'manual', id: 'cf-pack', reason: '處理失敗：CurseForge 專案 ID「abc」不是數字' },
      { kind: 'manual', id: 'tracked-pack', reason: '格式碼改變，未寫入：kubejs:item.kubejs.casing' },
      { kind: 'skipped', id: 'next-pack', reason: SKIP_UP_TO_DATE },
    ]);
    expect(writes).toEqual([]);
  });

  it('passes runAddModpack errors through, such as an unsupported Minecraft version', async () => {
    const zip = await curseZipBytes({ ...CF_MANIFEST, minecraft: { version: '1.7.10', modLoaders: [{ id: 'forge-10.13.4', primary: true }] } });
    const { io, writes } = store(fakeFetch(await cfRoutes(zip)), [pack('tracked-pack', 'curseforge', '555', 'Example Pack 1.3.0')], CF_FAKE_KEY);
    expect((await trackModpacks(io, ['tracked-pack'], TODAY)).entries[0]).toMatchObject({
      kind: 'manual', reason: expect.stringContaining('不支援的 Minecraft 版本：1.7.10'),
    });
    expect(writes).toEqual([]);
  });

  it('redacts the key from failures and never puts it in the report', async () => {
    const leaky: FetchLike = async () => {
      throw new Error(`connect failed with key ${CF_FAKE_KEY}`);
    };
    const { io } = store(leaky, [pack('tracked-pack', 'curseforge', '555', 'Example Pack 1.3.0')], CF_FAKE_KEY);
    const report = await trackModpacks(io, ['tracked-pack'], TODAY);
    expect(report.entries).toEqual([{ kind: 'manual', id: 'tracked-pack', reason: '處理失敗：connect failed with key [已隱藏]' }]);
    const ok = store(fakeFetch(await cfRoutes()), [pack('tracked-pack', 'curseforge', '555', 'Example Pack 1.3.0')], CF_FAKE_KEY);
    const written = await trackModpacks(ok.io, ['tracked-pack'], TODAY);
    expect(JSON.stringify([report, written, ok.writes])).not.toContain(CF_FAKE_KEY);
  });
});
