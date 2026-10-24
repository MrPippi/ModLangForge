import { describe, expect, it, vi } from 'vitest';
import { catalogModSchema } from '../catalog/schema';
import { applyVersion, type ApplyVersionIO, fromModrinthVersion, type ModFiles, type PlatformBuild } from './index';

const baseMeta = catalogModSchema.parse({
  modId: 'demo', name: 'Demo', summary: '示範', authors: ['x'], links: { modrinth: 'https://modrinth.com/mod/demo' },
  mcVersions: ['1.21.1'], loaders: ['neoforge'], format: 'json',
  translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null } },
  updatedAt: '2026-01-01', sourceVersions: [{ modVersion: '2.0', mcVersion: '1.21.1', loader: 'neoforge' }],
});

const version = (num: string): PlatformBuild => fromModrinthVersion({
  id: `id-${num}`, version_number: num, game_versions: ['1.21.1', '1.21.4'], loaders: ['neoforge'], date_published: '2026-02-01',
  files: [{ url: 'https://cdn/x.jar', filename: 'x.jar', primary: true }],
});

function memoryIO(start: ModFiles, incoming: Record<string, Record<string, string>>): ApplyVersionIO & { files: () => ModFiles } {
  let files = start;
  return {
    files: () => files,
    readMod: async () => files,
    writeMod: async (_id, next) => { files = next; },
    extractEn: async (v) => {
      const en = incoming[v.modVersion];
      if (!en) throw new Error(`no jar for ${v.modVersion}`);
      const keys = Object.keys(en);
      const covered = keys.filter((k) => k.startsWith('builtin.')).length;
      return {
        all: en,
        uncovered: Object.fromEntries(Object.entries(en).filter(([k]) => !k.startsWith('builtin.'))),
        ...(covered > 0 ? { builtinPercent: Math.round((covered / keys.length) * 100) } : {}),
      };
    },
  };
}

