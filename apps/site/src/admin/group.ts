import type { AdminSuggestion } from './adminApi';

export interface KeyGroup {
  readonly key: string;
  readonly items: readonly AdminSuggestion[];
}

export interface ModGroup {
  readonly modId: string;
  readonly keys: readonly KeyGroup[];
}

/** 依模組、再依 key 分組（保持 API 回傳順序） */
export function groupSuggestions(list: readonly AdminSuggestion[]): ModGroup[] {
  const modIds = [...new Set(list.map((x) => x.modId))];
  return modIds.map((modId) => {
    const inMod = list.filter((x) => x.modId === modId);
    const keys = [...new Set(inMod.map((x) => x.key))];
    return { modId, keys: keys.map((key) => ({ key, items: inMod.filter((x) => x.key === key) })) };
  });
}
