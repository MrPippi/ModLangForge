import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { exportProjects } from '@mlf/core/export';
import { buildProject, updateEntry } from '@mlf/core/merge';
import { kubejsProject } from '@mlf/core/modpack';
import { buildContribution } from './contribution';

const pack = { id: 'example-pack', name: 'Example Pack', version: '1.0.0' };
const kube = updateEntry(kubejsProject(pack, 'kubejs', { en: { a: 'Gear', b: 'Casing' }, zh: {} }, 1), 'a', '齒輪', 2);
const jar = buildProject({ modId: 'alpha', name: 'Alpha', version: '1', jarName: 'alpha.jar', format: 'json', source: { k: 'v' }, order: ['k'] }, 1);

async function unzip(blob: Blob): Promise<JSZip> {
  return JSZip.loadAsync(await blob.arrayBuffer());
}

describe('modpack contributions', () => {
  it('writes KubeJS translations to modpacks/<id>/kubejs/<ns>/zh_tw.json without mod.json', async () => {
    const zip = await unzip((await buildContribution([kube, jar], '2026-10-17')).blob);
    expect(JSON.parse((await zip.file('modpacks/example-pack/kubejs/kubejs/zh_tw.json')?.async('string')) ?? '{}')).toEqual({ a: '齒輪' });
    expect(Object.keys(zip.files).filter((f) => f.startsWith('kubejs/'))).toEqual([]);
    expect(zip.file('alpha/mod.json')).not.toBeNull();
    const readme = (await zip.file('README.txt')?.async('string')) ?? '';
    expect(readme).toContain('包含模組：alpha');
    expect(readme).toContain('包含整合包文字：modpacks/example-pack/kubejs/kubejs/zh_tw.json');
    expect(readme).toContain('放到 data/ 底下相同的位置');
  });

  it('exports KubeJS text to assets/<ns>/lang/zh_tw.json in resource packs', async () => {
    const result = await exportProjects([kube], { kind: 'merged-pack', untranslated: 'keep-source', mcVersion: '1.20.1', description: 'd' });
    const zip = await unzip(result.blob);
    expect(JSON.parse((await zip.file('assets/kubejs/lang/zh_tw.json')?.async('string')) ?? '{}')).toEqual({ a: '齒輪', b: 'Casing' });
  });
});
