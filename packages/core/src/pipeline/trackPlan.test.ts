import { describe, expect, it } from 'vitest';
import { catalogModSchema, type CatalogMod } from '../catalog/schema';
import { fromModrinthVersion, type ModTarget, type PlatformBuild, planTracking, selectTargets, splitBlocked, TRACKED_MC_VERSIONS, type TrackTarget } from './index';

const metaWith = (over: Partial<Record<string, unknown>> = {}): CatalogMod => catalogModSchema.parse({
  modId: 'demo', name: 'Demo', summary: '示範', authors: ['x'], links: { modrinth: 'https://modrinth.com/mod/demo' },
  mcVersions: ['1.21.1'], loaders: ['neoforge'], format: 'json',
  translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null } },
  updatedAt: '2026-01-01', sourceVersions: [{ modVersion: '2.0', mcVersion: '1.21.1', loader: 'neoforge' }],
  ...over,
});

const v = (id: string, num: string, games: string[], loaders: string[], date: string): PlatformBuild => fromModrinthVersion({
  id, version_number: num, game_versions: games, loaders, date_published: date,
  files: [{ url: `https://cdn/${id}.jar`, filename: `${id}.jar`, primary: true }],
});

const summarize = (targets: readonly TrackTarget[]) => targets.map((t) => `${t.kind}:${t.mcVersion}:${t.loader}:${t.version.modVersion}`);

describe('TRACKED_MC_VERSIONS', () => {
  it('lists JSON-capable versions newest first', () => {
    expect(TRACKED_MC_VERSIONS[0]).toBe('26.3');
    expect(TRACKED_MC_VERSIONS).toEqual(expect.arrayContaining(['26.2', '26.1.2', '26.1.1', '26.1', '1.21.11', '1.21.10', '1.21.9', '1.21.8']));
    expect(TRACKED_MC_VERSIONS).not.toContain('1.12.2');
  });
});

describe('planTracking', () => {
  it('reports nothing when the tracked build is current and no other builds exist', () => {
    const plan = planTracking(metaWith(), [v('a', '2.0', ['1.21.1'], ['neoforge'], '2026-01-01')]);
    expect(plan).toEqual({ kind: 'track', targets: [] });
  });

  it('updates a tracked combination with a newer release', () => {
    const plan = planTracking(metaWith(), [
      v('a', '2.0', ['1.21.1'], ['neoforge'], '2026-01-01'),
      v('b', '2.1', ['1.21.1'], ['neoforge'], '2026-02-01'),
    ]);
    expect(plan.kind === 'track' && plan.targets).toEqual([
      expect.objectContaining({ kind: 'update', mcVersion: '1.21.1', loader: 'neoforge', previous: '2.0' }),
    ]);
  });

  it('never replaces a recorded build with one published earlier', () => {
    const beta = { ...v('b', '2.1', ['1.21.1'], ['neoforge'], '2026-03-01'), prerelease: true };
    const plan = planTracking(metaWith({ sourceVersions: [{ modVersion: '2.1', mcVersion: '1.21.1', loader: 'neoforge' }] }), [
      v('a', '2.0', ['1.21.1'], ['neoforge'], '2026-02-01'),
      beta,
    ]);
    expect(plan).toEqual({ kind: 'track', targets: [] });
  });

  it('updates a tracked row that has no recorded mod version', () => {
    const meta = metaWith({ sourceVersions: [{ mcVersion: '1.21.1', loader: 'neoforge' }] });
    const plan = planTracking(meta, [v('a', '2.0', ['1.21.1'], ['neoforge'], '2026-01-01')]);
    expect(plan.kind === 'track' && summarize(plan.targets)).toEqual(['update:1.21.1:neoforge:2.0']);
  });

  it('adds every untracked supported combination, newest MC first then loader order', () => {
    const plan = planTracking(metaWith(), [
      v('a', '2.0', ['1.21.1'], ['neoforge'], '2026-01-01'),
      v('c', '3.0', ['1.21.4'], ['fabric', 'quilt'], '2026-03-01'),
      v('d', '1.9', ['1.20.1'], ['forge'], '2025-12-01'),
      v('e', '0.1', ['1.12.2'], ['forge'], '2020-01-01'),
      v('f', '9.9', ['24w01a'], ['fabric'], '2026-04-01'),
    ]);
    expect(plan.kind === 'track' && summarize(plan.targets)).toEqual([
      'add:1.21.4:fabric:3.0', 'add:1.20.1:forge:1.9',
    ]);
  });

  it('tracks Quilt only when no Fabric build exists for that Minecraft version', () => {
    const plan = planTracking(metaWith(), [
      v('a', '2.0', ['1.21.1'], ['neoforge'], '2026-01-01'),
      v('b', '2.2.0', ['1.21.4'], ['fabric', 'quilt'], '2026-02-01'),
      v('c', '2.2.4', ['1.21.4'], ['fabric'], '2026-03-01'),
      v('d', '1.0', ['1.20.1'], ['quilt'], '2026-01-01'),
    ]);
    expect(plan.kind === 'track' && summarize(plan.targets)).toEqual(['add:1.21.4:fabric:2.2.4', 'add:1.20.1:quilt:1.0']);
  });

  it('lists updates before additions', () => {
    const plan = planTracking(metaWith(), [
      v('b', '2.1', ['1.21.1'], ['neoforge'], '2026-02-01'),
      v('c', '3.0', ['1.21.4'], ['neoforge'], '2026-03-01'),
    ]);
    expect(plan.kind === 'track' && summarize(plan.targets)).toEqual(['update:1.21.1:neoforge:2.1', 'add:1.21.4:neoforge:3.0']);
  });

  it('skips .lang mods and mods without any usable link', () => {
    expect(planTracking(metaWith({ format: 'lang' }), []).kind).toBe('skip');
    expect(planTracking({ ...metaWith(), links: {} }, [])).toEqual({ kind: 'skip', reason: 'mod.json 沒有 Modrinth 或 CurseForge 連結' });
  });

  it('tracks curseforge-only mods', () => {
    const meta = metaWith({ links: { curseforge: 'https://www.curseforge.com/minecraft/mc-mods/ae2' } });
    const plan = planTracking(meta, [v('a', '2.1', ['1.21.1'], ['neoforge'], '2026-02-01')]);
    expect(plan.kind).toBe('track');
    expect(plan.kind === 'track' && summarize(plan.targets)).toEqual(['update:1.21.1:neoforge:2.1']);
  });

  it('adds a 26.3 build ahead of older combinations', () => {
    const plan = planTracking(metaWith(), [
      v('a', '2.0', ['1.21.1'], ['neoforge'], '2026-01-01'),
      v('d', '1.9', ['1.20.1'], ['forge'], '2025-12-01'),
      v('g', '4.0', ['26.3'], ['neoforge'], '2026-09-01'),
    ]);
    expect(plan.kind === 'track' && summarize(plan.targets)).toEqual(['add:26.3:neoforge:4.0', 'add:1.20.1:forge:1.9']);
  });
});

