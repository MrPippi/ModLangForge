import { guideFilePrefix, guidePackPath, parseGuidePath } from '../patchouli/paths';
import { rebuild } from '../patchouli/rebuild';
import type { ModProject } from '../types';

/** 手冊譯文 key→文字（不含已移除與未翻譯的條目） */
export function guideTranslations(p: ModProject): Record<string, string> {
  return Object.fromEntries(
    (p.guide?.entries ?? []).filter((e) => e.status !== 'obsolete' && e.target !== '').map((e) => [e.key, e.target]),
  );
}

const keyPrefix = (key: string): string => key.slice(0, key.lastIndexOf('#'));

/** 資源包內的手冊譯文檔（路徑 → 內容）；只輸出至少有一段已翻譯的檔案（其餘由遊戲退回英文，檔內未翻的段落保留英文） */
export function buildGuidePackFiles(p: ModProject): [string, string][] {
  if (!p.guide) return [];
  const translations = guideTranslations(p);
  const translatedFiles = new Set(Object.keys(translations).map(keyPrefix));
  return Object.entries(rebuild(p.guide.files, translations)).flatMap(([path, text]): [string, string][] => {
    const parsed = parseGuidePath(path);
    const out = guidePackPath(p.modId, path);
    if (!parsed || !out) return [];
    if (!translatedFiles.has(guideFilePrefix(parsed))) return [];
    return [[out, text]];
  });
}
