import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import type { ModSummary } from '../lib/summary';
import ModsBrowser from './ModsBrowser';

const mod = (modId: string, over: Partial<ModSummary> = {}): ModSummary => ({
  modId, name: modId, nameZh: null, summary: '', mcVersions: ['1.20.1'], loaders: ['forge'],
  status: 'partial', percent: 50, total: 2, updatedAt: '2026-10-01', icon: null, hasGuide: false, ...over,
});

const mods = [
  mod('alpha', { loaders: ['fabric'], status: 'reviewed', percent: 90 }),
  mod('beta', { mcVersions: ['1.21.1', '1.20.1'], percent: 100 }),
  mod('gamma', { mcVersions: ['1.12.2'], status: 'reviewed', percent: 100 }),
];

const response = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response;

function stubIndex(list: readonly ModSummary[]) {
  const f = vi.fn(async () => response({ version: 1, generatedAt: 'x', mods: list }));
  vi.stubGlobal('fetch', f);
  return f;
}

const names = () =>
  within(screen.getByRole('list', { name: '模組清單' }))
    .getAllByRole('listitem')
    .map((li) => li.querySelector('.font-semibold')?.textContent);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ModsBrowser', () => {
  it('shows the SSR slice with disabled controls while loading', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    render(<ModsBrowser initial={mods.slice(0, 1)} total={3} />);
    expect(names()).toEqual(['alpha']);
    expect(screen.getByText('共 3 個模組')).toBeInTheDocument();
    expect(screen.getByText('載入中…')).toBeInTheDocument();
    expect(screen.getByLabelText('翻譯狀態')).toBeDisabled();
    expect(screen.getByLabelText('排序')).toBeDisabled();
  });

  it('replaces the SSR slice with the full catalog once loaded', async () => {
    stubIndex(mods);
    render(<ModsBrowser initial={mods.slice(0, 1)} total={3} />);
    expect(await screen.findByText('gamma')).toBeInTheDocument();
    expect(names()).toEqual(['alpha', 'beta', 'gamma']);
    expect(screen.getByLabelText('翻譯狀態')).toBeEnabled();
    expect(screen.queryByText('載入中…')).not.toBeInTheDocument();
  });

  it('filters by status and sorts by percent', async () => {
    stubIndex(mods);
    render(<ModsBrowser initial={[]} total={3} />);
    await screen.findByText('gamma');
    await userEvent.selectOptions(screen.getByLabelText('翻譯狀態'), 'reviewed');
    expect(names()).toEqual(['alpha', 'gamma']);
    await userEvent.selectOptions(screen.getByLabelText('排序'), 'percent');
    expect(names()).toEqual(['gamma', 'alpha']);
    expect(screen.getByText('共 2 個模組')).toBeInTheDocument();
  });

  it('shows count and empty state after filtering', async () => {
    stubIndex(mods);
    render(<ModsBrowser initial={[]} total={3} />);
    await screen.findByText('gamma');
    await userEvent.selectOptions(screen.getByLabelText('模組載入器'), 'quilt');
    expect(screen.getByText('沒有符合條件的模組')).toBeInTheDocument();
  });

  it('handles an empty catalog', async () => {
    stubIndex([]);
    render(<ModsBrowser initial={[]} total={0} />);
    expect(await screen.findByText('沒有符合條件的模組')).toBeInTheDocument();
    expect(screen.getByText('共 0 個模組')).toBeInTheDocument();
  });

  it('lists versions newest first', async () => {
    stubIndex(mods);
    render(<ModsBrowser initial={[]} total={3} />);
    await screen.findByText('gamma');
    const options = Array.from((screen.getByLabelText('Minecraft 版本') as HTMLSelectElement).options).map((o) => o.value);
    expect(options).toEqual(['', '1.21.1', '1.20.1', '1.12.2']);
  });

  it('keeps the SSR slice on failure and recovers on retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = vi
      .fn()
      .mockResolvedValueOnce(response({}, false))
      .mockResolvedValueOnce(response({ version: 1, generatedAt: 'x', mods }));
    vi.stubGlobal('fetch', f);
    render(<ModsBrowser initial={mods.slice(0, 1)} total={3} />);
    expect(await screen.findByText('模組清單載入失敗。')).toBeInTheDocument();
    expect(names()).toEqual(['alpha']);
    expect(screen.getByRole('link', { name: '改用搜尋' })).toHaveAttribute('href', '/');
    await userEvent.click(screen.getByRole('button', { name: '重試' }));
    expect(await screen.findByText('gamma')).toBeInTheDocument();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('server render shows the SSR slice without interactive controls or loading state', () => {
    const html = renderToString(<ModsBrowser initial={mods.slice(0, 1)} total={3} />);
    expect(html).toContain('alpha');
    expect(html).toContain('共 3 個模組');
    expect(html).not.toContain('<select');
    expect(html).not.toContain('載入中');
  });

  it('announces the result count politely', async () => {
    stubIndex(mods);
    render(<ModsBrowser initial={[]} total={3} />);
    await screen.findByText('gamma');
    expect(screen.getByText('共 3 個模組')).toHaveAttribute('aria-live', 'polite');
  });

  it('keeps focus in the status region after retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = vi
      .fn()
      .mockResolvedValueOnce(response({}, false))
      .mockImplementationOnce(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', f);
    render(<ModsBrowser initial={mods.slice(0, 1)} total={3} />);
    await userEvent.click(await screen.findByRole('button', { name: '重試' }));
    const region = screen.getByText('載入中…').closest('[tabindex="-1"]');
    expect(region).not.toBeNull();
    expect(document.activeElement).toBe(region);
    expect(region).toHaveAttribute('aria-live', 'polite');
  });
});
