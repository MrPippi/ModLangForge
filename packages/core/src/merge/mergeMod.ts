import { flatten } from '../patchouli/flatten';
import type { DetectedGuide, DetectedMod, ModProject, ProjectGuide, TranslationEntry } from '../types';
import { makeEntry } from './buildProject';

/** 合併所需的新版文字；DetectedMod 與攤平後的手冊（FlatGuide）都符合 */
export interface IncomingTexts {
  readonly source: Readonly<Record<string, string>>;
  readonly order: readonly string[];
  readonly zhTw?: Readonly<Record<string, string>>;
  readonly zhCn?: Readonly<Record<string, string>>;
}

function mergeEntry(old: TranslationEntry | undefined, key: string, incoming: IncomingTexts): TranslationEntry {
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
 * 原文相同保留譯文、原文變更清空並標記 new、新 key 標記 new、已不存在的 key 標記 obsolete 並移到最後。
 */
export function mergeEntries(existing: readonly TranslationEntry[], incoming: IncomingTexts): TranslationEntry[] {
  const oldByKey = new Map(existing.map((e) => [e.key, e]));
  const incomingKeys = new Set(incoming.order);
  const current = incoming.order.map((key) => mergeEntry(oldByKey.get(key), key, incoming));
  const obsolete = existing
    .filter((e) => !incomingKeys.has(e.key))
    .map((e): TranslationEntry => ({ ...e, status: 'obsolete' }));
  return [...current, ...obsolete];
}

/** 手冊套用與語言檔相同的規則；新 jar 沒有手冊時既有條目全部標記 obsolete（保留譯文） */
function mergeGuide(existing: ProjectGuide | undefined, incoming: DetectedGuide | undefined): ProjectGuide | undefined {
  const files = incoming?.files ?? {};
  if (!existing && Object.keys(files).length === 0) return undefined;
  return { files, entries: mergeEntries(existing?.entries ?? [], flatten(files)) };
}

/** 將新載入的同一模組合併進既有專案（語言檔與手冊分別合併） */
export function mergeProject(existing: ModProject, incoming: DetectedMod, now: number): ModProject {
  const { guide: _previous, ...rest } = existing;
  const guide = mergeGuide(existing.guide, incoming.guide);
  return {
    ...rest,
    name: incoming.name,
    version: incoming.version,
    jarName: incoming.jarName,
    format: incoming.format,
    entries: mergeEntries(existing.entries, incoming),
    updatedAt: now,
    ...(guide ? { guide } : {}),
  };
}
