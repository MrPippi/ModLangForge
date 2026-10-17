import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildProject } from '../merge';
import type { ModProject } from '../types';
import { exportProjects, mergeSameNamespace } from './index';

function project(modId: string, source: Record<string, string>, zh: Record<string, string>): ModProject {
  return buildProject({ modId, name: modId, version: '1', jarName: `${modId}.jar`, format: 'json', source, order: Object.keys(source), zhTw: zh }, 1);
}

const create = project('create', { a: 'A', b: 'B' }, { a: '甲', b: '乙' });
const kube: ModProject = { ...project('create', { b: 'B2', c: 'C' }, { c: '丙' }), id: 'modpack:p:create', name: 'P（KubeJS：create）' };

describe('mergeSameNamespace', () => {
  it('combines projects sharing a namespace, later projects winning per key', () => {
    const merged = mergeSameNamespace([create, kube, project('jei', { j: 'J' }, {})]);
    expect(merged.map((p) => p.id)).toEqual(['create', 'jei']);
    expect(merged[0]?.entries.map((e) => [e.key, e.source, e.target])).toEqual([['a', 'A', '甲'], ['b', 'B2', ''], ['c', 'C', '丙']]);
  });

  it('ignores obsolete entries of later projects', () => {
    const stale: ModProject = { ...kube, entries: [{ key: 'a', source: 'A', target: '', status: 'obsolete' }] };
    expect(mergeSameNamespace([create, stale])[0]?.entries.map((e) => [e.key, e.target])).toEqual([['a', '甲'], ['b', '乙']]);
  });

  it('keeps the first guide and returns single projects unchanged', () => {
    const guide = { files: { 'guide/en_us/a.json': '{"name":"A"}' }, entries: [] };
    const guided: ModProject = { ...create, guide };
    expect(mergeSameNamespace([kube, guided])[0]?.guide).toBe(guide);
    expect(mergeSameNamespace([create])[0]).toBe(create);
  });
});

describe('exportProjects with shared namespaces', () => {
  it('writes one lang file per namespace containing both texts', async () => {
    const result = await exportProjects([create, kube], { kind: 'merged-pack', untranslated: 'keep-source', mcVersion: '1.20.1', description: 'd' });
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(JSON.parse((await zip.file('assets/create/lang/zh_tw.json')?.async('string')) ?? '{}')).toEqual({ a: '甲', b: 'B2', c: '丙' });
  });
});
