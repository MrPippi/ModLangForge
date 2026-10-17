import { beforeEach, describe, expect, it } from 'vitest';
import { catalogModpackSchema } from '@mlf/core/modpack';
import { makeJar, makeJarFile } from '@mlf/core/test/makeJar';
import type { ModpackPayload } from '../../islands/downloadModpack';
import { clearAll, loadAll } from './persistence';
import { useToasts } from './toastStore';
import { initialWorkspaceState, useWorkspace } from './workspaceStore';

const ws = () => useWorkspace.getState();

const meta = catalogModpackSchema.parse({
  id: 'example-pack', name: 'Example Pack', summary: 's', authors: ['a'], links: { modrinth: 'https://modrinth.com/modpack/example-pack' },
  source: { platform: 'modrinth', projectId: 'AbCd1234', version: '1.0.0', mcVersion: '1.20.1', loader: 'forge' }, mods: [],
  translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null } }, updatedAt: '2026-10-17',
});

function payload(version: string, kubejs: ModpackPayload['kubejs']): ModpackPayload {
  return { meta: { ...meta, source: { ...meta.source, version } }, mods: [], kubejs };
}

const messages = () => useToasts.getState().toasts.map((x) => x.message);

beforeEach(async () => {
  await clearAll();
  useWorkspace.setState(initialWorkspaceState);
  useToasts.setState({ toasts: [] });
});

describe('addModpack', () => {
  it('creates one project per namespace with a modpack project id and persists it', async () => {
    await ws().addModpack(payload('1.0.0', { kubejs: { en: { a: 'Gear' }, zh: { a: '齒輪' } }, extra: { en: { b: 'B' }, zh: {} } }));
    expect(ws().mods.map((m) => [m.id, m.modId, m.name])).toEqual([
      ['modpack:example-pack:extra', 'extra', 'Example Pack（KubeJS：extra）'],
      ['modpack:example-pack:kubejs', 'kubejs', 'Example Pack（KubeJS：kubejs）'],
    ]);
    expect(ws().activeModId).toBe('modpack:example-pack:extra');
    expect(ws().mods[1]?.entries.map((e) => [e.key, e.target])).toEqual([['a', '齒輪']]);
    expect((await loadAll()).map((m) => m.id).sort()).toEqual(['modpack:example-pack:extra', 'modpack:example-pack:kubejs']);
    expect(messages()).toContain('已載入「Example Pack」的 2 組整合包文字');
  });

  it('merges a reloaded modpack with the same rules as a re-uploaded mod', async () => {
    await ws().addModpack(payload('1.0.0', { kubejs: { en: { a: 'Gear', b: 'Casing' }, zh: {} } }));
    ws().editEntry('modpack:example-pack:kubejs', 'a', '齒輪');
    await ws().addModpack(payload('1.1.0', { kubejs: { en: { a: 'Gear', c: 'New' }, zh: {} } }));
    expect(ws().mods).toHaveLength(1);
    expect(ws().mods[0]?.version).toBe('1.1.0');
    expect(ws().mods[0]?.entries.map((e) => [e.key, e.target, e.status])).toEqual([
      ['a', '齒輪', 'translated'],
      ['c', '', 'new'],
      ['b', '', 'obsolete'],
    ]);
  });

  it('keeps jar mods and KubeJS namespaces with the same name apart', async () => {
    await ws().addModpack(payload('1.0.0', { kubejs: { en: { a: 'Gear' }, zh: {} } }));
    await ws().addJars([makeJarFile('kubejs.jar', await makeJar({ 'assets/kubejs/lang/en_us.json': JSON.stringify({ k: 'v' }) }))]);
    expect(ws().pendingConflicts).toEqual([]);
    expect(ws().mods.map((m) => m.id).sort()).toEqual(['kubejs', 'modpack:example-pack:kubejs']);
    expect(ws().mods.find((m) => m.id === 'modpack:example-pack:kubejs')?.entries.map((e) => e.key)).toEqual(['a']);
  });

  it('tells the player when a modpack has no text to translate', async () => {
    await ws().addModpack(payload('1.0.0', {}));
    expect(ws().mods).toEqual([]);
    expect(messages()).toContain('「Example Pack」沒有需要翻譯的整合包文字');
  });
});
