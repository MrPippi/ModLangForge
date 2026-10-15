import type { ModProject } from '../../types';

export function updateEntry(p: ModProject, key: string, target: string, now: number): ModProject {
  const index = p.entries.findIndex((e) => e.key === key);
  const entry = p.entries[index];
  if (!entry || entry.status === 'obsolete') return p;
  const status = target !== '' ? 'translated' : 'untranslated';
  const entries = p.entries.map((e, i) => (i === index ? { ...e, target, status } : e));
  return { ...p, entries, updatedAt: now };
}
