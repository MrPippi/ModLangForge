import { useEffect, useState } from 'react';
import type { FetchLike } from '../islands/api';

const INDEX_URL = '/api/v1/index.json';

export interface ModEntry {
  readonly modId: string;
  readonly name: string;
  readonly icon: string | null;
}

let cache: Promise<readonly ModEntry[]> | null = null;

/** 測試用：清掉快取 */
export function clearModNames(): void {
  cache = null;
}

function toEntry(m: unknown): ModEntry[] {
  if (typeof m !== 'object' || m === null) return [];
  const { modId, name, icon } = m as { modId?: unknown; name?: unknown; icon?: unknown };
  if (typeof modId !== 'string' || typeof name !== 'string') return [];
  return [{ modId, name, icon: typeof icon === 'string' ? icon : null }];
}

async function loadMods(fetchImpl: FetchLike): Promise<readonly ModEntry[]> {
  try {
    const res = await fetchImpl(INDEX_URL);
    if (!res.ok) return [];
    const body = (await res.json()) as { mods?: unknown };
    if (!Array.isArray(body.mods)) return [];
    return body.mods.flatMap(toEntry).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** 模組 ID 或名稱包含關鍵字（不分大小寫）；空白關鍵字全部符合 */
export function matchesMod(mod: ModEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q === '' || mod.modId.toLowerCase().includes(q) || mod.name.toLowerCase().includes(q);
}

/** 站上所有模組（依英文名稱排序）；讀不到時回傳空清單 */
export function useModList(fetchImpl: FetchLike): readonly ModEntry[] {
  const [mods, setMods] = useState<readonly ModEntry[]>([]);
  useEffect(() => {
    let alive = true;
    cache ??= loadMods(fetchImpl);
    void cache.then((m) => { if (alive) setMods(m); });
    return () => { alive = false; };
  }, [fetchImpl]);
  return mods;
}

