import type { DetectedMod, ModProject, TranslationEntry } from '../types';

export function makeEntry(key: string, source: string, target: string, reference: string | undefined, untranslatedStatus: TranslationEntry['status'] = 'untranslated'): TranslationEntry {
  return {
    key,
    source,
    target,
    ...(reference !== undefined ? { reference } : {}),
    status: target !== '' ? 'translated' : untranslatedStatus,
  };
}

export function buildProject(d: DetectedMod, now: number): ModProject {
  return {
    id: d.modId,
    modId: d.modId,
    name: d.name,
    version: d.version,
    jarName: d.jarName,
    format: d.format,
    entries: d.order.map((key) => makeEntry(key, d.source[key] ?? '', d.zhTw?.[key] ?? '', d.zhCn?.[key])),
    updatedAt: now,
  };
}
