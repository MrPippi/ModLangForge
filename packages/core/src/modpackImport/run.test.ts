import { describe, expect, it, vi } from 'vitest';
import { catalogModpackSchema } from '../modpack';
import { fakeFetch } from '../test/fakeFetch';
import {
  CF_API, CF_FAKE_KEY, curseforgeRoutes, curseZipBytes, MR_API, MR_INDEX_121, modrinthRoutes, mrpackBytes, QUEST_CHAPTER_SNBT, QUEST_EN, QUEST_LANG_SNBT,
} from '../test/modpackFixtures';
import {
  type AddModpackIO, type ExistingModpack, type FetchLike, MISSING_KEY_MESSAGE, type ModpackFiles, noDownloadMessage, runAddModpack, unsupportedQuestNote,
} from './index';

const TODAY = '2026-10-17';

interface Memory {
  readonly io: AddModpackIO;
  readonly writes: { id: string; files: ModpackFiles }[];
}

function memoryIO(fetchImpl: FetchLike, opts: { apiKey?: string; existing?: ExistingModpack; local?: Uint8Array } = {}): Memory {
  const writes: { id: string; files: ModpackFiles }[] = [];
  const io: AddModpackIO = {
    fetch: fetchImpl,
    apiKey: opts.apiKey,
    readLocalFile: async (path) => {
      if (!opts.local) throw new Error(`no file at ${path}`);
      return opts.local;
    },
    readExisting: async () => opts.existing ?? null,
    write: async (id, files) => {
      writes.push({ id, files });
    },
  };
  return { io, writes };
}

function existing(kubejsEn: ExistingModpack['kubejsEn']): ExistingModpack {
  const meta = catalogModpackSchema.parse({
    id: 'example-pack', name: 'Example Pack', summary: '手寫簡介', authors: ['someone'],
    links: { modrinth: 'https://modrinth.com/modpack/example-pack' },
    source: { platform: 'modrinth', projectId: 'AbCd1234', version: '1.3.0', mcVersion: '1.20.1', loader: 'forge' },
    mods: [], translation: { status: 'partial', license: 'CC-BY-SA-4.0', source: { name: '社群', url: null } }, updatedAt: '2026-10-01',
  });
  return { meta, kubejsEn };
}

