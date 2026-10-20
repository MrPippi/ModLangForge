import { describe, expect, it } from 'vitest';
import { buildSourceRef, fromModrinthVersion, pickBuild, pickBuildFor, type PlatformBuild } from './build';
import type { ModrinthVersion } from './modrinth';

const mv = (over: Partial<ModrinthVersion> = {}): ModrinthVersion => ({
  id: 'v1',
  version_number: '1.0',
  game_versions: ['1.21.1'],
  loaders: ['fabric'],
  date_published: '2026-01-01',
  files: [{ url: 'https://cdn.modrinth.com/a.jar', filename: 'a.jar', primary: true }],
  ...over,
});

const pb = (over: Partial<PlatformBuild> = {}): PlatformBuild => ({
  platform: 'curseforge',
  id: '1',
  modVersion: '1.0',
  mcVersions: ['1.21.1'],
  loaders: ['fabric'],
  publishedAt: '2026-01-01',
  file: { name: 'a.jar', url: 'https://edge.forgecdn.net/a.jar' },
  ...over,
});

describe('fromModrinthVersion', () => {
  it('maps fields, drops unknown loaders and prefers the primary file', () => {
    const b = fromModrinthVersion(mv({
      version_number: '2.3',
      loaders: ['rift', 'neoforge'],
      files: [
        { url: 'https://cdn.modrinth.com/x.jar', filename: 'x.jar', primary: false },
        { url: 'https://cdn.modrinth.com/p.jar', filename: 'p.jar', primary: true },
      ],
    }));
    expect(b).toEqual({
      platform: 'modrinth',
      id: 'v1',
      modVersion: '2.3',
      mcVersions: ['1.21.1'],
      loaders: ['neoforge'],
      publishedAt: '2026-01-01',
      file: { name: 'p.jar', url: 'https://cdn.modrinth.com/p.jar' },
    });
  });

  it('uses an empty file when the version has no files', () => {
    expect(fromModrinthVersion(mv({ files: [] })).file).toEqual({ name: '', url: null });
  });
});

describe('pickBuildFor', () => {
  it('picks the newest build matching mc and loader with a file', () => {
    const builds = [
      pb({ id: 'old', publishedAt: '2025-01-01' }),
      pb({ id: 'new', publishedAt: '2026-01-01' }),
      pb({ id: 'nofile', publishedAt: '2027-01-01', file: { name: '', url: null } }),
      pb({ id: 'forge', publishedAt: '2027-01-01', loaders: ['forge'] }),
    ];
    expect(pickBuildFor(builds, '1.21.1', 'fabric')?.id).toBe('new');
    expect(pickBuildFor(builds, '1.20.1', 'fabric')).toBeNull();
  });
});

describe('pickBuild', () => {
  it('follows PREFERRED_MC_VERSIONS order and newest publish date', () => {
    const builds = [
      pb({ id: 'a', mcVersions: ['1.21.1'], publishedAt: '2025-01-01' }),
      pb({ id: 'b', mcVersions: ['1.21.1'], publishedAt: '2026-01-01' }),
    ];
    expect(pickBuild(builds)?.id).toBe('b');
    expect(pickBuild([])).toBeNull();
    expect(pickBuild([pb({ mcVersions: ['1.21.2'] })])).toBeNull();
  });
});

describe('buildSourceRef', () => {
  it('prefers PREFERRED_MC_VERSIONS and the first known loader', () => {
    expect(buildSourceRef(pb({ mcVersions: ['1.21', '1.21.1'], loaders: ['quilt', 'fabric'] })))
      .toEqual({ modVersion: '1.0', mcVersion: '1.21.1', loader: 'fabric' });
  });

  it('prefers neoforge after 1.20.1 and forge up to 1.20.1', () => {
    expect(buildSourceRef(pb({ mcVersions: ['1.21.1'], loaders: ['forge', 'neoforge'] }))?.loader).toBe('neoforge');
    expect(buildSourceRef(pb({ mcVersions: ['1.20.1'], loaders: ['neoforge', 'forge'] }))?.loader).toBe('forge');
  });

  it('returns null for unknown mc versions or no loaders', () => {
    expect(buildSourceRef(pb({ mcVersions: ['1.21.2'] }))).toBeNull();
    expect(buildSourceRef(pb({ loaders: [] }))).toBeNull();
  });
});
