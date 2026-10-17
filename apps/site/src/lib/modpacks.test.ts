import { describe, expect, it } from 'vitest';
import { catalogModSchema } from '@mlf/core/catalog';
import { catalogModpackSchema } from '@mlf/core/modpack';
import type { LoadedModpack } from '@mlf/core/node';
import { modpackApiUrl, modpackUrl } from './config';
import { toSiteMod } from './data';
import type { BuiltinMod } from '@mlf/core/catalog';
import { modpackDisplayName } from './modpackSummary';
import { toModpackApiBody, toModpackSummary, toSiteModpack } from './modpacks';

function mod(modId: string, links: Record<string, string>, en: Record<string, string>, zh: Record<string, string>, nameZh?: string) {
  const meta = catalogModSchema.parse({
    modId, name: modId.toUpperCase(), ...(nameZh ? { nameZh } : {}), summary: 's', authors: ['a'], links,
    mcVersions: ['1.20.1'], loaders: ['forge'], format: 'json', sourceVersions: [{ mcVersion: '1.20.1', loader: 'forge' }],
    translation: { status: 'partial', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null } }, updatedAt: '2026-10-15',
  });
  return toSiteMod({ meta, en, zh, glossary: [] });
}

const catalog = [
  mod('create', { modrinth: 'https://modrinth.com/mod/create' }, { a: 'A', b: 'B' }, { a: '甲' }, '機械動力'),
  mod('jei', { curseforge: 'https://www.curseforge.com/minecraft/mc-mods/jei' }, { j: 'J' }, { j: '傑' }),
];

const builtin: BuiltinMod[] = [{
  modId: 'litematica', name: 'Litematica', aliases: [], summary: 's', authors: ['a'], links: { modrinth: 'https://modrinth.com/mod/litematica' },
  mcVersions: ['1.20.1'], loaders: ['forge'], checkedVersion: { modVersion: '1.0', mcVersion: '1.20.1', loader: 'forge' }, updatedAt: '2026-10-15',
}];

const meta = catalogModpackSchema.parse({
  id: 'example-pack', name: 'Example Pack', nameZh: '範例整合包', summary: '簡介', authors: ['someone'],
  links: { modrinth: 'https://modrinth.com/modpack/example-pack' },
  source: { platform: 'modrinth', projectId: 'AbCd1234', version: '1.0.0', mcVersion: '1.20.1', loader: 'forge' },
  mods: [
    { platform: 'modrinth', projectId: 'LNytGWDc', slug: 'create' },
    { platform: 'curseforge', projectId: '238222', slug: 'jei' },
    { platform: 'modrinth', projectId: 'm', slug: 'missing-mod' },
  ],
  translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: '機器翻譯', url: null } },
  updatedAt: '2026-10-17',
});
const pack: LoadedModpack = { meta, kubejs: { kubejs: { en: { x: 'X', y: 'Y %s' }, zh: { x: '叉' } } } };

describe('toSiteModpack', () => {
  it('resolves included and missing mods and sums KubeJS progress', () => {
    const site = toSiteModpack(pack, catalog, []);
    expect(site.resolved.map((m) => m.modId)).toEqual(['create', 'jei', null]);
    expect(site.included).toEqual([
      { modId: 'create', name: 'CREATE', nameZh: '機械動力', percent: 50, builtin: false },
      { modId: 'jei', name: 'JEI', nameZh: null, percent: 100, builtin: false },
    ]);
    expect(site.missing).toEqual([{ platform: 'modrinth', projectId: 'm', slug: 'missing-mod' }]);
    expect(site.kubejsStats).toEqual({ total: 2, translated: 1, warnings: 0, percent: 50 });
  });

  it('counts built-in mods as included, not missing', () => {
    const withBuiltin = { ...pack, meta: { ...meta, mods: [...meta.mods, { platform: 'modrinth' as const, projectId: 'l', slug: 'litematica' }] } };
    const site = toSiteModpack(withBuiltin, catalog, builtin);
    expect(site.included).toContainEqual({ modId: 'litematica', name: 'Litematica', nameZh: null, percent: 100, builtin: true });
    expect(site.missing.map((m) => m.slug)).toEqual(['missing-mod']);
    expect(toModpackSummary(site)).toMatchObject({ includedMods: 3, totalMods: 4 });
  });

  it('has no KubeJS stats without KubeJS text', () => {
    expect(toSiteModpack({ meta, kubejs: {} }, catalog, []).kubejsStats).toBeNull();
  });
});

