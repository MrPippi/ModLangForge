import { describe, expect, it } from 'vitest';
import { catalogModSchema } from '@mlf/core/catalog';
import { toModApiBody } from './modPayload';

const meta = catalogModSchema.parse({
  modId: 'demo', name: 'Demo', summary: 's', authors: ['a'], links: { modrinth: 'https://modrinth.com/mod/demo' },
  mcVersions: ['1.20.1'], loaders: ['forge'], format: 'json', sourceVersions: [{ mcVersion: '1.20.1', loader: 'forge' }],
  translation: { status: 'partial', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null } }, updatedAt: '2026-10-15',
});

describe('toModApiBody', () => {
  it('keeps the version 1 shape for mods without a guide', () => {
    expect(toModApiBody({ meta, en: { a: 'A' }, zh: { a: '甲' } })).toEqual({ version: 1, meta, en_us: { a: 'A' }, zh_tw: { a: '甲' } });
  });

  it('adds raw guide files and flattened translations, not the flattened English', () => {
    const files = { 'guide/en_us/entries/a.json': '{"name":"A"}' };
    const body = toModApiBody({ meta, en: {}, zh: {}, guide: { files, en: { 'guide/entries/a.json#name': 'A' }, zh: { 'guide/entries/a.json#name': '甲' } } });
    expect(body.version).toBe(1);
    expect(body.guide).toEqual({ files, zh_tw: { 'guide/entries/a.json#name': '甲' } });
  });
});
