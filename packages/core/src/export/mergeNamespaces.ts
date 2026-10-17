import type { ModProject, TranslationEntry } from '../types';

function combine(group: readonly ModProject[]): ModProject {
  const [first] = group;
  if (!first) throw new Error('empty namespace group');
  const byKey = new Map<string, TranslationEntry>();
  for (const p of group) {
    for (const e of p.entries) {
      if (e.status === 'obsolete' && byKey.has(e.key)) continue;
      byKey.set(e.key, e);
    }
  }
  const guide = group.find((p) => p.guide)?.guide;
  const { guide: _first, ...base } = first;
  return { ...base, entries: [...byKey.values()], ...(guide ? { guide } : {}) };
}

/**
 * 同一命名空間（modId）的專案合成一個，避免資源包中同路徑的語言檔互相覆蓋。
 * 條目依專案順序合併、同 key 以後者為準（後者的 obsolete 條目不覆蓋）；格式取第一個；手冊取第一個有手冊的專案。
 */
export function mergeSameNamespace(projects: readonly ModProject[]): ModProject[] {
  const groups = new Map<string, readonly ModProject[]>();
  for (const p of projects) groups.set(p.modId, [...(groups.get(p.modId) ?? []), p]);
  return [...groups.values()].map((group) => (group.length === 1 && group[0] ? group[0] : combine(group)));
}
