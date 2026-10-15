import { useEffect } from 'react';
import { create } from 'zustand';
import { MOD_ID_PATTERN } from '@mlf/core/catalog';

export const CART_STORAGE_KEY = 'mlf.cart.v1';

function readCart(): string[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const ids = value.filter((x): x is string => typeof x === 'string' && MOD_ID_PATTERN.test(x));
    return [...new Set(ids)];
  } catch {
    return [];
  }
}

function writeCart(items: readonly string[]): void {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // localStorage 不可用（私密模式等）：僅保留在記憶體
  }
}

interface CartState {
  readonly items: readonly string[];
  readonly hydrated: boolean;
  hydrate: () => void;
  add: (modId: string) => void;
  remove: (modId: string) => void;
  clear: () => void;
}

export const useCart = create<CartState>()((set, get) => {
  const commit = (items: readonly string[]) => {
    writeCart(items);
    set({ items });
  };
  return {
    items: [],
    hydrated: false,
    hydrate: () => set({ items: readCart(), hydrated: true }),
    add: (modId) => {
      if (!get().items.includes(modId)) commit([...get().items, modId]);
    },
    remove: (modId) => commit(get().items.filter((id) => id !== modId)),
    clear: () => commit([]),
  };
});

/** 在 island 掛載後從 localStorage 載入購物車，並同步其他分頁的變更 */
export function useHydratedCart(): CartState {
  const state = useCart();
  useEffect(() => {
    if (!useCart.getState().hydrated) useCart.getState().hydrate();
    const onStorage = (e: StorageEvent) => {
      if (e.key === CART_STORAGE_KEY) useCart.getState().hydrate();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  return state;
}
