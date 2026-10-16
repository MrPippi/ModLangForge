import { describe, expect, it } from 'vitest';
import { catalogModSchema } from '@mlf/core/catalog';
import type { LoadedMod } from '@mlf/core/node';
import { toSiteMod, toSummary } from './data';

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

describe('toSummary', () => {
  it('flags mods that have a guide, keeping lang-based percent', () => {
    expect(toSummary(toSiteMod(guided))).toMatchObject({ hasGuide: true, percent: 0, total: 1 });
    expect(toSummary(toSiteMod(plain)).hasGuide).toBe(false);
  });
});