describe('applyVersion', () => {
  it('records a CurseForge build by its file name without .jar', async () => {
    const io = memoryIO({ meta: baseMeta, en: { a: 'Apple' } }, { 'ae2-1.2.3': { a: 'Apple', b: 'Banana' } });
    const build: PlatformBuild = {
      platform: 'curseforge', id: '77', modVersion: 'ae2-1.2.3', mcVersions: ['1.21.1'], loaders: ['neoforge'],
      publishedAt: '2026-02-01', file: { name: 'ae2-1.2.3.jar', url: 'https://edge.forgecdn.net/files/77/ae2-1.2.3.jar' },
    };
    const result = await applyVersion(io, 'demo', { mcVersion: '1.21.1', loader: 'neoforge', version: build }, '2026-10-20');
    expect(result).toMatchObject({ kind: 'written', addedKeys: 1 });
    expect(io.files().meta.sourceVersions.map((s) => s.modVersion)).toContain('ae2-1.2.3');
  });

  it('writes merged files and reports added keys', async () => {
    const io = memoryIO({ meta: baseMeta, en: { a: 'Apple' } }, { '2.1': { a: 'Apple', b: 'Banana' } });
    const result = await applyVersion(io, 'demo', { mcVersion: '1.21.1', loader: 'neoforge', version: version('2.1') }, '2026-10-17');
    expect(result).toMatchObject({ kind: 'written', addedKeys: 1 });
    expect(io.files().en).toEqual({ a: 'Apple', b: 'Banana' });
    expect(io.files().meta.sourceVersions.map((s) => s.modVersion)).toContain('2.1');
  });

  it('keeps site keys the jar now translates when the site holds a full translation', async () => {
    const io = memoryIO({ meta: baseMeta, en: { 'builtin.a': 'Apple' } }, { '2.1': { 'builtin.a': 'Apple', b: 'Banana' } });
    await applyVersion(io, 'demo', { mcVersion: '1.21.1', loader: 'neoforge', version: version('2.1') }, '2026-10-17');
    expect(io.files().en).toEqual({ 'builtin.a': 'Apple', b: 'Banana' });
    expect(io.files().meta.sourceVersions.find((s) => s.modVersion === '2.1')?.missingKeys).toEqual([]);
  });

  it('skips new keys the jar already translates when the site holds a full translation', async () => {
    const io = memoryIO({ meta: baseMeta, en: { a: 'Apple' } }, { '2.1': { a: 'Apple', 'builtin.b': 'Banana', c: 'Cherry' } });
    const result = await applyVersion(io, 'demo', { mcVersion: '1.21.1', loader: 'neoforge', version: version('2.1') }, '2026-10-17');
    expect(result).toMatchObject({ kind: 'written', addedKeys: 1 });
    expect(io.files().en).toEqual({ a: 'Apple', c: 'Cherry' });
    expect(io.files().meta.sourceVersions.find((s) => s.modVersion === '2.1')?.missingKeys).toEqual([]);
  });

  it('drops keys the jar already translates when the mod records builtinPercent', async () => {
    const meta = { ...baseMeta, translation: { ...baseMeta.translation, builtinPercent: 40 } };
    const io = memoryIO({ meta, en: { a: 'Apple' } }, { '2.1': { a: 'Apple', 'builtin.b': 'Banana' } });
    await applyVersion(io, 'demo', { mcVersion: '1.21.1', loader: 'neoforge', version: version('2.1') }, '2026-10-17');
    expect(io.files().en).toEqual({ a: 'Apple' });
  });

  it('refreshes builtinPercent from a build for the newest MC version', async () => {
    const meta = { ...baseMeta, translation: { ...baseMeta.translation, builtinPercent: 40 } };
    const io = memoryIO({ meta, en: { a: 'Apple' } }, { '3.0': { a: 'Apple', 'builtin.b': 'B', 'builtin.c': 'C', 'builtin.d': 'D' } });
    await applyVersion(io, 'demo', { mcVersion: '1.21.4', loader: 'neoforge', version: version('3.0') }, '2026-10-19');
    expect(io.files().meta.translation.builtinPercent).toBe(75);
  });

  it('keeps builtinPercent when the newest MC build is a prerelease', async () => {
    const meta = { ...baseMeta, translation: { ...baseMeta.translation, builtinPercent: 40 } };
    const io = memoryIO({ meta, en: { a: 'Apple' } }, { '3.0-alpha': { a: 'Apple', 'builtin.b': 'B', 'builtin.c': 'C', 'builtin.d': 'D' } });
    await applyVersion(io, 'demo', { mcVersion: '1.21.4', loader: 'neoforge', version: version('3.0-alpha') }, '2026-10-24');
    expect(io.files().meta.translation.builtinPercent).toBe(40);
  });

  it('keeps builtinPercent when the build targets an older MC version', async () => {
    const meta = { ...baseMeta, mcVersions: ['1.21.1', '1.21.4'], translation: { ...baseMeta.translation, builtinPercent: 40 } };
    const io = memoryIO({ meta, en: { a: 'Apple' } }, { '2.1': { a: 'Apple', 'builtin.b': 'B', 'builtin.c': 'C', 'builtin.d': 'D' } });
    await applyVersion(io, 'demo', { mcVersion: '1.21.1', loader: 'neoforge', version: version('2.1') }, '2026-10-19');
    expect(io.files().meta.translation.builtinPercent).toBe(40);
  });

  it('never adds builtinPercent to mods that rely on the site translation', async () => {
    const io = memoryIO({ meta: baseMeta, en: { a: 'Apple' } }, { '3.0': { a: 'Apple', 'builtin.b': 'B' } });
    await applyVersion(io, 'demo', { mcVersion: '1.21.4', loader: 'neoforge', version: version('3.0') }, '2026-10-19');
    expect(io.files().meta.translation.builtinPercent).toBeUndefined();
  });

  it('skips new keys without any letter or digit', async () => {
    const io = memoryIO({ meta: baseMeta, en: { a: 'Apple' } }, { '2.1': { a: 'Apple', '⚠⚠⚠': '%s', b: 'Banana' } });
    await applyVersion(io, 'demo', { mcVersion: '1.21.1', loader: 'neoforge', version: version('2.1') }, '2026-10-17');
    expect(io.files().en).toEqual({ a: 'Apple', b: 'Banana' });
  });

  it('skips new keys with empty text or that are JSON comments', async () => {
    const io = memoryIO({ meta: baseMeta, en: { a: 'Apple' } }, {
      '2.1': {
        a: 'Apple', 'cfg.desc': '', 'cfg.blank': '  ', __comment_tags: 'Names of tags', _comment: 'x', '// Common': 'y',
        '_quark.config.x': 'Real', b: 'Banana',
      },
    });
    await applyVersion(io, 'demo', { mcVersion: '1.21.1', loader: 'neoforge', version: version('2.1') }, '2026-10-17');
    expect(io.files().en).toEqual({ a: 'Apple', '_quark.config.x': 'Real', b: 'Banana' });
  });

  it('refreshes builtinPercent only from the preferred loader of the newest MC version', async () => {
    const meta = {
      ...baseMeta,
      sourceVersions: [...baseMeta.sourceVersions, { modVersion: '3.0', mcVersion: '1.21.4', loader: 'neoforge' as const, missingKeys: [] }],
      translation: { ...baseMeta.translation, builtinPercent: 40 },
    };
    const fabric = { ...version('3.0-fabric'), loaders: ['fabric' as const] };
    const io = memoryIO({ meta, en: { a: 'Apple' } }, { '3.0-fabric': { a: 'Apple', 'builtin.b': 'B', 'builtin.c': 'C', 'builtin.d': 'D' } });
    await applyVersion(io, 'demo', { mcVersion: '1.21.4', loader: 'fabric', version: fabric }, '2026-10-19');
    expect(io.files().meta.translation.builtinPercent).toBe(40);
  });

  it('skips new keys under the prefixes the mod excludes', async () => {
    const meta = catalogModSchema.parse({ ...baseMeta, excludeKeyPrefixes: ['structure.other_mod.', 'config.test_'] });
    const io = memoryIO({ meta, en: { a: 'Apple' } }, {
      '2.1': { a: 'Apple', 'structure.other_mod.tower': 'Tower', 'config.test_alpha': 'Dev', 'config.real': 'Real' },
    });
    const result = await applyVersion(io, 'demo', { mcVersion: '1.21.1', loader: 'neoforge', version: version('2.1') }, '2026-10-17');
    expect(result).toMatchObject({ kind: 'written', addedKeys: 1 });
    expect(io.files().en).toEqual({ a: 'Apple', 'config.real': 'Real' });
    expect(io.files().meta.excludeKeyPrefixes).toEqual(['structure.other_mod.', 'config.test_']);
  });

  it('does not write when a format code changed', async () => {
    const io = memoryIO({ meta: baseMeta, en: { a: 'Apple %s' } }, { '2.1': { a: 'Apple %s %s' } });
    const writeMod = vi.spyOn(io, 'writeMod');
    const result = await applyVersion(io, 'demo', { mcVersion: '1.21.1', loader: 'neoforge', version: version('2.1') }, '2026-10-17');
    expect(result.kind).toBe('conflict');
    expect(writeMod).not.toHaveBeenCalled();
  });

  it('reports extraction failures as errors', async () => {
    const io = memoryIO({ meta: baseMeta, en: { a: 'Apple' } }, {});
    const result = await applyVersion(io, 'demo', { mcVersion: '1.21.1', loader: 'neoforge', version: version('2.1') }, '2026-10-17');
    expect(result).toEqual({ kind: 'error', message: 'no jar for 2.1' });
  });

  it('reports unsupported targets as errors without extracting', async () => {
    const io = memoryIO({ meta: { ...baseMeta, format: 'lang' }, en: {} }, {});
    const extract = vi.spyOn(io, 'extractEn');
    const result = await applyVersion(io, 'demo', { mcVersion: '1.21.1', loader: 'neoforge', version: version('2.1') }, '2026-10-17');
    expect(result.kind).toBe('error');
    expect(extract).not.toHaveBeenCalled();
  });

  it('applies consecutive targets on top of each other', async () => {
    const io = memoryIO({ meta: baseMeta, en: { a: 'Apple' } }, { '2.1': { a: 'Apple', b: 'Banana' }, '3.0': { a: 'Apple', c: 'Cherry' } });
    await applyVersion(io, 'demo', { mcVersion: '1.21.1', loader: 'neoforge', version: version('2.1') }, '2026-10-17');
    await applyVersion(io, 'demo', { mcVersion: '1.21.4', loader: 'neoforge', version: version('3.0') }, '2026-10-17');
    expect(io.files().en).toEqual({ a: 'Apple', b: 'Banana', c: 'Cherry' });
    expect(io.files().meta.sourceVersions.map((s) => `${s.mcVersion}:${s.modVersion}`)).toEqual(expect.arrayContaining(['1.21.1:2.1', '1.21.4:3.0']));
  });
});
