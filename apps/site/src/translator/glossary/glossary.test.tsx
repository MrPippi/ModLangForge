import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { fetchGlossary, GLOSSARY_URL, type GlossaryLookup } from './glossaryClient';
import { useGlossary } from './useGlossary';

const payload = {
  version: 1,
  global: [{ en: 'Shaft', zh: '軸' }, { en: 'Redstone', zh: '紅石' }],
  mods: { create: [{ en: 'Shaft', zh: '傳動軸' }] },
};

const fakeFetch = (body: unknown, ok = true) =>
  vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response);

afterEach(() => vi.restoreAllMocks());

describe('fetchGlossary', () => {
  it('returns a lookup that merges module terms over global ones', async () => {
    const f = fakeFetch(payload);
    const lookup = await fetchGlossary(undefined, f);
    expect(f).toHaveBeenCalledWith(GLOSSARY_URL, { signal: undefined });
    expect(lookup('create').map((t) => t.zh)).toEqual(['傳動軸', '紅石']);
    expect(lookup('jei').map((t) => t.zh)).toEqual(['軸', '紅石']);
  });

  it('never reads prototype properties for unusual mod ids', async () => {
    const lookup = await fetchGlossary(undefined, fakeFetch(payload));
    expect(lookup('constructor').map((t) => t.zh)).toEqual(['軸', '紅石']);
    expect(lookup('__proto__').map((t) => t.zh)).toEqual(['軸', '紅石']);
  });

  it('rejects non-2xx responses and invalid payloads', async () => {
    await expect(fetchGlossary(undefined, fakeFetch(payload, false))).rejects.toThrow();
    await expect(fetchGlossary(undefined, fakeFetch({ version: 2, global: [], mods: {} }))).rejects.toThrow();
  });
});

describe('useGlossary', () => {
  it('starts as null and resolves to the lookup', async () => {
    const lookup: GlossaryLookup = () => [];
    const { result } = renderHook(() => useGlossary(async () => lookup));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(lookup));
  });

  it('stays null and logs when loading fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const load = vi.fn(async () => { throw new Error('boom'); });
    const { result } = renderHook(() => useGlossary(load));
    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('aborts loading on unmount', () => {
    let seen: AbortSignal | undefined;
    const { unmount } = renderHook(() =>
      useGlossary((signal) => { seen = signal; return new Promise<GlossaryLookup>(() => {}); }));
    unmount();
    expect(seen?.aborted).toBe(true);
  });
});
