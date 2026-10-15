import { type RefObject, useEffect, useRef, useState } from 'react';

export const PAGE_SIZE = 48;

/** 先顯示一批，哨兵進入視窗時再加一批；resetKey 改變時回到第一批。不支援 IntersectionObserver 時一次顯示全部 */
export function useIncrementalList<T>(
  items: readonly T[],
  resetKey: string,
  pageSize: number = PAGE_SIZE,
): { readonly visible: readonly T[]; readonly hasMore: boolean; readonly sentinelRef: RefObject<HTMLDivElement> } {
  const supported = typeof IntersectionObserver !== 'undefined';
  const [limit, setLimit] = useState(pageSize);
  const [prevKey, setPrevKey] = useState(resetKey);
  if (prevKey !== resetKey) {
    setPrevKey(resetKey);
    setLimit(pageSize);
  }
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = supported && limit < items.length;

  // limit 列入依賴：每加一批就重新 observe，哨兵若仍在視窗內，新 observer 的初始回呼會再加一批
  useEffect(() => {
    const el = sentinelRef.current;
    if (!hasMore || !el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setLimit((n) => n + pageSize);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, pageSize, limit]);

  return { visible: supported ? items.slice(0, limit) : items, hasMore, sentinelRef };
}
