import { isListKey, isQuestKey, joinLines, splitLines } from './keys';
import type { QuestLayout } from './schema';
import type { SnbtCompound, SnbtValue } from './snbt';
import { type SnbtLangValue, writeSnbtLang } from './snbtWrite';

export const QUEST_LANG_DIR = 'config/ftbquests/quests/lang';

/** 本站輸出的任務檔：single → lang/zh_tw.snbt；split → lang/zh_tw/modlangforge.snbt（與整合包自己的檔案並存） */
export function questLangPath(layout: QuestLayout): string {
  return layout === 'split' ? `${QUEST_LANG_DIR}/zh_tw/modlangforge.snbt` : `${QUEST_LANG_DIR}/zh_tw.snbt`;
}

export interface QuestLangRead {
  readonly texts: Readonly<Record<string, string>>;
  /** 不在翻譯範圍（例如 task、reward_table）或型別不符而略過的條目數 */
  readonly skipped: number;
}

/** FTB 以 getList(…, TAG_STRING) 讀清單：元素不全是字串時視為沒有（回傳 null） */
export function stringListText(items: readonly SnbtValue[]): string | null {
  const lines = items.flatMap((i) => (i.kind === 'string' ? [i.value] : []));
  return lines.length === items.length ? joinLines(lines) : null;
}

/** 字串欄位必須是字串；清單欄位必須是全為字串的清單；其他回傳 null */
function entryText(key: string, value: SnbtValue): string | null {
  if (!isListKey(key)) return value.kind === 'string' ? value.value : null;
  return value.kind === 'list' ? stringListText(value.items) : null;
}

/** lang 檔 → key→文字；清單欄位以 \n 合併；空字串與空清單不收錄 */
export function readQuestLang(c: SnbtCompound): QuestLangRead {
  const read = Object.entries(c.entries).map(([key, value]) => [key, isQuestKey(key) ? entryText(key, value) : null] as const);
  return {
    texts: Object.fromEntries(read.filter((r): r is readonly [string, string] => r[1] !== null && r[1] !== '')),
    skipped: read.filter(([, text]) => text === null).length,
  };
}

// eslint-disable-next-line no-control-regex -- 其他 C0 控制字元寫出會讓 JSON／JSON5 讀取器失敗，FTB 讀取器也不認 \u 跳脫，因此直接移除
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

/** 譯文 → lang 檔文字；清單欄位依 \n 拆回字串清單；空字串與不符規則的 key 不輸出；\r\n 統一為 \n；\t \n \r 以外的 C0 控制字元移除 */
export function questLangText(translations: Readonly<Record<string, string>>): string {
  const entries = Object.entries(translations)
    .filter(([key]) => isQuestKey(key))
    .map(([key, text]) => [key, text.replace(CONTROL_CHARS, '')] as const)
    .filter(([, text]) => text !== '')
    .map(([key, text]): readonly [string, SnbtLangValue] => [key, isListKey(key) ? splitLines(text) : text.replace(/\r\n/g, '\n')]);
  return writeSnbtLang(entries);
}
