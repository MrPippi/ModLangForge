import { describe, expect, it } from 'vitest';
import { updateEntry } from '../merge';
import {
  catalogModpackSchema, kubejsProject, kubejsProjects, kubejsStats, mergeKubejsProject, modpackProjectId, modpackRef, parseModpackProjectId,
} from './index';

const pack = { id: 'example-pack', name: 'Example Pack', version: '1.0.0' };
const texts = { en: { a: 'Gear', b: 'Casing %s' }, zh: { a: '齒輪', z: '孤兒' } };

describe('modpack project ids', () => {
  it('round-trips modpack:<id>:<ns>', () => {
    expect(modpackProjectId('example-pack', 'kubejs')).toBe('modpack:example-pack:kubejs');
    expect(parseModpackProjectId('modpack:example-pack:kubejs')).toEqual({ modpackId: 'example-pack', ns: 'kubejs' });
  });

  it.each([['create'], ['modpack:a'], ['modpack:a:b:c'], ['modpack:..:kubejs'], ['modpack:a:..'], ['mod:a:b'], ['modpack:A:b'], ['modpack::b']])(
    'rejects %s', (id) => {
      expect(parseModpackProjectId(id)).toBeNull();
    },
  );
});

describe('kubejsProject', () => {
  it('builds a json project for one namespace with the shipped translations', () => {
    const p = kubejsProject(pack, 'kubejs', texts, 5);
    expect(p).toMatchObject({
      id: 'modpack:example-pack:kubejs', modId: 'kubejs', name: 'Example Pack（KubeJS：kubejs）',
      version: '1.0.0', jarName: '', format: 'json', updatedAt: 5,
    });
    expect(p.entries.map((e) => [e.key, e.target, e.status])).toEqual([['a', '齒輪', 'translated'], ['b', '', 'untranslated']]);
    expect(p.guide).toBeUndefined();
  });

  it('merges a reloaded namespace like a re-uploaded mod and keeps the project id', () => {
    const edited = updateEntry(kubejsProject(pack, 'kubejs', texts, 1), 'b', '外殼 %s', 2);
    const next = mergeKubejsProject(edited, { ...pack, version: '1.1.0' }, 'kubejs', { en: { b: 'Casing %s', c: 'New' }, zh: {} }, 3);
    expect(next).toMatchObject({ id: 'modpack:example-pack:kubejs', version: '1.1.0', updatedAt: 3 });
    expect(next.entries.map((e) => [e.key, e.target, e.status])).toEqual([
      ['b', '外殼 %s', 'translated'],
      ['c', '', 'new'],
      ['a', '齒輪', 'obsolete'],
    ]);
  });
});

describe('kubejsProjects / kubejsStats', () => {
  it('sorts namespaces and sums their progress', () => {
    const projects = kubejsProjects(pack, { zeta: { en: { x: 'X' }, zh: { x: '叉' } }, kubejs: texts }, 0);
    expect(projects.map((p) => p.id)).toEqual(['modpack:example-pack:kubejs', 'modpack:example-pack:zeta']);
    expect(kubejsStats(projects)).toEqual({ total: 3, translated: 2, warnings: 0, percent: 67 });
  });

  it('has no stats without namespaces', () => {
    expect(kubejsStats([])).toBeNull();
  });

  it('reads the reference from modpack.json', () => {
    const meta = catalogModpackSchema.parse({
      id: 'example-pack', name: 'Example Pack', summary: 's', authors: ['a'], links: { modrinth: 'https://modrinth.com/modpack/example-pack' },
      source: { platform: 'modrinth', projectId: 'AbCd1234', version: '1.4.0', mcVersion: '1.20.1', loader: 'forge' }, mods: [],
      translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null } }, updatedAt: '2026-10-17',
    });
    expect(modpackRef(meta)).toEqual({ id: 'example-pack', name: 'Example Pack', version: '1.4.0' });
  });
});
