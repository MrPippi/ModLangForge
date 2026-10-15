import type { DetectedMod, ModProject, TranslationEntry } from '../../types';
import { makeEntry } from './buildProject';

function mergeEntry(old: TranslationEntry | undefined, key: string, incoming: DetectedMod): TranslationEntry {
  const source = incoming.source[key] ?? '';
  const shipped = incoming.zhTw?.[key] ?? '';
  const reference = incoming.zhCn?.[key];
  if (!old) return makeEntry(key, source, shipped, reference, 'new');
  if (old.source !== source) return makeEntry(key, source, '', reference, 'new');
  const target = old.target !== '' ? old.target : shipped;
  const fallback = old.status === 'new' ? 'new' : 'untranslated';
  return makeEntry(key, source, target, reference, fallback);
}

/**
 * 將新載入的同一模組合併進既有專案：
 * 原文相同保留譯文、原文變更清空並標記 new、新 key 標記 new、已不存在的 key 標記 obsolete 並移到最後。
 */
export function mergeProject(existing: ModProject, incoming: DetectedMod, now: number): ModProject {
  const oldByKey = new Map(existing.entries.map((e) => [e.key, e]));
  const incomingKeys = new Set(incoming.order);
  const current = incoming.order.map((key) => mergeEntry(oldByKey.get(key), key, incoming));
  const obsolete = existing.entries
    .filter((e) => !incomingKeys.has(e.key))
    .map((e): TranslationEntry => ({ ...e, status: 'obsolete' }));
  return {
    ...existing,
    name: incoming.name,
    version: incoming.version,
    jarName: incoming.jarName,
    format: incoming.format,
    entries: [...current, ...obsolete],
    updatedAt: now,
  };
}
