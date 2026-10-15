import { describe, expect, it } from 'vitest';
import type { DetectedMod } from '../types';
import { catalogModSchema } from '../catalog/schema';
import { buildDraftMeta, pickVersion, selectForTranslation, type ModrinthHit, type ModrinthVersion } from './index';

function detected(count: number, zhTw?: Record<string, string>): DetectedMod {
  const order = Array.from({ length: count }, (_, i) => `k${i}`);
  return {
    modId: 'demo', name: 'Demo', version: '1.0', jarName: 'demo.jar', format: 'json',
    source: Object.fromEntries(order.map((k) => [k, `Text ${k}`])), order, ...(zhTw ? { zhTw } : {}),
  };
}

describe('selectForTranslation', () => {
  it('includes mods without built-in zh_tw in full', () => {
    const r = selectForTranslation(detected(30));
    expect(r).toMatchObject({ action: 'include' });
    if (r.action === 'include') {
      expect(Object.keys(r.en)).toHaveLength(30);
      expect(r.builtinPercent).toBeUndefined();
    }
  });

  it('skips mods whose built-in zh_tw is (nearly) complete', () => {
    const zh = Object.fromEntries(Array.from({ length: 28 }, (_, i) => [`k${i}`, '中']));
    expect(selectForTranslation(detected(30, zh))).toEqual({ action: 'skip', reason: 'builtin-complete' });
  });

  it('keeps only keys missing from a partial built-in zh_tw', () => {
    const zh = { k0: '甲', k1: '乙', k2: '' };
    const r = selectForTranslation(detected(30, zh));
    expect(r.action).toBe('include');
    if (r.action === 'include') {
      expect(r.builtinPercent).toBe(7);
      expect(Object.keys(r.en)).toHaveLength(28);
      expect(r.en.k0).toBeUndefined();
      expect(r.en.k2).toBe('Text k2');
    }
  });

  it('skips too small and too large', () => {
    expect(selectForTranslation(detected(5))).toEqual({ action: 'skip', reason: 'too-small' });
    expect(selectForTranslation(detected(2000))).toEqual({ action: 'skip', reason: 'too-large' });
  });
});

const hit: ModrinthHit = {
  project_id: 'abc', slug: 'demo-mod', title: 'Demo Mod', author: 'someone', description: 'A demo.',
  categories: ['fabric', 'forge', 'utility'], versions: ['1.19.2', '1.20.1', '1.21.1', '1.21.2'],
};

describe('pickVersion', () => {
  const v = (id: string, games: string[], date: string): ModrinthVersion => ({
    id, version_number: id, game_versions: games, loaders: ['fabric'], date_published: date,
    files: [{ url: `https://cdn.modrinth.com/${id}.jar`, filename: `${id}.jar`, primary: true }],
  });

  it('prefers the newest version supporting 1.21.1, then 1.20.1', () => {
    const versions = [v('a', ['1.20.1'], '2026-01-01'), v('b', ['1.21.1'], '2025-01-01'), v('c', ['1.21.1'], '2025-06-01')];
    expect(pickVersion(versions)?.id).toBe('c');
    expect(pickVersion([v('a', ['1.20.1'], '2026-01-01'), v('x', ['1.19.2'], '2026-02-01')])?.id).toBe('a');
    expect(pickVersion([v('x', ['1.19.2'], '2026-02-01')])).toBeNull();
  });
});

describe('buildDraftMeta json versions', () => {
  it('drops pre-1.13 versions because JSON lang files only work from 1.13', () => {
    const legacyHit = { ...hit, versions: ['1.12.2', '1.16.5', '1.20.1'] };
    const meta = buildDraftMeta({ hit: legacyHit, modId: 'demo', modVersion: '1', today: '2026-10-15' });
    expect(meta.mcVersions).toEqual(['1.20.1', '1.16.5']);
  });
});

describe('buildDraftMeta', () => {
  it('produces a schema-valid machine-translation mod.json', () => {
    const meta = buildDraftMeta({ hit, modId: 'demo', modVersion: '2.0.0', builtinPercent: 40, today: '2026-10-15' });
    const parsed = catalogModSchema.parse(meta);
    expect(parsed).toMatchObject({
      modId: 'demo', name: 'Demo Mod', authors: ['someone'], links: { modrinth: 'https://modrinth.com/mod/demo-mod' },
      mcVersions: ['1.21.1', '1.20.1', '1.19.2'], loaders: ['forge', 'fabric'], modVersion: '2.0.0',
      translation: { status: 'machine', license: 'CC-BY-SA-4.0', builtinPercent: 40 },
    });
  });
});