describe('selectTargets', () => {
  const t = (kind: TrackTarget['kind'], mcVersion: string): TrackTarget => ({
    kind, mcVersion, loader: 'fabric', version: v(mcVersion, '1', [mcVersion], ['fabric'], '2026-01-01'),
  });

  it('takes updates across all mods first, then additions, up to the limit', () => {
    const items = [
      { modId: 'b', target: t('add', '1.21.4') },
      { modId: 'a', target: t('add', '1.20.1') },
      { modId: 'b', target: t('update', '1.21.1') },
      { modId: 'a', target: t('update', '1.21.1') },
    ];
    const { chosen, deferred } = selectTargets(items, 3);
    expect(chosen.map((c) => `${c.modId}:${c.target.kind}:${c.target.mcVersion}`)).toEqual(['a:update:1.21.1', 'b:update:1.21.1', 'b:add:1.21.4']);
    expect(deferred).toBe(1);
  });

  it('does not mutate its input', () => {
    const items = [{ modId: 'b', target: t('add', '1.21.4') }, { modId: 'a', target: t('update', '1.21.1') }];
    selectTargets(items, 1);
    expect(items.map((i) => i.modId)).toEqual(['b', 'a']);
  });
});

describe('splitBlocked', () => {
  const withUrl = (url: string | null): PlatformBuild => ({ ...v('x', '1', ['1.21.1'], ['fabric'], '2026-01-01'), file: { name: 'x.jar', url } });
  const item = (modId: string, url: string | null): ModTarget => ({
    modId, target: { kind: 'add', mcVersion: '1.21.1', loader: 'fabric', version: withUrl(url) },
  });

  it('separates targets whose author blocks third-party downloads', () => {
    const items = [item('a', 'https://edge.forgecdn.net/a.jar'), item('b', null), item('c', 'https://cdn/c.jar')];
    const { allowed, blocked } = splitBlocked(items);
    expect(allowed.map((i) => i.modId)).toEqual(['a', 'c']);
    expect(blocked.map((i) => i.modId)).toEqual(['b']);
  });

  it('does not mutate its input', () => {
    const items = [item('b', null), item('a', 'https://cdn/a.jar')];
    splitBlocked(items);
    expect(items.map((i) => i.modId)).toEqual(['b', 'a']);
  });
});
