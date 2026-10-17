import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildProject } from '../merge';
import type { ModProject } from '../types';
import { kubejsProject, type ModpackRef } from '../modpack';
import { exportProjects, mergeSameNamespace } from './index';

function project(modId: string, source: Record<string, string>, zh: Record<string, string>): ModProject {
  return buildProject({ modId, name: modId, version: '1', jarName: `${modId}.jar`, format: 'json', source, order: Object.keys(source), zhTw: zh }, 1);
}

const PACK: ModpackRef = { id: 'p', name: 'P', version: '1' };

const create = project('create', { a: 'A', b: 'B' }, { a: '甲', b: '乙' });
const kube: ModProject = { ...project('create', { b: 'B2', c: 'C' }, { c: '丙' }), id: 'modpack:p:create', name: 'P（KubeJS：create）' };

describe('mergeSameNamespace', () => {
  it('combines projects sharing a namespace, later translated entries winning per key', () => {
    const merged = mergeSameNamespace([create, kube, project('jei', { j: 'J' }, {})]);
    expect(merged.map((p) => p.id)).toEqual(['create', 'jei']);
    expect(merged[0]?.entries.map((e) => [e.key, e.source, e.target])).toEqual([['a', 'A', '甲'], ['b', 'B', '乙'], ['c', 'C', '丙']]);
  });

  it('ignores obsolete entries of later projects', () => {
    const stale: ModProject = { ...kube, entries: [{ key: 'a', source: 'A', target: '', status: 'obsolete' }] };
    expect(mergeSameNamespace([create, stale])[0]?.entries.map((e) => [e.key, e.target])).toEqual([['a', '甲'], ['b', '乙']]);
  });

  it('gives KubeJS precedence regardless of input order', () => {
    const kubeFirst = kubejsProject(PACK, 'create', { en: { b: 'B' }, zh: { b: 'KubeJS乙' } }, 1);
    const modProject = project('create', { b: 'B' }, { b: '模組乙' });
    const merged = mergeSameNamespace([kubeFirst, modProject]);
    expect(merged[0]?.entries.map((e) => [e.key, e.target])).toEqual([['b', 'KubeJS乙']]);
  });

  it('keeps the earlier translation when the winner is untranslated with the same source', () => {
    const translated = project('create', { a: 'A' }, { a: '甲' });
    const blank: ModProject = { ...kube, entries: [{ key: 'a', source: 'A', target: '', status: 'untranslated' }] };
    expect(mergeSameNamespace([translated, blank])[0]?.entries.map((e) => [e.key, e.target])).toEqual([['a', '甲']]);
  });

  it('keeps the earlier translation when the winner is untranslated with a different source', () => {
    const translated = project('create', { a: 'A' }, { a: '甲' });
    const blank: ModProject = { ...kube, entries: [{ key: 'a', source: 'A2', target: '', status: 'untranslated' }] };
    expect(mergeSameNamespace([translated, blank])[0]?.entries.map((e) => [e.key, e.source, e.target])).toEqual([['a', 'A', '甲']]);
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
    expect(JSON.parse((await zip.file('assets/create/lang/zh_tw.json')?.async('string')) ?? '{}')).toEqual({ a: '甲', b: '乙', c: '丙' });
  });

  it('keeps same-namespace projects apart in separate packs, with unique file names', async () => {
    const other: ModProject = { ...project('create', { z: 'Z' }, {}), id: 'modpack:q:create' };
    const result = await exportProjects([create, other], { kind: 'separate-packs', untranslated: 'keep-source', mcVersion: '1.20.1', description: 'd' });
    const outer = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(Object.keys(outer.files).sort()).toEqual(['create-2-zh_tw.zip', 'create-zh_tw.zip']);
    const inner = await JSZip.loadAsync(await outer.file('create-zh_tw.zip')?.async('uint8array') ?? new Uint8Array());
    expect(JSON.parse((await inner.file('assets/create/lang/zh_tw.json')?.async('string')) ?? '{}')).toEqual({ a: '甲', b: '乙' });
  });
});
