import { useEffect, useState } from 'react';
import type { FetchLike } from '../islands/api';
import { modApiUrl } from '../lib/config';

export interface ModStrings {
  readonly en: Readonly<Record<string, string>>;
  readonly zh: Readonly<Record<string, string>>;
}

const cache = new Map<string, Promise<ModStrings | null>>();

export function clearModCache(): void {
  cache.clear();
}

/** 讀取已部署的 /api/v1/mods/<id>.json（原文與目前譯文）；失敗回 null，且不快取失敗 */
export function fetchModStrings(modId: string, fetchImpl: FetchLike): Promise<ModStrings | null> {
  const hit = cache.get(modId);
  if (hit) return hit;
  const pending = fetchImpl(modApiUrl(modId))
    .then(async (res) => {
      if (!res.ok) return null;
      const body = (await res.json()) as { en_us?: Record<string, string>; zh_tw?: Record<string, string> };
      return body.en_us && body.zh_tw ? { en: body.en_us, zh: body.zh_tw } : null;
    })
    .catch(() => null)
    .then((value) => {
      if (value === null) cache.delete(modId);
      return value;
    });
  cache.set(modId, pending);
  return pending;
}

export function useModStrings(modId: string, fetchImpl: FetchLike): ModStrings | null | 'loading' {
  const [state, setState] = useState<{ modId: string; value: ModStrings | null } | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchModStrings(modId, fetchImpl).then((value) => { if (alive) setState({ modId, value }); });
    return () => { alive = false; };
  }, [modId, fetchImpl]);
  return state?.modId === modId ? state.value : 'loading';
}

export function ownString(record: Readonly<Record<string, string>>, key: string): string | null {
  return Object.hasOwn(record, key) ? record[key] ?? null : null;
}
