import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { catalogModpackSchema } from '@mlf/core/modpack';
import type { ModpackPayload } from '../../islands/downloadModpack';
import { fetchModpackIndex } from '../modpack/modpackIndex';
import { clearAll } from '../store/persistence';
import { useToasts } from '../store/toastStore';
import { initialWorkspaceState, useWorkspace } from '../store/workspaceStore';
import { ModpackLoader } from './ModpackLoader';

const meta = catalogModpackSchema.parse({
  id: 'example-pack', name: 'Example Pack', nameZh: '範例整合包', summary: 's', authors: ['a'],
  links: { modrinth: 'https://modrinth.com/modpack/example-pack' },
  source: { platform: 'modrinth', projectId: 'AbCd1234', version: '1.0.0', mcVersion: '1.20.1', loader: 'forge' }, mods: [],
  translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null } }, updatedAt: '2026-10-17',
});
const payload: ModpackPayload = { meta, mods: [], kubejs: { kubejs: { en: { 'item.kubejs.gear': 'Gear' }, zh: {} } } };
const options = [
  { id: 'alpha-pack', name: 'Alpha Pack', nameZh: null },
  { id: 'example-pack', name: 'Example Pack', nameZh: '範例整合包' },
];

beforeEach(async () => {
  await clearAll();
  useWorkspace.setState(initialWorkspaceState);
  useToasts.setState({ toasts: [] });
});

describe('ModpackLoader', () => {
  it('lists modpacks and loads the chosen one into the workspace', async () => {
    const loadModpack = vi.fn(async (_id: string) => payload);
    render(<ModpackLoader loadIndex={vi.fn(async () => options)} loadModpack={loadModpack} />);
    await userEvent.selectOptions(await screen.findByLabelText('選擇整合包'), 'example-pack');
    expect(screen.getByRole('option', { name: 'Example Pack（範例整合包）' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '載入整合包' }));
    await waitFor(() => expect(useWorkspace.getState().mods.map((m) => m.id)).toEqual(['modpack:example-pack:kubejs']));
    expect(loadModpack).toHaveBeenCalledWith('example-pack');
  });

  it('renders nothing when no modpack has text to translate', async () => {
    const loadIndex = vi.fn(async () => []);
    const { container } = render(<ModpackLoader loadIndex={loadIndex} />);
    await waitFor(() => expect(loadIndex).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('tells the player when loading fails', async () => {
    const loadModpack = vi.fn(async (_id: string): Promise<ModpackPayload> => {
      throw new Error('boom');
    });
    render(<ModpackLoader loadIndex={vi.fn(async () => options)} loadModpack={loadModpack} />);
    await userEvent.click(await screen.findByRole('button', { name: '載入整合包' }));
    await waitFor(() => expect(useToasts.getState().toasts.map((x) => x.message)).toContain('整合包載入失敗，請稍後再試'));
    expect(useWorkspace.getState().mods).toEqual([]);
  });
});

describe('fetchModpackIndex', () => {
  it('lists only modpacks with KubeJS text and validates the payload', async () => {
    const body = {
      version: 1,
      modpacks: [
        { id: 'example-pack', name: 'Example Pack', nameZh: '範例整合包', summary: 's', kubejs: { total: 3, translated: 1, percent: 33 } },
        { id: 'no-text', name: 'No Text', nameZh: null, kubejs: null },
        { id: 'empty', name: 'Empty', nameZh: null, kubejs: { total: 0, translated: 0, percent: 0 } },
      ],
    };
    const ok = vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => body }));
    expect(await fetchModpackIndex(ok)).toEqual([{ id: 'example-pack', name: 'Example Pack', nameZh: '範例整合包' }]);
    expect(ok).toHaveBeenCalledWith('/api/v1/modpacks/index.json');
    const bad = vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => ({ version: 1, modpacks: [{ id: '../x', name: 'X', nameZh: null, kubejs: null }] }) }));
    await expect(fetchModpackIndex(bad)).rejects.toThrow();
    await expect(fetchModpackIndex(vi.fn(async (_url: string) => ({ ok: false, status: 500, json: async () => ({}) })))).rejects.toThrow('HTTP 500');
  });

  it('also lists modpacks that only have FTB quest text', async () => {
    const body = {
      version: 1,
      modpacks: [
        { id: 'quests', name: 'Quests', nameZh: null, kubejs: null, ftbquests: { status: 'supported', total: 6, translated: 3, percent: 50 } },
        { id: 'old', name: 'Old', nameZh: null, kubejs: null, ftbquests: { status: 'unsupported-version' } },
        { id: 'none', name: 'None', nameZh: null, kubejs: null, ftbquests: null },
      ],
    };
    const ok = vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => body }));
    expect(await fetchModpackIndex(ok)).toEqual([{ id: 'quests', name: 'Quests', nameZh: null }]);
    const bad = { version: 1, modpacks: [{ id: 'x', name: 'X', nameZh: null, kubejs: null, ftbquests: { status: 'supported', total: -1 } }] };
    await expect(fetchModpackIndex(vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => bad })))).rejects.toThrow();
  });
});
