import { describe, expect, it, vi } from 'vitest';
import { catalogModSchema } from '../catalog/schema';
import { applyVersion, type ApplyVersionIO, type ModFiles, type ModrinthVersion } from './index';

const baseMeta = catalogModSchema.parse({
  modId: 'demo', name: 'Demo', summary: '示範', authors: ['x'], links: { modrinth: 'https://modrinth.com/mod/demo' },
  mcVersions: ['1.21.1'], loaders: ['neoforge'], format: 'json',
  translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null } },
  updatedAt: '2026-01-01', sourceVersions: [{ modVersion: '2.0', mcVersion: '1.21.1', loader: 'neoforge' }],
});

const version = (num: string): ModrinthVersion => ({
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
      const en = incoming[v.version_number];
      if (!en) throw new Error(`no jar for ${v.version_number}`);
      return { all: en, uncovered: Object.fromEntries(Object.entries(en).filter(([k]) => !k.startsWith('builtin.'))) };
    },
  };
}

describe('applyVersion', () => {
  it('writes merged files and reports added keys', async () => {
    const io = memoryIO({ meta: baseMeta, en: { a: 'Apple' } }, { '2.1': { a: 'Apple', b: 'Banana' } });
    const result = await applyVersion(io, 'demo', { mcVersion: '1.21.1', loader: 'neoforge', version: version('2.1') }, '2026-10-17');
    expect(result).toMatchObject({ kind: 'written', addedKeys: 1 });
    expect(io.files().en).toEqual({ a: 'Apple', b: 'Banana' });
    expect(io.files().meta.sourceVersions.map((s) => s.modVersion)).toContain('2.1');
  });

  it('keeps keys the jar already translates when the site holds a full translation', async () => {
    const io = memoryIO({ meta: baseMeta, en: { a: 'Apple' } }, { '2.1': { a: 'Apple', 'builtin.b': 'Banana' } });
    await applyVersion(io, 'demo', { mcVersion: '1.21.1', loader: 'neoforge', version: version('2.1') }, '2026-10-17');
    expect(io.files().en).toEqual({ a: 'Apple', 'builtin.b': 'Banana' });
    expect(io.files().meta.sourceVersions.find((s) => s.modVersion === '2.1')?.missingKeys).toEqual([]);
  });

  it('drops keys the jar already translates when the mod records builtinPercent', async () => {
    const meta = { ...baseMeta, translation: { ...baseMeta.translation, builtinPercent: 40 } };
    const io = memoryIO({ meta, en: { a: 'Apple' } }, { '2.1': { a: 'Apple', 'builtin.b': 'Banana' } });
    await applyVersion(io, 'demo', { mcVersion: '1.21.1', loader: 'neoforge', version: version('2.1') }, '2026-10-17');
    expect(io.files().en).toEqual({ a: 'Apple' });
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
