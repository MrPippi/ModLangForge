import { useCallback, useMemo, useState } from 'react';
import { useHydrated } from './useHydrated';

export type ViewMode = 'card' | 'list';
export const VIEW_STORAGE_KEY = 'mlf:mods-view';

function resolveStorage(storage: Storage | null | undefined): Storage | null {
  if (storage !== undefined) return storage;
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readMode(storage: Storage | null): ViewMode {
  try {
    return storage?.getItem(VIEW_STORAGE_KEY) === 'list' ? 'list' : 'card';
  } catch {
    return 'card';
  }
}

/** 目錄顯示方式；hydration 前一律 card（與伺服器輸出一致），之後才讀記住的值 */
export function useViewMode(storage?: Storage | null): readonly [ViewMode, (mode: ViewMode) => void] {
  const hydrated = useHydrated();
  const [chosen, setChosen] = useState<ViewMode | null>(null);
  const stored = useMemo(() => (hydrated ? readMode(resolveStorage(storage)) : 'card'), [hydrated, storage]);
  const choose = useCallback(
    (next: ViewMode) => {
      setChosen(next);
      try {
        resolveStorage(storage)?.setItem(VIEW_STORAGE_KEY, next);
      } catch {
        // 儲存被停用時只是不記住，不影響切換
      }
    },
    [storage],
  );
  return [chosen ?? stored, choose] as const;
}
