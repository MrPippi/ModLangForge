import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeJar, makeJarFile } from '@mlf/core/test/makeJar';
import { t } from '../i18n/zh-TW';
import { clearAll, loadAll } from './persistence';
import { useToasts } from './toastStore';
import { flushPendingSaves, initialWorkspaceState, useWorkspace } from './workspaceStore';

async function jarFile(name: string, modId: string, source: Record<string, string>): Promise<File> {
  return makeJarFile(name, await makeJar({ [`assets/${modId}/lang/en_us.json`]: JSON.stringify(source) }));
}

const ws = () => useWorkspace.getState();

beforeEach(async () => {
  await clearAll();
  useWorkspace.setState(initialWorkspaceState);
  useToasts.setState({ toasts: [] });
});

describe('workspace store', () => {
  it('adds new mods, persists them and activates the first', async () => {
    await ws().addJars([await jarFile('a.jar', 'alpha', { k: 'v' }), await jarFile('b.jar', 'beta', { k: 'v' })]);
    expect(ws().mods.map((m) => m.modId)).toEqual(['alpha', 'beta']);
    expect(ws().activeModId).toBe('alpha');
    expect((await loadAll()).map((m) => m.id).sort()).toEqual(['alpha', 'beta']);
  });

  it('queues a conflict when the same modId is loaded again', async () => {
    await ws().addJars([await jarFile('a.jar', 'alpha', { k: 'v' })]);
    await ws().addJars([await jarFile('a2.jar', 'alpha', { k: 'v', k2: 'v2' })]);
    expect(ws().mods).toHaveLength(1);
    expect(ws().pendingConflicts.map((c) => c.jarName)).toEqual(['a2.jar']);
  });

  it('resolves conflict by merge, keeping translations', async () => {
    await ws().addJars([await jarFile('a.jar', 'alpha', { k: 'v' })]);
    ws().editEntry('alpha', 'k', '值');
    await ws().addJars([await jarFile('a2.jar', 'alpha', { k: 'v', k2: 'v2' })]);
    await ws().resolveConflict('alpha', 'merge');
    const mod = ws().mods[0];
    expect(mod?.jarName).toBe('a2.jar');
    expect(mod?.entries.map((e) => [e.key, e.target, e.status])).toEqual([['k', '值', 'translated'], ['k2', '', 'new']]);
    expect(ws().pendingConflicts).toHaveLength(0);
  });

  it('resolves conflict by replace or skip', async () => {
    await ws().addJars([await jarFile('a.jar', 'alpha', { k: 'v' })]);
    ws().editEntry('alpha', 'k', '值');
    await ws().addJars([await jarFile('a2.jar', 'alpha', { k: 'v' })]);
    await ws().resolveConflict('alpha', 'skip');
    expect(ws().mods[0]?.jarName).toBe('a.jar');
    await ws().addJars([await jarFile('a3.jar', 'alpha', { k: 'v' })]);
    await ws().resolveConflict('alpha', 'replace');
    expect(ws().mods[0]?.entries[0]?.target).toBe('');
  });

  it('reports broken jars as toasts and still loads the good ones', async () => {
    const bad = makeJarFile('bad.jar', new TextEncoder().encode('nope'));
    await ws().addJars([bad, await jarFile('a.jar', 'alpha', { k: 'v' })]);
    expect(ws().mods).toHaveLength(1);
    expect(useToasts.getState().toasts.map((x) => x.message)).toEqual([t.errors.notZip('bad.jar')]);
    expect(ws().loading).toBe(false);
  });

  it('saves edits and restores them on init', async () => {
    await ws().addJars([await jarFile('a.jar', 'alpha', { k: 'v' })]);
    ws().editEntry('alpha', 'k', '值');
    await flushPendingSaves();
    useWorkspace.setState(initialWorkspaceState);
    await ws().init();
    expect(ws().mods[0]?.entries[0]?.target).toBe('值');
    expect(ws().persistent).toBe(true);
  });

  it('persists each committed edit immediately without waiting for a flush', async () => {
    await ws().addJars([await jarFile('a.jar', 'alpha', { k: 'v' })]);
    ws().editEntry('alpha', 'k', '立即');
    await vi.waitFor(async () => {
      expect((await loadAll())[0]?.entries[0]?.target).toBe('立即');
    }, { timeout: 200 });
  });

  it('removes a mod from state and storage', async () => {
    await ws().addJars([await jarFile('a.jar', 'alpha', { k: 'v' }), await jarFile('b.jar', 'beta', { k: 'v' })]);
    await ws().removeMod('alpha');
    expect(ws().mods.map((m) => m.id)).toEqual(['beta']);
    expect(ws().activeModId).toBe('beta');
    expect((await loadAll()).map((m) => m.id)).toEqual(['beta']);
  });

  it('clears the workspace', async () => {
    await ws().addJars([await jarFile('a.jar', 'alpha', { k: 'v' })]);
    await ws().clearWorkspace();
    expect(ws().mods).toHaveLength(0);
    expect(ws().activeModId).toBeNull();
    expect(await loadAll()).toHaveLength(0);
  });
});
