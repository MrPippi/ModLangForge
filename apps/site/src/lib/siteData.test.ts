import { describe, expect, it } from 'vitest';
import { builtinModSchema, catalogModSchema } from '@mlf/core/catalog';
import type { LoadedMod } from '@mlf/core/node';
import { builtinToSummary, modDownloads, toSiteMod, toSummary } from './data';

const meta = catalogModSchema.parse({
  modId: 'demo', name: 'Demo', summary: 's', authors: ['a'], links: { modrinth: 'https://modrinth.com/mod/demo' },
  mcVersions: ['1.20.1'], loaders: ['forge'], format: 'json', sourceVersions: [{ mcVersion: '1.20.1', loader: 'forge' }],
  translation: { status: 'partial', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null } }, updatedAt: '2026-10-15',
});
const plain: LoadedMod = { meta, en: { a: 'Apple' }, zh: {}, glossary: [] };
const guided: LoadedMod = {
  ...plain,
  guide: {
    files: { 'guide/en_us/entries/a.json': JSON.stringify({ name: 'A', pages: [{ type: 'patchouli:text', text: 'Hello' }] }) },
    en: { 'guide/entries/a.json#name': 'A', 'guide/entries/a.json#pages/0/text': 'Hello' },
    zh: { 'guide/entries/a.json#name': '甲' },
  },
};

describe('toSiteMod', () => {
  it('computes separate lang and guide stats', () => {
    const site = toSiteMod(guided);
    expect(site.stats).toEqual({ total: 1, translated: 0, warnings: 0, percent: 0 });
    expect(site.guideStats).toEqual({ total: 2, translated: 1, warnings: 0, percent: 50 });
    expect(toSiteMod(plain).guideStats).toBeNull();
  });
});

describe('modDownloads', () => {
  it('reads data/mod-stats.json with the platform of each count', () => {
    expect(modDownloads('appleskin')).toEqual({ count: 97_460_270, platform: 'modrinth' });
    expect(modDownloads('no-such-mod')).toBeNull();
  });
});

describe('toSummary', () => {
  it('flags mods that have a guide, keeping lang-based percent', () => {
    expect(toSummary(toSiteMod(guided))).toMatchObject({ hasGuide: true, percent: 0, total: 1 });
    expect(toSummary(toSiteMod(plain)).hasGuide).toBe(false);
  });
});

describe('builtinToSummary', () => {
  const builtin = builtinModSchema.parse({
    modId: 'litematica', name: 'Litematica', aliases: ['原理圖'], summary: 's', authors: ['masa'],
    links: { modrinth: 'https://modrinth.com/mod/litematica' }, mcVersions: ['1.21.1'], loaders: ['fabric'],
    checkedVersion: { modVersion: '0.19.61', mcVersion: '1.21.1', loader: 'fabric' }, updatedAt: '2026-10-17',
  });

  it('maps a built-in mod to a 100% builtin summary without translation counts', () => {
    expect(builtinToSummary(builtin)).toMatchObject({
      modId: 'litematica', status: 'builtin', builtinPercent: 100, percent: 100, total: 0, translated: 0, nameZh: null, hasGuide: false,
    });
  });

  it('emits builtinPercent null for regular mods', () => {
    expect(toSummary(toSiteMod(plain)).builtinPercent).toBeNull();
  });
});