describe('runAddModpack', () => {
  it('writes a new modpack from Modrinth', async () => {
    const { io, writes } = memoryIO(fakeFetch(await modrinthRoutes()));
    const result = await runAddModpack(io, { platform: 'modrinth', ref: 'example-pack' }, TODAY);
    expect(result).toMatchObject({ kind: 'written', id: 'example-pack', created: true });
    expect(writes.map((w) => w.id)).toEqual(['example-pack']);
    expect(writes[0]?.files.meta).toMatchObject({ id: 'example-pack', updatedAt: TODAY, translation: { status: 'machine' } });
    expect(Object.keys(writes[0]?.files.kubejsEn ?? {})).toEqual(['kubejs']);
  });

  it('updates an existing modpack without touching curated fields or translations', async () => {
    const { io, writes } = memoryIO(fakeFetch(await modrinthRoutes()), { existing: existing({ kubejs: { 'item.kubejs.gear': 'Gear' } }) });
    expect(await runAddModpack(io, { platform: 'modrinth', ref: 'example-pack' }, TODAY)).toMatchObject({ kind: 'written', created: false });
    expect(writes[0]?.files.meta).toMatchObject({ summary: '手寫簡介', translation: { status: 'partial' }, source: { version: '1.4.0' } });
    expect(Object.keys(writes[0]?.files ?? {})).toEqual(['meta', 'kubejsEn']);
    expect(writes[0]?.files.kubejsEn).toEqual({ kubejs: { 'item.kubejs.gear': 'Gear', 'item.kubejs.casing': 'Casing %s' } });
  });

  it('reports the imported version and warns when an existing pack came from another project', async () => {
    const same = memoryIO(fakeFetch(await modrinthRoutes()), { existing: existing({}) });
    const sameResult = await runAddModpack(same.io, { platform: 'modrinth', ref: 'example-pack' }, TODAY);
    expect(sameResult).toMatchObject({ kind: 'written', imported: { version: '1.4.0', mcVersion: '1.20.1', loader: 'forge' } });
    expect(sameResult.kind === 'written' ? sameResult.notes.filter((n) => n.startsWith('注意：')) : ['x']).toEqual([]);
    const other = memoryIO(fakeFetch(await curseforgeRoutes()), { apiKey: CF_FAKE_KEY, existing: existing({}) });
    const result = await runAddModpack(other.io, { platform: 'curseforge', ref: 'example-pack' }, TODAY);
    expect(result.kind === 'written' ? result.notes : []).toContain('注意：既有來源是 modrinth AbCd1234，這次匯入的是 curseforge 555，請確認是同一個整合包');
  });

  it('stops with setup instructions when the CurseForge key is missing, before any request', async () => {
    const f = fakeFetch(await curseforgeRoutes());
    const { io, writes } = memoryIO(f);
    expect(await runAddModpack(io, { platform: 'curseforge', ref: 'example-pack' }, TODAY)).toEqual({ kind: 'error', message: MISSING_KEY_MESSAGE });
    expect(MISSING_KEY_MESSAGE).toContain('CURSEFORGE_API_KEY');
    expect(MISSING_KEY_MESSAGE).toContain('.env');
    expect(f.calls).toEqual([]);
    expect(writes).toEqual([]);
  });

  it('asks for --file when CurseForge forbids third-party downloads', async () => {
    const routes = await curseforgeRoutes();
    const files = { data: [{ id: 2, displayName: 'Example Pack 1.4.0', fileName: 'example-1.4.0.zip', fileDate: '2026-02-01T00:00:00Z', downloadUrl: null, isServerPack: false }] };
    const { io, writes } = memoryIO(fakeFetch({ ...routes, [`${CF_API}/mods/555/files?pageSize=50&index=0`]: { pagination: { index: 0, pageSize: 50, resultCount: 1, totalCount: 1 }, ...files } }), { apiKey: CF_FAKE_KEY });
    expect(await runAddModpack(io, { platform: 'curseforge', ref: 'example-pack' }, TODAY)).toEqual({ kind: 'error', message: noDownloadMessage('Example Pack 1.4.0') });
    expect(writes).toEqual([]);
  });

  it('reads a manually downloaded CurseForge zip with --file', async () => {
    const { io, writes } = memoryIO(fakeFetch(await curseforgeRoutes()), { apiKey: CF_FAKE_KEY, local: await curseZipBytes() });
    const readLocalFile = vi.spyOn(io, 'readLocalFile');
    const result = await runAddModpack(io, { platform: 'curseforge', ref: 'example-pack', filePath: 'C:\\packs\\manual.zip' }, TODAY);
    expect(readLocalFile).toHaveBeenCalledWith('C:\\packs\\manual.zip');
    expect(result).toMatchObject({ kind: 'written', id: 'example-pack' });
    expect(writes[0]?.files.meta.source).toMatchObject({ platform: 'curseforge', projectId: '555', version: '1.4.0' });
  });

  it('updates an existing modpack from CurseForge', async () => {
    const { io, writes } = memoryIO(fakeFetch(await curseforgeRoutes()), { apiKey: CF_FAKE_KEY, existing: existing({ kubejs: { 'item.kubejs.gear': 'Gear' } }) });
    expect(await runAddModpack(io, { platform: 'curseforge', ref: 'example-pack' }, TODAY)).toMatchObject({ kind: 'written', created: false });
    expect(writes[0]?.files.meta).toMatchObject({ summary: '手寫簡介', source: { platform: 'curseforge', projectId: '555', version: '1.4.0' } });
    expect(writes[0]?.files.meta.links).toEqual({ modrinth: 'https://modrinth.com/modpack/example-pack', curseforge: 'https://www.curseforge.com/minecraft/modpacks/example-pack' });
  });

  it('accepts --file only with --curseforge', async () => {
    const { io } = memoryIO(fakeFetch({}));
    expect(await runAddModpack(io, { platform: 'modrinth', ref: 'x', filePath: 'a.zip' }, TODAY)).toEqual({ kind: 'error', message: '--file 只能搭配 --curseforge 使用' });
  });

  it('does not write when a KubeJS format code changed', async () => {
    const { io, writes } = memoryIO(fakeFetch(await modrinthRoutes()), { existing: existing({ kubejs: { 'item.kubejs.casing': 'Casing' } }) });
    expect(await runAddModpack(io, { platform: 'modrinth', ref: 'example-pack' }, TODAY)).toEqual({
      kind: 'conflict', id: 'example-pack',
      conflicts: [{ ns: 'kubejs', key: 'item.kubejs.casing', existing: 'Casing', incoming: 'Casing %s', formatChanged: true }],
    });
    expect(writes).toEqual([]);
  });

  it('rejects slugs that cannot be used as an id', async () => {
    const routes = { ...(await modrinthRoutes()), [`${MR_API}/project/example-pack`]: { id: 'AbCd1234', slug: 'bad slug', title: 'X', project_type: 'modpack' } };
    const { io, writes } = memoryIO(fakeFetch(routes));
    expect(await runAddModpack(io, { platform: 'modrinth', ref: 'example-pack' }, TODAY)).toEqual({
      kind: 'error', message: '整合包 slug「bad slug」不能當作 id（只能包含 a-z 0-9 _ . -，且不可為 index）',
    });
    expect(writes).toEqual([]);
  });

  it('redacts the key from errors and never writes it', async () => {
    const leaky: FetchLike = async () => {
      throw new Error(`connect failed with key ${CF_FAKE_KEY}`);
    };
    expect(await runAddModpack(memoryIO(leaky, { apiKey: CF_FAKE_KEY }).io, { platform: 'curseforge', ref: 'example-pack' }, TODAY)).toEqual({
      kind: 'error', message: 'connect failed with key [已隱藏]',
    });
    const ok = memoryIO(fakeFetch(await curseforgeRoutes()), { apiKey: CF_FAKE_KEY });
    await runAddModpack(ok.io, { platform: 'curseforge', ref: 'example-pack' }, TODAY);
    expect(ok.writes).toHaveLength(1);
    expect(JSON.stringify(ok.writes)).not.toContain(CF_FAKE_KEY);
  });
});

