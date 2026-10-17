import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ModSummary } from '../lib/summary';
import { useCatalogIndex } from './useCatalogIndex';

const mods: ModSummary[] = [{
  modId: 'create', name: 'Create', nameZh: null, summary: '', mcVersions: ['1.20.1'], loaders: ['forge'],
  status: 'reviewed', percent: 100, total: 1, updatedAt: '2026-10-15', icon: null, hasGuide: false, translated: 1, banner: null, downloads: null,
}];

afterEach(() => vi.restoreAllMocks());

describe('useCatalogIndex', () => {
  it('starts loading then becomes ready', async () => {
    const load = vi.fn(async () => mods);
    const { result } = renderHook(() => useCatalogIndex(load));
    expect(result.current.state).toEqual({ kind: 'loading' });
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'ready', mods }));
  });

  it('reports errors and logs them, then recovers on retry', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const load = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(mods);
    const { result } = renderHook(() => useCatalogIndex(load));
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'error' }));
    expect(error).toHaveBeenCalled();
    act(() => result.current.retry());
    expect(result.current.state).toEqual({ kind: 'loading' });
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'ready', mods }));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('aborts the in-flight request on unmount', () => {
    let seen: AbortSignal | undefined;
    const load = vi.fn((signal: AbortSignal) => {
      seen = signal;
      return new Promise<readonly ModSummary[]>(() => {});
    });
    const { unmount } = renderHook(() => useCatalogIndex(load));
    unmount();
    expect(seen?.aborted).toBe(true);
  });

  it('ignores a stale result after retry', async () => {
    let resolveFirst: (m: readonly ModSummary[]) => void = () => {};
    const load = vi
      .fn()
      .mockImplementationOnce(() => new Promise<readonly ModSummary[]>((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce(mods);
    const { result } = renderHook(() => useCatalogIndex(load));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'ready', mods }));
    await act(async () => resolveFirst([]));
    expect(result.current.state).toEqual({ kind: 'ready', mods });
  });
});
