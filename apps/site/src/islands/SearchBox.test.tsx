import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchBox from './SearchBox';
import { createSearchClient, MAX_RESULTS, type PagefindLike, type SearchClient } from './searchClient';

function fakePagefind(pages: { url: string; title: string; modId: string; percent?: string; builtin?: string }[]): PagefindLike {
  return {
    search: async (q) => ({
      results: pages
        .filter((p) => `${p.title} ${p.modId}`.toLowerCase().includes(q.toLowerCase()))
        .map((p) => ({ data: async () => ({ url: p.url, meta: { title: p.title, modId: p.modId, ...(p.percent ? { percent: p.percent } : {}), ...(p.builtin ? { builtin: p.builtin } : {}) } }) })),
    }),
  };
}

const pages = [
  { url: '/mods/create/', title: 'Create（機械動力）', modId: 'create', percent: '100' },
  { url: '/mods/jei/', title: 'Just Enough Items（物品管理器）', modId: 'jei', percent: '63' },
  { url: '/mods/litematica/', title: 'Litematica', modId: 'litematica', builtin: 'true' },
];

describe('createSearchClient', () => {
  it('maps pagefind hits to results and ignores blank queries', async () => {
    const client = createSearchClient(async () => fakePagefind(pages));
    expect(await client.search('  ')).toEqual([]);
    expect(await client.search('機械')).toEqual([{ modId: 'create', title: 'Create（機械動力）', url: '/mods/create/', percent: 100, builtin: false }]);
  });

  it('limits results', async () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ url: `/mods/m${i}/`, title: `Mod ${i}`, modId: `m${i}`, percent: 'x' }));
    const results = await createSearchClient(async () => fakePagefind(many)).search('mod');
    expect(results).toHaveLength(MAX_RESULTS);
    expect(results[0]?.percent).toBeNull();
  });

  it('throws SearchUnavailableError when the index cannot load, then retries', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('404')).mockResolvedValue(fakePagefind(pages));
    const client = createSearchClient(load);
    await expect(client.search('create')).rejects.toMatchObject({ name: 'SearchUnavailableError' });
    expect(await client.search('create')).toHaveLength(1);
  });
});

describe('SearchBox', () => {
  const client: SearchClient = createSearchClient(async () => fakePagefind(pages));

  it('shows matching results', async () => {
    render(<SearchBox client={client} />);
    await userEvent.type(screen.getByLabelText('搜尋模組'), 'jei');
    expect(await screen.findByRole('link', { name: /Just Enough Items/ })).toHaveAttribute('href', '/mods/jei/');
  });

  it('shows the built-in tag instead of a percentage for built-in mods', async () => {
    render(<SearchBox client={client} />);
    await userEvent.type(screen.getByLabelText('搜尋模組'), 'litematica');
    const link = await screen.findByRole('link', { name: /Litematica/ });
    expect(link).toHaveTextContent('內建繁中');
    expect(link).not.toHaveTextContent('%');
  });

  it('keeps the percentage for regular mods', async () => {
    render(<SearchBox client={client} />);
    await userEvent.type(screen.getByLabelText('搜尋模組'), 'jei');
    const link = await screen.findByRole('link', { name: /Just Enough Items/ });
    expect(link).toHaveTextContent('63%');
    expect(link).not.toHaveTextContent('內建繁中');
  });

  it('offers the translate entry when nothing matches', async () => {
    render(<SearchBox client={client} />);
    await userEvent.type(screen.getByLabelText('搜尋模組'), 'nothing');
    expect(await screen.findByText('找不到「nothing」的翻譯')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '自己動手翻' })).toHaveAttribute('href', '/translate/');
    expect(screen.getByRole('link', { name: /許願翻譯/ }).getAttribute('href')).toContain('nothing');
  });

  it('falls back to the catalog link when search is unavailable', async () => {
    const broken = createSearchClient(() => Promise.reject(new Error('missing')));
    render(<SearchBox client={broken} />);
    await userEvent.type(screen.getByLabelText('搜尋模組'), 'create');
    expect(await screen.findByRole('link', { name: '瀏覽全部模組' })).toHaveAttribute('href', '/mods/');
  });
});
