import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CART_STORAGE_KEY, useCart } from './cartStore';
import { buildPack, fetchModData, packFileName, type ModPayload } from './downloadPack';
import PackPage from './PackPage';
import { pickCommonVersion, sortVersions } from './pickVersion';

const meta = (modId: string, mcVersions: string[], format: 'json' | 'lang' = 'json') => ({
  modId, name: modId.toUpperCase(), aliases: [], summary: 's', authors: ['a'],
  links: { modrinth: `https://modrinth.com/mod/${modId}` }, mcVersions, loaders: ['forge'], format,
  sourceVersions: [{ mcVersion: mcVersions[0], loader: 'forge' }],
  translation: { status: 'partial', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null }, contributors: [] },
  updatedAt: '2026-10-15',
});

const body = (modId: string, mcVersions: string[], format: 'json' | 'lang' = 'json') => ({
  version: 1, meta: meta(modId, mcVersions, format), en_us: { a: 'Apple', b: 'Banana' }, zh_tw: { a: '蘋果' },
});

function fakeFetch(bodies: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const id = /mods\/(.+)\.json$/.exec(url)?.[1] ?? '';
    const found = bodies[id];
    return { ok: found !== undefined, status: found === undefined ? 404 : 200, json: async () => found };
  });
}

beforeEach(() => {
  useCart.setState({ items: [], hydrated: false });
});

describe('pickCommonVersion / sortVersions', () => {
  it('picks the newest common version', () => {
    expect(pickCommonVersion([['1.20.1', '1.21.1'], ['1.21.1', '1.20.1', '1.19.2']])).toEqual({ version: '1.21.1', fallback: false });
  });

  it('falls back to default when nothing is shared', () => {
    expect(pickCommonVersion([['1.12.2'], ['1.21.1']])).toEqual({ version: '1.20.1', fallback: true });
  });

  it('handles empty input and sorts newest first', () => {
    expect(pickCommonVersion([])).toEqual({ version: '1.20.1', fallback: false });
    expect(sortVersions(['1.12.2', 'x', '1.21.1', '1.12.2'])).toEqual(['1.21.1', '1.12.2', 'x']);
  });
});

describe('cart store', () => {
  it('persists to localStorage and ignores duplicates', () => {
    useCart.getState().add('create');
    useCart.getState().add('create');
    useCart.getState().add('jei');
    useCart.getState().remove('create');
    expect(JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? '[]')).toEqual(['jei']);
  });

  it.each([['not json'], ['{"a":1}'], ['[1, "ok", "BAD ID", "ok"]']])('hydrates safely from %s', (raw) => {
    localStorage.setItem(CART_STORAGE_KEY, raw);
    useCart.getState().hydrate();
    expect(useCart.getState().items).toEqual(raw.startsWith('[') ? ['ok'] : []);
  });
});

describe('downloadPack', () => {
  it('fetches and validates payloads; 404 → null', async () => {
    const f = fakeFetch({ create: body('create', ['1.20.1']), bad: { meta: {}, en_us: {}, zh_tw: {} } });
    expect((await fetchModData('create', f))?.meta.modId).toBe('create');
    expect(await fetchModData('missing', f)).toBeNull();
    await expect(fetchModData('bad', f)).rejects.toThrow();
  });

  it('names files and builds merged zip with legacy .lang naming', async () => {
    expect(packFileName(['create'], '1.20.1')).toBe('create-zh_tw-1.20.1.zip');
    expect(packFileName(['a', 'b'], '1.21.1')).toBe('ModLangForge-zh_tw-1.21.1.zip');
    const f = fakeFetch({ create: body('create', ['1.20.1']), old: body('old', ['1.12.2'], 'lang') });
    const payloads = [await fetchModData('create', f), await fetchModData('old', f)] as ModPayload[];
    const result = await buildPack(payloads, '1.12.2');
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(await zip.file('assets/old/lang/zh_tw.lang')?.async('string')).toBe('a=蘋果\nb=Banana\n');
    expect(JSON.parse((await zip.file('pack.mcmeta')?.async('string')) ?? '{}').pack.pack_format).toBe(3);
  });
});

