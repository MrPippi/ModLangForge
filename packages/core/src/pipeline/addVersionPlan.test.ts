import { describe, expect, it } from 'vitest';
import { catalogModSchema } from '../catalog/schema';
import type { DetectedMod } from '../types';
import {
  addSourceVersion, migrationSourceRef, planAddVersion, selectNamespace, validateAddVersionArgs, type ModrinthVersion,
} from './index';

const meta = catalogModSchema.parse({
  modId: 'demo', name: 'Demo', summary: '示範', authors: ['x'], links: { modrinth: 'https://modrinth.com/mod/demo' },
  mcVersions: ['1.21.1'], loaders: ['neoforge'], format: 'json',
  translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null } },
  updatedAt: '2026-01-01', sourceVersions: [{ modVersion: '2.0', mcVersion: '1.21.1', loader: 'neoforge' }],
});
const ref120 = { modVersion: '1.5', mcVersion: '1.20.1', loader: 'forge' } as const;

describe('format order changes (I1)', () => {
  const current = { en: { x: '%s has %d', y: '%1$s of %2$s' }, sourceVersions: meta.sourceVersions };

  it('flags reordered non-positional format codes', () => {
    const r = addSourceVersion(current, ref120, { x: '%d has %s', y: '%1$s of %2$s' });
    expect(r.conflicts).toEqual([{ key: 'x', existing: '%s has %d', incoming: '%d has %s', formatChanged: true }]);
  });

  it('does not flag reordered positional format codes', () => {
    const r = addSourceVersion(current, ref120, { x: '%s has %d', y: 'Of %2$s, %1$s' });
    expect(r.conflicts).toEqual([{ key: 'y', existing: '%1$s of %2$s', incoming: 'Of %2$s, %1$s', formatChanged: false }]);
  });
});

describe('planAddVersion (I3)', () => {
  const en = { a: 'Apple', b: 'Banana %s' };

  it('refuses to write when a format code changed', () => {
    const plan = planAddVersion(meta, en, ref120, { a: 'Apple', b: 'Banana %s %s' }, '2026-10-15');
    expect(plan.kind).toBe('refused');
    expect(plan).not.toHaveProperty('meta');
    expect(plan.conflicts.map((c) => c.key)).toEqual(['b']);
  });

  it('returns the merged meta and en_us to write otherwise', () => {
    const plan = planAddVersion(meta, en, ref120, { a: 'Red Apple', b: 'Banana %s', c: 'Cherry' }, '2026-10-15');
    expect(plan.kind).toBe('write');
    if (plan.kind !== 'write') return;
    expect(plan.en).toEqual({ a: 'Apple', b: 'Banana %s', c: 'Cherry' });
    expect(plan.meta).toMatchObject({ mcVersions: ['1.21.1', '1.20.1'], loaders: ['forge', 'neoforge'], updatedAt: '2026-10-15' });
    expect(plan.meta.sourceVersions.map((v) => v.missingKeys)).toEqual([['c'], []]);
    expect(plan.conflicts.map((c) => c.key)).toEqual(['a']);
    expect(meta.sourceVersions).toHaveLength(1);
  });
});

describe('validateAddVersionArgs (I2b)', () => {
  it('accepts a json mod on a known 1.13+ version', () => {
    expect(validateAddVersionArgs(meta, '1.20.1')).toBeNull();
  });

  it.each([
    ['lang format mod', { ...meta, format: 'lang' as const }, '1.20.1', 'JSON'],
    ['unknown mc version', meta, '1.99', '不支援'],
    ['pre-1.13 mc version', meta, '1.12.2', '1.13'],
  ])('rejects %s', (_label, m, mc, fragment) => {
    expect(validateAddVersionArgs(m, mc)).toContain(fragment);
  });
});

describe('selectNamespace (I2b)', () => {
  const d = (modId: string, format: 'json' | 'lang', size: number): DetectedMod => ({
    modId, name: modId, version: '1', jarName: 'x.jar', format, source: {}, order: Array.from({ length: size }, (_, i) => `k${i}`),
  });

  it('picks the json namespace matching modId', () => {
    expect(selectNamespace([d('lib', 'json', 900), d('demo', 'lang', 5), d('demo', 'json', 10)], 'demo')?.format).toBe('json');
  });

  it('never falls back to another namespace', () => {
    expect(selectNamespace([d('lib', 'json', 900)], 'demo')).toBeUndefined();
  });
});

describe('migrationSourceRef (I2)', () => {
  const mv = (patch: Partial<ModrinthVersion>): ModrinthVersion => ({
    id: 'x', version_number: '1.12.6', game_versions: ['1.21.1'], loaders: ['fabric'], date_published: '2026-01-01',
    files: [{ url: 'https://cdn.modrinth.com/x.jar', filename: 'x.jar', primary: true }], ...patch,
  });

  it('chooses the build fetch:modrinth would have picked among same version_number entries', () => {
    const versions = [
      mv({ game_versions: ['26.3'], loaders: ['neoforge'], date_published: '2026-03-01' }),
      mv({ game_versions: ['1.21.1'], loaders: ['fabric'], date_published: '2026-01-01' }),
      mv({ game_versions: ['1.21.1'], loaders: ['neoforge'], date_published: '2026-02-01' }),
      mv({ version_number: '1.12.7', game_versions: ['1.21.1'], loaders: ['forge'], date_published: '2026-04-01' }),
    ];
    expect(migrationSourceRef(versions, '1.12.6')).toEqual({ modVersion: '1.12.6', mcVersion: '1.21.1', loader: 'neoforge' });
  });

  it('returns null when no entry matches or none resolves', () => {
    expect(migrationSourceRef([mv({})], '9.9.9')).toBeNull();
    expect(migrationSourceRef([mv({ game_versions: ['26.3'] })], '1.12.6')).toBeNull();
  });
});
