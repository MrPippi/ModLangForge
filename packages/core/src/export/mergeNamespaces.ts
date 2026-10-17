import { parseModpackProjectId } from '../modpack/project';
import type { ModProject, TranslationEntry } from '../types';

/** KubeJS 專案排在後面，使其在同 key 衝突時勝出 */
function kubejsLast(projects: readonly ModProject[]): ModProject[] {
  const isKubejs = (p: ModProject) => parseModpackProjectId(p.id) !== null;
  return [...projects.filter((p) => !isKubejs(p)), ...projects.filter(isKubejs)];
}

/**
 * 後者（勝出者）取代前者；但勝出者未翻譯、且原文與前者相同時，保留前者的譯文。
 * 勝出者為 obsolete 且前者已有該 key 時略過。
 */
function mergeEntry(prev: TranslationEntry | undefined, next: TranslationEntry): TranslationEntry {
  if (!prev) return next;
  if (next.status === 'obsolete') return prev;
  if (next.target === '' && prev.target !== '' && prev.source === next.source) {
    return { ...next, target: prev.target, status: 'translated' };
  }
  return next;
}

function combine(group: readonly ModProject[]): ModProject {
  const [first] = group;
  if (!first) throw new Error('empty namespace group');
  const byKey = new Map<string, TranslationEntry>();
  for (const p of group) {
    for (const e of p.entries) byKey.set(e.key, mergeEntry(byKey.get(e.key), e));
  }
  const guide = group.find((p) => p.guide)?.guide;
  const { guide: _first, ...base } = first;
  return { ...base, entries: [...byKey.values()], ...(guide ? { guide } : {}) };
}

/**
 * 同一命名空間（modId）的專案合成一個，避免資源包中同路徑的語言檔互相覆蓋。
 * KubeJS 專案排在最後以優先勝出；條目依序合併（規則見 mergeEntry）；格式取第一個；手冊取第一個有手冊的專案。
 */
export function mergeSameNamespace(projects: readonly ModProject[]): ModProject[] {
  const groups = new Map<string, readonly ModProject[]>();
  for (const p of kubejsLast(projects)) groups.set(p.modId, [...(groups.get(p.modId) ?? []), p]);
  return [...groups.values()].map((group) => (group.length === 1 && group[0] ? group[0] : combine(group)));
}
