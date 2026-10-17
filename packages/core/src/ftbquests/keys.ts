export const QUEST_OBJECT_TYPES = ['quest', 'chapter', 'chapter_group', 'file'] as const;
export const QUEST_FIELDS = ['title', 'quest_subtitle', 'quest_desc', 'chapter_subtitle'] as const;

export type QuestObjectType = (typeof QUEST_OBJECT_TYPES)[number];
export type QuestField = (typeof QUEST_FIELDS)[number];

/**
 * `<類型>.<16 位十六進位 ID>.<欄位>`：FTB Quests TranslationManager.makeKey 為 `%s.%s.%s`，
 * ID 由 QuestObjectBase.getCodeString 以 `%016X` 輸出（大寫、補零到 16 位）。
 */
export const QUEST_KEY_PATTERN = /^(quest|chapter|chapter_group|file)\.[0-9A-F]{16}\.(title|quest_subtitle|quest_desc|chapter_subtitle)$/;

/** TranslationKey 中值為字串清單的欄位 */
const LIST_SUFFIXES = ['.quest_desc', '.chapter_subtitle'] as const;

export function isQuestKey(key: string): boolean {
  return QUEST_KEY_PATTERN.test(key);
}

export function isListKey(key: string): boolean {
  return LIST_SUFFIXES.some((suffix) => key.endsWith(suffix));
}

export function questKey(type: QuestObjectType, id: string, field: QuestField): string {
  return `${type}.${id}.${field}`;
}

/** 清單欄位合併成一條文字（一行一個元素） */
export function joinLines(lines: readonly string[]): string {
  return lines.join('\n');
}

/** 一條文字拆回清單；\r\n 視同 \n */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}
