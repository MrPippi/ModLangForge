import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useViewMode, VIEW_STORAGE_KEY } from './useViewMode';

const fakeStorage = (init: Record<string, string> = {}, opts: { getThrows?: boolean; setThrows?: boolean } = {}) => {
  const data = { ...init };
  return {
    getItem: (k: string) => {
      if (opts.getThrows) throw new Error('denied');
      return data[k] ?? null;
    },
    setItem: (k: string, v: string) => {
      if (opts.setThrows) throw new Error('denied');
      data[k] = v;
    },
  } as unknown as Storage;
};

describe('useViewMode', () => {
  it('defaults to card and ignores unknown or unreadable values', () => {
    expect(renderHook(() => useViewMode(fakeStorage({ [VIEW_STORAGE_KEY]: 'grid' }))).result.current[0]).toBe('card');
    expect(renderHook(() => useViewMode(fakeStorage({}, { getThrows: true }))).result.current[0]).toBe('card');
    expect(renderHook(() => useViewMode(null)).result.current[0]).toBe('card');
  });

  it('restores a stored list mode after mount', () => {
    const { result } = renderHook(() => useViewMode(fakeStorage({ [VIEW_STORAGE_KEY]: 'list' })));
    expect(result.current[0]).toBe('list');
  });

  it('remembers the chosen mode', () => {
    const storage = fakeStorage();
    const { result } = renderHook(() => useViewMode(storage));
    act(() => result.current[1]('list'));
    expect(result.current[0]).toBe('list');
    expect(storage.getItem(VIEW_STORAGE_KEY)).toBe('list');
  });

  it('still switches when storage cannot be written', () => {
    const { result } = renderHook(() => useViewMode(fakeStorage({}, { setThrows: true })));
    act(() => result.current[1]('list'));
    expect(result.current[0]).toBe('list');
  });
});
