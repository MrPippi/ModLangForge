import { describe, expect, it } from 'vitest';
import type { FetchLike } from '../modpackImport/http';
import { MISSING_KEY_MESSAGE } from '../modpackImport/run';
import { cfMod, cfNameSearch, cfSlugSearch, rawMod } from '../test/curseforgeLinkFixtures';
import { fakeFetch } from '../test/fakeFetch';
import { CF_API, CF_FAKE_KEY } from '../test/modpackFixtures';
import { type BackfillIO, draftCurseforgeLink, runCurseforgeBackfill, withCurseforgeLink } from './index';

const MR = (slug: string) => `https://modrinth.com/mod/${slug}`;
const CF = (slug: string) => `https://www.curseforge.com/minecraft/mc-mods/${slug}`;

const MODS: Readonly<Record<string, Record<string, unknown>>> = {
  create: rawMod('create', 'Create', { modrinth: MR('create'), curseforge: CF('create') }),
  jei: rawMod('jei', 'Just Enough Items', { modrinth: MR('jei'), source: 'https://github.com/mezz/JustEnoughItems' }),
  sodium: rawMod('sodium', 'Sodium', { modrinth: MR('sodium') }),
};

const ROUTES = {
  [cfSlugSearch('jei')]: { data: [cfMod(238222, 'Just Enough Items (JEI)', 'jei')] },
  [cfSlugSearch('sodium')]: { data: [] },
  [cfNameSearch('Sodium')]: { data: [cfMod(1, 'Sodium', 'sodium-a'), cfMod(2, 'Sodium', 'sodium-b')] },
};

const SODIUM_REVIEW = {
  kind: 'review', modId: 'sodium', name: 'Sodium', reason: 'ambiguous',
  candidates: [{ name: 'Sodium', slug: 'sodium-a', url: CF('sodium-a') }, { name: 'Sodium', slug: 'sodium-b', url: CF('sodium-b') }],
};

interface Memory {
  readonly io: BackfillIO;
  readonly writes: { modId: string; meta: Readonly<Record<string, unknown>> }[];
}

function memoryIO(fetchImpl: FetchLike, apiKey: string | undefined = CF_FAKE_KEY, mods: Readonly<Record<string, unknown>> = MODS): Memory {
  const writes: Memory['writes'] = [];
  const io: BackfillIO = {
    fetch: fetchImpl,
    apiKey,
    listMods: async () => Object.keys(mods).reverse(),
    readMod: async (modId) => mods[modId],
    writeMod: async (modId, meta) => {
      writes.push({ modId, meta });
    },
  };
  return { io, writes };
}

