import { questKey, type QuestField, type QuestObjectType } from './keys';
import { stringListText } from './langFile';
import { compounds, field, listField, type SnbtCompound, type SnbtValue, stringField } from './snbt';

/** 任務書本身的 ID（FTB Quests BaseQuestFile 的 super(1L)） */
export const FILE_OBJECT_ID = '0000000000000001';
const MIN_LONG = -(2n ** 63n);
const MAX_LONG = 2n ** 63n - 1n;
/** Java Long.parseLong(s, 16)：可有正負號，位數不限，但值必須在 long 範圍內 */
const HEX_ID = /^#?([+-]?)([0-9A-Fa-f]+)$/;
const INT_ID = /^-?\d+[bBsSlL]?$/;

function idValue(value: SnbtValue | undefined): bigint | null {
  if (value?.kind === 'string') {
    const m = HEX_ID.exec(value.value);
    return m === null ? null : (m[1] === '-' ? -1n : 1n) * BigInt(`0x${m[2]}`);
  }
  if (value?.kind === 'number' && INT_ID.test(value.raw)) return BigInt(value.raw.replace(/[bBsSlL]$/, ''));
  return null;
}

/**
 * 依 FTB Quests BaseQuestFile.readID：數字 tag 直接當 long 使用（負數也有效，以 `%016X` 輸出二補數）；
 * 字串 tag 以 `Long.parseLong(去掉 # 前綴, 16)` 解析（有號：`8000000000000000` 以上會拋例外而被忽略）。
 * 缺少、無法解析、超出 long 範圍、0、1 時遊戲會產生隨機新 ID，翻譯無法對應，因此回傳 null。
 */
export function questIdHex(value: SnbtValue | undefined): string | null {
  const id = idValue(value);
  if (id === null || id === 0n || id === 1n || id < MIN_LONG || id > MAX_LONG) return null;
  return BigInt.asUintN(64, id).toString(16).toUpperCase().padStart(16, '0');
}

export interface LegacyQuestBook {
  /** data.snbt */
  readonly data?: SnbtCompound;
  /** chapter_groups.snbt */
  readonly chapterGroups?: SnbtCompound;
  /** chapters/*.snbt，依路徑排序 */
  readonly chapters: readonly SnbtCompound[];
}

export interface LegacyQuests {
  readonly texts: Readonly<Record<string, string>>;
  readonly notes: readonly string[];
}

interface QuestObject {
  readonly type: QuestObjectType;
  readonly id: string | null;
  readonly texts: readonly (readonly [QuestField, string | undefined])[];
}

/** 清單欄位：元素不全是字串時視為沒有（規則與 lang 檔相同，共用 `stringListText`） */
const listText = (items: readonly SnbtValue[] | undefined): string | undefined => (items ? stringListText(items) ?? undefined : undefined);

/** handleLegacyChapterNBT（title 字串、subtitle 清單）與 handleLegacyQuestNBT（title、subtitle 字串、description 清單） */
function chapterObjects(c: SnbtCompound): QuestObject[] {
  const chapter: QuestObject = {
    type: 'chapter',
    id: questIdHex(field(c, 'id')),
    texts: [['title', stringField(c, 'title')], ['chapter_subtitle', listText(listField(c, 'subtitle'))]],
  };
  const quests = compounds(listField(c, 'quests')).map((q): QuestObject => ({
    type: 'quest',
    id: questIdHex(field(q, 'id')),
    texts: [['title', stringField(q, 'title')], ['quest_subtitle', stringField(q, 'subtitle')], ['quest_desc', listText(listField(q, 'description'))]],
  }));
  return [chapter, ...quests];
}

function bookObjects(book: LegacyQuestBook): QuestObject[] {
  const file: QuestObject[] = book.data ? [{ type: 'file', id: FILE_OBJECT_ID, texts: [['title', stringField(book.data, 'title')]] }] : [];
  const groups = compounds(book.chapterGroups ? listField(book.chapterGroups, 'chapter_groups') : undefined).map((g): QuestObject => ({
    type: 'chapter_group',
    id: questIdHex(field(g, 'id')),
    texts: [['title', stringField(g, 'title')]],
  }));
  return [...file, ...groups, ...book.chapters.flatMap(chapterObjects)];
}

const isText = (t: string | undefined): t is string => t !== undefined && t !== '';
const hasText = (o: QuestObject): boolean => o.texts.some(([, t]) => isText(t));

/** 只有章節檔（未附 lang）的整合包：依 FTB 載入時自動轉換的規則抽出英文 */
export function extractLegacyQuests(book: LegacyQuestBook): LegacyQuests {
  const seen = new Set<string>();
  const kept: (QuestObject & { readonly id: string })[] = [];
  let missing = 0;
  let duplicate = 0;
  for (const o of bookObjects(book)) {
    if (o.id === null) {
      if (hasText(o)) missing += 1;
    } else if (seen.has(o.id)) {
      if (hasText(o)) duplicate += 1;
    } else {
      seen.add(o.id);
      kept.push({ ...o, id: o.id });
    }
  }
  const texts = Object.fromEntries(kept.flatMap((o) => o.texts.flatMap(([f, t]) => (isText(t) ? [[questKey(o.type, o.id, f), t] as const] : []))));
  const notes = [
    ...(missing > 0 ? [`略過 ${missing} 個沒有有效 ID 的任務物件（遊戲載入時會重新產生 ID，無法對應翻譯）`] : []),
    ...(duplicate > 0 ? [`略過 ${duplicate} 個 ID 重複的任務物件`] : []),
  ];
  return { texts, notes };
}
