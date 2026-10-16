import { flatten } from '../patchouli/flatten';
import type { DetectedMod, GuideFiles, ModProject, ProjectGuide, TranslationEntry } from '../types';

export function makeEntry(key: string, source: string, target: string, reference: string | undefined, untranslatedStatus: TranslationEntry['status'] = 'untranslated'): TranslationEntry {
  return {
    key,
    source,
    target,
    ...(reference !== undefined ? { reference } : {}),
    status: target !== '' ? 'translated' : untranslatedStatus,
  };
}

/** 由原樣檔建立手冊（條目全部未翻譯）；「有手冊」的判斷是至少有一段可翻譯文字 */
export function buildGuide(files: GuideFiles): ProjectGuide {
  const { source, order } = flatten(files);
  return { files, entries: order.map((key) => makeEntry(key, source[key] ?? '', '', undefined)) };
}

export function buildProject(d: DetectedMod, now: number): ModProject {
  const guide = buildGuide(d.guide?.files ?? {});
  return {
    id: d.modId,
    modId: d.modId,
    name: d.name,
    version: d.version,
    jarName: d.jarName,
    format: d.format,
    entries: d.order.map((key) => makeEntry(key, d.source[key] ?? '', d.zhTw?.[key] ?? '', d.zhCn?.[key])),
    updatedAt: now,
    ...(guide.entries.length > 0 ? { guide } : {}),
  };
}