describe('summaries and API payloads', () => {
  it('summarises a modpack for the catalog and the index API', () => {
    expect(toModpackSummary(toSiteModpack(pack, catalog, []))).toEqual({
      id: 'example-pack', name: 'Example Pack', nameZh: '範例整合包', summary: '簡介', mcVersion: '1.20.1', loader: 'forge',
      status: 'machine', includedMods: 2, totalMods: 3, kubejs: { total: 2, translated: 1, percent: 50 }, ftbquests: null, updatedAt: '2026-10-17',
    });
  });

  it('exposes modpack.json, resolved mods and KubeJS texts', () => {
    const site = toSiteModpack(pack, catalog, []);
    expect(toModpackApiBody(site)).toEqual({
      version: 1, meta, mods: site.resolved,
      kubejs: { kubejs: { en_us: { x: 'X', y: 'Y %s' }, zh_tw: { x: '叉' } } },
    });
  });

  it('builds names and urls', () => {
    expect(modpackDisplayName({ name: 'Example Pack', nameZh: '範例整合包' })).toBe('Example Pack（範例整合包）');
    expect(modpackDisplayName({ name: 'Example Pack', nameZh: null })).toBe('Example Pack');
    expect(modpackUrl('example-pack')).toBe('/modpacks/example-pack/');
    expect(modpackApiUrl('example-pack')).toBe('/api/v1/modpacks/example-pack.json');
  });
});

describe('FTB quests', () => {
  const TITLE = 'quest.44A5523F7A909209.title';
  const DESC = 'quest.44A5523F7A909209.quest_desc';
  const QUEST_EN = { [TITLE]: 'Welcome', [DESC]: 'Line one\nLine two' };
  const questMeta = catalogModpackSchema.parse({
    ...meta, source: { ...meta.source, mcVersion: '1.21.1', loader: 'neoforge' }, ftbquests: { status: 'supported', layout: 'split' },
  });
  const questPack: LoadedModpack = { meta: questMeta, kubejs: {}, quests: { layout: 'split', en: QUEST_EN, zh: { [TITLE]: '歡迎' } } };

  it('computes quest progress and puts it in the summary', () => {
    const site = toSiteModpack(questPack, catalog, []);
    expect(site.questStats).toEqual({ total: 2, translated: 1, warnings: 0, percent: 50 });
    expect(toModpackSummary(site).ftbquests).toEqual({ status: 'supported', total: 2, translated: 1, percent: 50 });
  });

  it('exposes quest texts and the layout in the API payload', () => {
    expect(toModpackApiBody(toSiteModpack(questPack, catalog, [])).ftbquests).toEqual({
      status: 'supported', layout: 'split', en_us: QUEST_EN, zh_tw: { [TITLE]: '歡迎' },
    });
  });

  it('marks unsupported versions without progress or texts', () => {
    const old = catalogModpackSchema.parse({ ...meta, ftbquests: { status: 'unsupported-version' } });
    const site = toSiteModpack({ meta: old, kubejs: {} }, catalog, []);
    expect(site.questStats).toBeNull();
    expect(toModpackSummary(site).ftbquests).toEqual({ status: 'unsupported-version' });
    expect(toModpackApiBody(site).ftbquests).toEqual({ status: 'unsupported-version' });
  });

  it('leaves quests out when the modpack has none', () => {
    const site = toSiteModpack(pack, catalog, []);
    expect(site.questStats).toBeNull();
    expect(toModpackSummary(site).ftbquests).toBeNull();
    expect(toModpackApiBody(site)).not.toHaveProperty('ftbquests');
  });
});
