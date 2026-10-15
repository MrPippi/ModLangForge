import { useCallback, useEffect, useState } from 'react';
import type { ModSummary } from '../lib/summary';
import { fetchCatalogIndex } from './catalogIndex';

export type CatalogIndexLoader = (signal: AbortSignal) => Promise<readonly ModSummary[]>;

export type CatalogIndexState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly mods: readonly ModSummary[] }
  | { readonly kind: 'error' };

const LOADING: CatalogIndexState = { kind: 'loading' };

/** 載入完整目錄；load 必須是穩定參考（模組層級函式或 useCallback） */
export function useCatalogIndex(load: CatalogIndexLoader = fetchCatalogIndex): {
  readonly state: CatalogIndexState;
  readonly retry: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CatalogIndexState>(LOADING);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
      (mods) => {
        if (!controller.signal.aborted) setState({ kind: 'ready', mods });
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        console.error('[ModsBrowser] 目錄載入失敗', err);
        setState({ kind: 'error' });
      },
    );
    return () => controller.abort();
  }, [load, attempt]);

  const retry = useCallback(() => {
    setState(LOADING);
    setAttempt((n) => n + 1);
  }, []);
  return { state, retry };
}