describe('PackPage', () => {
  it('shows empty state', async () => {
    render(<PackPage fetchImpl={fakeFetch({})} onSave={vi.fn()} />);
    expect(await screen.findByText(/合併包是空的/)).toBeInTheDocument();
  });

  it('lists mods, marks removed ones and downloads the rest', async () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(['create', 'gone', 'jei']));
    const onSave = vi.fn();
    render(<PackPage fetchImpl={fakeFetch({ create: body('create', ['1.20.1', '1.21.1']), jei: body('jei', ['1.21.1']) })} onSave={onSave} />);
    expect(await screen.findByText('此模組已下架')).toBeInTheDocument();
    expect(await screen.findByText('CREATE')).toBeInTheDocument();
    expect(screen.getByLabelText('Minecraft 版本')).toHaveValue('1.21.1');
    await userEvent.click(screen.getByRole('button', { name: '下載合併資源包（2 個模組）' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0].fileName).toBe('ModLangForge-zh_tw-1.21.1.zip');
  });

  it('fetches each mod only once even when responses arrive slowly', async () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(['create', 'jei', 'old']));
    const resolvers = new Map<string, () => void>();
    const inner = fakeFetch({ create: body('create', ['1.20.1']), jei: body('jei', ['1.20.1']), old: body('old', ['1.20.1']) });
    const slowFetch = vi.fn((url: string) => new Promise<Awaited<ReturnType<typeof inner>>>((resolve) => {
      resolvers.set(url, () => void inner(url).then(resolve));
    }));
    render(<PackPage fetchImpl={slowFetch} onSave={vi.fn()} />);
    await waitFor(() => expect(resolvers.size).toBe(3));
    for (const resolve of [...resolvers.values()]) {
      resolve();
      await new Promise((r) => setTimeout(r, 10));
    }
    await screen.findByText('OLD');
    expect(slowFetch).toHaveBeenCalledTimes(3);
  });

  it('warns when selected mods share no version until the user picks one', async () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(['a', 'b']));
    render(<PackPage fetchImpl={fakeFetch({ a: body('a', ['1.16.5']), b: body('b', ['1.21.1']) })} onSave={vi.fn()} />);
    expect(await screen.findByText(/沒有共同支援的版本/)).toBeInTheDocument();
    expect(screen.getByLabelText('Minecraft 版本')).toHaveValue('1.20.1');
    await userEvent.selectOptions(screen.getByLabelText('Minecraft 版本'), '1.21.1');
    expect(screen.queryByText(/沒有共同支援的版本/)).not.toBeInTheDocument();
  });

  it('blocks download while mods are loading', async () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(['create', 'jei']));
    const inner = fakeFetch({ create: body('create', ['1.20.1']) });
    const partial = vi.fn((url: string) => (url.includes('jei') ? new Promise<never>(() => {}) : inner(url)));
    render(<PackPage fetchImpl={partial} onSave={vi.fn()} />);
    await screen.findByText('CREATE');
    expect(screen.getByRole('button', { name: /下載合併資源包/ })).toBeDisabled();
  });

  it('blocks download on fetch errors and lets the user retry', async () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(['create', 'jei']));
    let failJei = true;
    const inner = fakeFetch({ create: body('create', ['1.20.1']), jei: body('jei', ['1.20.1']) });
    const flaky = vi.fn(async (url: string) => {
      if (url.includes('jei') && failJei) return { ok: false, status: 500, json: async () => ({}) };
      return inner(url);
    });
    const onSave = vi.fn();
    render(<PackPage fetchImpl={flaky} onSave={onSave} />);
    expect(await screen.findByText('1 個模組未載入，請重試或移除後再下載。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /下載合併資源包/ })).toBeDisabled();
    failJei = false;
    await userEvent.click(screen.getByRole('button', { name: '重試' }));
    await screen.findByText('JEI');
    await userEvent.click(screen.getByRole('button', { name: '下載合併資源包（2 個模組）' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
  });

  it('warns when there is no common version and lets the user remove items', async () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(['create', 'old']));
    render(<PackPage fetchImpl={fakeFetch({ create: body('create', ['1.21.1']), old: body('old', ['1.12.2']) })} onSave={vi.fn()} />);
    expect(await screen.findByText(/沒有共同支援的版本/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: '移除' })[1]!);
    await waitFor(() => expect(screen.queryByText(/沒有共同支援的版本/)).not.toBeInTheDocument());
    expect(useCart.getState().items).toEqual(['create']);
  });
});