const ROOT = 'overrides/config/ftbquests/quests';
const TITLE = 'quest.44A5523F7A909209.title';
const args = { platform: 'modrinth', ref: 'example-pack' } as const;

async function questFetch(files: Readonly<Record<string, string>>, index: unknown = MR_INDEX_121): Promise<FetchLike> {
  return fakeFetch(await modrinthRoutes(await mrpackBytes(files, index)));
}

function questExisting(questsEn: Readonly<Record<string, string>>): ExistingModpack {
  const meta = catalogModpackSchema.parse({
    id: 'example-pack', name: 'Example Pack', summary: '手寫簡介', authors: ['someone'],
    links: { modrinth: 'https://modrinth.com/modpack/example-pack' },
    source: { platform: 'modrinth', projectId: 'AbCd1234', version: '1.3.0', mcVersion: '1.21.1', loader: 'neoforge' },
    mods: [], translation: { status: 'partial', license: 'CC-BY-SA-4.0', source: { name: '社群', url: null } },
    ftbquests: { status: 'supported', layout: 'single' }, updatedAt: '2026-10-01',
  });
  return { meta, kubejsEn: {}, questsEn };
}

describe('runAddModpack: FTB quests', () => {
  it('writes lang/en_us.snbt text with the single layout', async () => {
    const { io, writes } = memoryIO(await questFetch({ [`${ROOT}/lang/en_us.snbt`]: QUEST_LANG_SNBT }));
    expect(await runAddModpack(io, args, TODAY)).toMatchObject({ kind: 'written', questChange: { created: true, addedKeys: Object.keys(QUEST_EN) } });
    expect(writes[0]?.files.meta.ftbquests).toEqual({ status: 'supported', layout: 'single' });
    expect(writes[0]?.files.questsEn).toEqual(QUEST_EN);
  });

  it('writes a lang folder with the split layout', async () => {
    const { io, writes } = memoryIO(await questFetch({ [`${ROOT}/lang/en_us/chapters/getting_started.snbt`]: QUEST_LANG_SNBT }));
    await runAddModpack(io, args, TODAY);
    expect(writes[0]?.files.meta.ftbquests).toEqual({ status: 'supported', layout: 'split' });
    expect(writes[0]?.files.questsEn).toEqual(QUEST_EN);
  });

  it('extracts chapter files when the pack has no lang file', async () => {
    const { io, writes } = memoryIO(await questFetch({ [`${ROOT}/chapters/getting_started.snbt`]: QUEST_CHAPTER_SNBT }));
    await runAddModpack(io, args, TODAY);
    expect(writes[0]?.files.meta.ftbquests).toEqual({ status: 'supported', layout: 'single' });
    expect(writes[0]?.files.questsEn).toEqual(QUEST_EN);
  });

  it('skips quest text on Minecraft 1.20.1 and marks the version unsupported', async () => {
    const { io, writes } = memoryIO(fakeFetch(await modrinthRoutes(await mrpackBytes({ [`${ROOT}/chapters/a.snbt`]: '{ broken' }))));
    const result = await runAddModpack(io, args, TODAY);
    expect(result.kind === 'written' ? result.notes : []).toContain(unsupportedQuestNote('1.20.1'));
    expect(writes[0]?.files.meta.ftbquests).toEqual({ status: 'unsupported-version' });
    expect(Object.keys(writes[0]?.files ?? {})).toEqual(['meta', 'kubejsEn']);
  });

  it('does not write anything when a quest file cannot be parsed', async () => {
    const { io, writes } = memoryIO(await questFetch({ [`${ROOT}/lang/en_us.snbt`]: '{\n\tquest.44A5523F7A909209.title: "x\n}' }));
    expect(await runAddModpack(io, args, TODAY)).toEqual({
      kind: 'error', message: `${ROOT}/lang/en_us.snbt 解析失敗：第 2 行：字串缺少結尾的引號（字串不可跨行）`,
    });
    expect(writes).toEqual([]);
  });

  it('refuses the update when a quest format code changed', async () => {
    const { io, writes } = memoryIO(await questFetch({ [`${ROOT}/lang/en_us.snbt`]: QUEST_LANG_SNBT }), { existing: questExisting({ [TITLE]: '&aWelcome' }) });
    expect(await runAddModpack(io, args, TODAY)).toEqual({
      kind: 'conflict', id: 'example-pack',
      conflicts: [{ ns: 'FTB 任務', key: TITLE, existing: '&aWelcome', incoming: 'Welcome', formatChanged: true }],
    });
    expect(writes).toEqual([]);
  });

  it('keeps existing quest data and says so when the new version has no quest files', async () => {
    const { io, writes } = memoryIO(await questFetch({}), { existing: questExisting(QUEST_EN) });
    expect(await runAddModpack(io, args, TODAY)).toMatchObject({
      kind: 'written', questChange: { created: false, addedKeys: [], conflicts: [], note: '新版沒有 FTB 任務檔，沿用既有資料' },
    });
    expect(writes[0]?.files.meta.ftbquests).toEqual({ status: 'supported', layout: 'single' });
    expect(writes[0]?.files.questsEn).toBeUndefined();
  });

  it('stops when a version below 1.21 would drop existing quest data', async () => {
    const { io, writes } = memoryIO(fakeFetch(await modrinthRoutes()), { existing: questExisting(QUEST_EN) });
    const result = await runAddModpack(io, args, TODAY);
    expect(result.kind).toBe('error');
    expect(result.kind === 'error' ? result.message : '').toMatch(/^這次匯入的是 Minecraft 1\.20\.1（低於 1\.21），但已有 FTB 任務資料/);
    expect(writes).toEqual([]);
  });
});
