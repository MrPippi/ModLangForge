import { useEffect, useState } from 'react';
import { fetchGlossary, type GlossaryLookup } from './glossaryClient';

/** 載入術語表一次；失敗時維持 null（不顯示提示）並記錄錯誤。load 必須是穩定參考 */
export function useGlossary(load: (signal: AbortSignal) => Promise<GlossaryLookup> = fetchGlossary): GlossaryLookup | null {
  const [lookup, setLookup] = useState<GlossaryLookup | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
      (fn) => {
        if (!controller.signal.aborted) setLookup(() => fn);
      },
      (err: unknown) => {
        if (!controller.signal.aborted) console.error('[translator] 術語表載入失敗', err);
      },
    );
    return () => controller.abort();
  }, [load]);
  return lookup;
}