describe('runCurseforgeBackfill', () => {
  it('writes only confident matches and lists the rest for review', async () => {
    const { io, writes } = memoryIO(fakeFetch(ROUTES));
    expect(await runCurseforgeBackfill(io, { dryRun: false })).toEqual({
      kind: 'done', dryRun: false,
      entries: [{ kind: 'skipped', modId: 'create' }, { kind: 'written', modId: 'jei', url: CF('jei'), via: 'slug' }, SODIUM_REVIEW],
    });
    expect(writes).toEqual([{ modId: 'jei', meta: withCurseforgeLink(MODS.jei ?? {}, CF('jei')) }]);
    expect(Object.keys(writes[0]?.meta.links as object)).toEqual(['modrinth', 'curseforge', 'source']);
    expect(MODS.jei?.links).not.toHaveProperty('curseforge');
  });

  it('reports the same results without writing on a dry run', async () => {
    const { io, writes } = memoryIO(fakeFetch(ROUTES));
    const result = await runCurseforgeBackfill(io, { dryRun: true });
    expect(result).toMatchObject({ kind: 'done', dryRun: true, entries: [{ kind: 'skipped' }, { kind: 'written', modId: 'jei' }, { kind: 'review' }] });
    expect(writes).toEqual([]);
  });

  it('skips mods that already have a CurseForge link without any request', async () => {
    const f = fakeFetch(ROUTES);
    await runCurseforgeBackfill(memoryIO(f).io, { dryRun: true });
    expect(f.calls.map((c) => c.url)).toEqual([cfSlugSearch('jei'), cfSlugSearch('sodium'), cfNameSearch('Sodium')]);
  });

  it('stops with the setup message when the key is missing', async () => {
    for (const apiKey of [undefined, '']) {
      const f = fakeFetch(ROUTES);
      const io: BackfillIO = { ...memoryIO(f).io, apiKey };
      expect(await runCurseforgeBackfill(io, { dryRun: false })).toEqual({ kind: 'error', message: MISSING_KEY_MESSAGE });
      expect(f.calls).toEqual([]);
    }
  });

  it('handles one mod with --mod', async () => {
    const f = fakeFetch(ROUTES);
    const result = await runCurseforgeBackfill(memoryIO(f).io, { dryRun: true, modId: 'jei' });
    expect(result).toEqual({ kind: 'done', dryRun: true, entries: [{ kind: 'written', modId: 'jei', url: CF('jei'), via: 'slug' }] });
    expect(f.calls.map((c) => c.url)).toEqual([cfSlugSearch('jei')]);
  });

  it('rejects --mod values that are not in data/mods', async () => {
    const f = fakeFetch(ROUTES);
    const { io, writes } = memoryIO(f);
    expect(await runCurseforgeBackfill(io, { dryRun: false, modId: '../jei' })).toEqual({ kind: 'error', message: 'data/mods 沒有模組 ../jei' });
    expect(f.calls).toEqual([]);
    expect(writes).toEqual([]);
  });

  it('sends the key only to CurseForge and never writes it', async () => {
    const f = fakeFetch(ROUTES);
    const { io, writes } = memoryIO(f);
    await runCurseforgeBackfill(io, { dryRun: false });
    expect(f.calls.length).toBeGreaterThan(0);
    for (const call of f.calls) {
      expect(call.url.startsWith(`${CF_API}/`)).toBe(true);
      expect(call.init?.headers?.['x-api-key']).toBe(CF_FAKE_KEY);
      expect(call.init?.redirect).toBe('error');
    }
    expect(JSON.stringify(writes)).not.toContain(CF_FAKE_KEY);
  });

  it('redacts the key and keeps going after a failure', async () => {
    const ok = fakeFetch(ROUTES);
    const leaky: FetchLike = async (url, init) => {
      if (url === cfSlugSearch('jei')) throw new Error(`connect failed with key ${CF_FAKE_KEY}`);
      return ok(url, init);
    };
    const result = await runCurseforgeBackfill(memoryIO(leaky).io, { dryRun: false });
    expect(result).toEqual({
      kind: 'done', dryRun: false,
      entries: [{ kind: 'skipped', modId: 'create' }, { kind: 'failed', modId: 'jei', message: 'connect failed with key [已隱藏]' }, SODIUM_REVIEW],
    });
  });

  it('reports invalid mod.json files as failures without writing', async () => {
    const f = fakeFetch(ROUTES);
    const { io, writes } = memoryIO(f, CF_FAKE_KEY, { broken: { modId: 'broken' } });
    const result = await runCurseforgeBackfill(io, { dryRun: false });
    expect(result.kind === 'done' ? result.entries[0] : null).toMatchObject({ kind: 'failed', modId: 'broken', message: expect.stringContaining('broken/mod.json 格式不符') });
    expect(f.calls).toEqual([]);
    expect(writes).toEqual([]);
  });
});

describe('draftCurseforgeLink', () => {
  const draft = { modId: 'jei', links: { modrinth: MR('jei') }, updatedAt: '2026-10-17' };
  const target = { slug: 'jei', name: 'Just Enough Items' };

  it('leaves the draft untouched without a key', async () => {
    const f = fakeFetch(ROUTES);
    expect(await draftCurseforgeLink({ fetch: f, apiKey: undefined }, draft, target)).toEqual({ meta: draft, note: null });
    expect(f.calls).toEqual([]);
  });

  it('adds the link after modrinth when the mod matches', async () => {
    const result = await draftCurseforgeLink({ fetch: fakeFetch(ROUTES), apiKey: CF_FAKE_KEY }, draft, target);
    expect(result).toEqual({ meta: { ...draft, links: { modrinth: MR('jei'), curseforge: CF('jei') } }, note: 'CurseForge 連結：jei' });
  });

  it('keeps the draft and notes when a review is needed', async () => {
    const result = await draftCurseforgeLink({ fetch: fakeFetch(ROUTES), apiKey: CF_FAKE_KEY }, { links: { modrinth: MR('sodium') } }, { slug: 'sodium', name: 'Sodium' });
    expect(result).toEqual({ meta: { links: { modrinth: MR('sodium') } }, note: 'CurseForge 連結需要人工確認：有多個同名模組' });
  });

  it('keeps the draft when the lookup fails and redacts the key in the note', async () => {
    const leaky: FetchLike = async () => {
      throw new Error(`boom ${CF_FAKE_KEY}`);
    };
    expect(await draftCurseforgeLink({ fetch: leaky, apiKey: CF_FAKE_KEY }, draft, target)).toEqual({ meta: draft, note: 'CurseForge 查詢失敗：boom [已隱藏]' });
  });
});
