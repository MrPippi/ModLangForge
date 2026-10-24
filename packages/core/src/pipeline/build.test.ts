import { describe, expect, it } from 'vitest';
import { buildSourceRef, fromModrinthVersion, isPrerelease, namedMcVersions, pickBuild, pickBuildFor, type PlatformBuild } from './build';
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

describe('pickBuildFor prereleases', () => {
  it('ignores alpha and beta builds when the mod has a release', () => {
    const builds = [
      pb({ id: 'rel', modVersion: '2.0', publishedAt: '2026-01-01' }),
      pb({ id: 'beta', modVersion: '2.1', publishedAt: '2026-02-01', prerelease: true }),
      pb({ id: 'named', modVersion: '1.8.0-BETA04', publishedAt: '2026-03-01' }),
      pb({ id: 'alpha', modVersion: '26.3.1-alpha', publishedAt: '2026-04-01' }),
    ];
    expect(pickBuildFor(builds, '1.21.1', 'fabric')?.id).toBe('rel');
  });

  it('falls back to prereleases when the mod has no release at all', () => {
    const builds = [pb({ id: 'b1', modVersion: '1.0-beta1', publishedAt: '2026-01-01' }), pb({ id: 'b2', modVersion: '1.0-beta2', publishedAt: '2026-02-01' })];
    expect(pickBuildFor(builds, '1.21.1', 'fabric')?.id).toBe('b2');
  });

  it('uses a prerelease for a combination that has only prereleases even when other MC versions have releases', () => {
    const builds = [
      pb({ id: 'old-rel', modVersion: '1.0', mcVersions: ['1.20.1'] }),
      pb({ id: 'new-beta', modVersion: '2.0', mcVersions: ['26.3'], prerelease: true }),
    ];
    expect(pickBuildFor(builds, '26.3', 'fabric')?.id).toBe('new-beta');
    expect(pickBuildFor(builds, '1.20.1', 'fabric')?.id).toBe('old-rel');
  });

  it('reads the Modrinth version type', () => {
    expect(fromModrinthVersion(mv({ version_type: 'beta' })).prerelease).toBe(true);
    expect(fromModrinthVersion(mv({ version_type: 'release' })).prerelease).toBeUndefined();
  });

  it('does not mistake words like "release" or loader names for prereleases', () => {
    expect(isPrerelease(pb({ modVersion: 'neoforge-1.2.29+26.1.2' }))).toBe(false);
    expect(isPrerelease(pb({ modVersion: '2.0-pre1' }))).toBe(true);
  });
});

describe('pickBuildFor MC version named in the build', () => {
  const multi = (over: Partial<PlatformBuild>): PlatformBuild => pb({ mcVersions: ['26.1.2', '26.1.1'], loaders: ['neoforge'], ...over });

  it('skips a jar built for another listed MC version', () => {
    const builds = [multi({ id: 'for-262', modVersion: '3.2.2+26.1.2-neoforge' })];
    expect(pickBuildFor(builds, '26.1.1', 'neoforge')).toBeNull();
    expect(pickBuildFor(builds, '26.1.2', 'neoforge')?.id).toBe('for-262');
  });

  it('checks the file name as well', () => {
    const builds = [multi({ id: 'f', modVersion: '15.0.0', file: { name: 'curios-neoforge-15.0.0+26.1.2.jar', url: 'u' } })];
    expect(pickBuildFor(builds, '26.1.1', 'neoforge')).toBeNull();
  });

  it('keeps jars that name no MC version or a version that only looks similar', () => {
    const builds = [multi({ id: 'jade', modVersion: '26.1.12+neoforge' }), multi({ id: 'ae2', modVersion: '26.1.13', publishedAt: '2025-01-01' })];
    expect(pickBuildFor(builds, '26.1.1', 'neoforge')?.id).toBe('jade');
    expect(namedMcVersions(builds[0]!)).toEqual([]);
  });

  it('reads an MC version used as the prefix of a longer build number', () => {
    const ftb = multi({ id: 'ftb', modVersion: 'ftb-chunks-neoforge-26.1.2.9', mcVersions: ['26.1.2', '26.1.1', '26.1'] });
    const bop = multi({ id: 'bop', modVersion: '26.1.2.0.40', mcVersions: ['26.2', '26.1.2'] });
    expect(namedMcVersions(ftb)).toEqual(['26.1.2']);
    expect(pickBuildFor([ftb], '26.1', 'neoforge')).toBeNull();
    expect(pickBuildFor([bop], '26.2', 'neoforge')).toBeNull();
    expect(namedMcVersions(multi({ modVersion: '26.2.0.0.28', mcVersions: ['26.2', '26.1.2'] }))).toEqual(['26.2']);
    expect(namedMcVersions(multi({ modVersion: '26.1.12+neoforge', mcVersions: ['26.1', '26.1.1'] }))).toEqual([]);
  });

  it('ignores named versions the platform does not list', () => {
    const builds = [pb({ id: 'x', modVersion: '1.21-2.2.0', mcVersions: ['1.21.1'] })];
    expect(pickBuildFor(builds, '1.21.1', 'fabric')?.id).toBe('x');
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
