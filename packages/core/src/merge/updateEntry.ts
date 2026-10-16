import type { EntrySection, EntryStatus, ModProject, TranslationEntry } from '../types';

/** 回傳更新後的新條目陣列；key 不存在或已 obsolete 時回傳 null */
function updateList(entries: readonly TranslationEntry[], key: string, target: string): TranslationEntry[] | null {
  const index = entries.findIndex((e) => e.key === key);
  const entry = entries[index];
  if (!entry || entry.status === 'obsolete') return null;
  const status: EntryStatus = target !== '' ? 'translated' : 'untranslated';
  return entries.map((e, i) => (i === index ? { ...e, target, status } : e));
}

/** section 指定更新語言檔或手冊條目；找不到可編輯的 key 時回傳原專案 */
export function updateEntry(p: ModProject, key: string, target: string, now: number, section: EntrySection = 'lang'): ModProject {
  if (section === 'guide') {
    const entries = p.guide ? updateList(p.guide.entries, key, target) : null;
    return p.guide && entries ? { ...p, guide: { ...p.guide, entries }, updatedAt: now } : p;
  }
  const entries = updateList(p.entries, key, target);
  return entries ? { ...p, entries, updatedAt: now } : p;
}
