import { extractLegacyQuests, type LegacyQuestBook } from '../ftbquests/extract';
import { readQuestLang } from '../ftbquests/langFile';
import { type QuestLayout, supportsQuestLang } from '../ftbquests/schema';
import { parseSnbt, type SnbtCompound, SnbtParseError } from '../ftbquests/snbt';
import { type ArchiveContext, readText } from './archiveContext';
import { ModpackImportError } from './errors';

/** 只讀 overrides/ 底下的 FTB Quests 任務書 */
export const QUESTS_ROOT = 'overrides/config/ftbquests/quests/';

export type ImportedQuests =
  | { readonly status: 'unsupported-version' }
  | { readonly status: 'supported'; readonly layout: QuestLayout; readonly en: Readonly<Record<string, string>> };

export interface QuestRead {
  /** 沒有任務檔、或 MC ≥ 1.21 卻沒有任何任務文字時為 null */
  readonly quests: ImportedQuests | null;
  /** 給維護者看的提示 */
  readonly notes: readonly string[];
}

/** FTB Quests 1.21.x 的 LANG_FILE_PAT 為 ^\w+\.snbt$，locale 取檔名並轉小寫 */
const SINGLE_FILE = /^lang\/en_us\.snbt$/i;
/** FTB Quests 26.x 的 TranslationTable.loadAndCombine 以 Files.walk 遞迴讀取 lang/<locale>/ */
const SPLIT_FILE = /^lang\/en_us\/.+\.snbt$/i;
/** BaseQuestFile 以 Files.list 讀 chapters/，不遞迴 */
const CHAPTER_FILE = /^chapters\/[^/]+\.snbt$/;
/** 整合包自帶的繁中任務檔：只偵測、不解析 */
const PACK_ZH_TW = /^lang\/zh_tw(\.snbt|\/.+\.snbt)$/i;
const NONE: QuestRead = { quests: null, notes: [] };

/** [相對 quests/ 的路徑（反斜線視同 /）, 壓縮檔內原始名稱] */
type QuestFile = readonly [string, string];

export function unsupportedQuestNote(mcVersion: string): string {
  return `整合包為 Minecraft ${mcVersion}（低於 1.21），FTB 任務文字暫不支援翻譯，已略過`;
}

export function skippedQuestNote(n: number): string {
  return `略過 ${n} 條不在翻譯範圍或格式不符的任務文字（例如獎勵表、任務項目的標題）`;
}

export function packZhTwQuestNote(): string {
  return '整合包已附 FTB 任務繁中（lang/zh_tw…）；網站下載會取代它，請先確認是否要把它的內容納入 ftbquests/zh_tw.json 或暫不收錄任務';
}

function questFiles(ctx: ArchiveContext): QuestFile[] {
  return Object.keys(ctx.zip.files)
    .flatMap((raw): QuestFile[] => {
      const path = raw.replaceAll('\\', '/');
      return path.startsWith(QUESTS_ROOT) && path.endsWith('.snbt') ? [[path.slice(QUESTS_ROOT.length), raw]] : [];
    })
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** 經由 readText 讀取，計入共用的解壓大小上限 */
async function readCompound(ctx: ArchiveContext, [rel, raw]: QuestFile): Promise<SnbtCompound> {
  const text = await readText(ctx, raw);
  try {
    return parseSnbt(text);
  } catch (err) {
    if (err instanceof SnbtParseError) throw new ModpackImportError(`${QUESTS_ROOT}${rel} 解析失敗：${err.message}`);
    throw err;
  }
}

/** 逐檔順序讀取以控制記憶體；路徑排序後讀到的同名 key 取代前者 */
async function readLangFiles(ctx: ArchiveContext, files: readonly QuestFile[]): Promise<{ en: Readonly<Record<string, string>>; skipped: number }> {
  let en: Readonly<Record<string, string>> = {};
  let skipped = 0;
  for (const file of files) {
    const read = readQuestLang(await readCompound(ctx, file));
    en = { ...en, ...read.texts };
    skipped += read.skipped;
  }
  return { en, skipped };
}

async function readLegacy(ctx: ArchiveContext, files: readonly QuestFile[]): Promise<{ en: Readonly<Record<string, string>>; notes: readonly string[] }> {
  const optional = async (rel: string): Promise<SnbtCompound | undefined> => {
    const file = files.find(([r]) => r === rel);
    return file ? readCompound(ctx, file) : undefined;
  };
  const data = await optional('data.snbt');
  const chapterGroups = await optional('chapter_groups.snbt');
  const chapters: SnbtCompound[] = [];
  for (const file of files.filter(([rel]) => CHAPTER_FILE.test(rel))) chapters.push(await readCompound(ctx, file));
  const book: LegacyQuestBook = { ...(data ? { data } : {}), ...(chapterGroups ? { chapterGroups } : {}), chapters };
  const { texts, notes } = extractLegacyQuests(book);
  return { en: texts, notes };
}

function supportedRead(layout: QuestLayout, en: Readonly<Record<string, string>>, notes: readonly string[]): QuestRead {
  return Object.keys(en).length === 0 ? { quests: null, notes } : { quests: { status: 'supported', layout, en }, notes };
}

/**
 * 讀取 overrides/config/ftbquests/quests/：lang/en_us.snbt（single）優先，其次 lang/en_us/**.snbt（split），
 * 都沒有時從 data.snbt、chapter_groups.snbt、chapters/*.snbt 抽取（single）。MC < 1.21 不解析，只標記 unsupported-version。
 */
export async function readQuests(ctx: ArchiveContext, mcVersion: string): Promise<QuestRead> {
  const files = questFiles(ctx);
  if (files.length === 0) return NONE;
  if (!supportsQuestLang(mcVersion)) return { quests: { status: 'unsupported-version' }, notes: [unsupportedQuestNote(mcVersion)] };
  const packNotes = files.some(([rel]) => PACK_ZH_TW.test(rel)) ? [packZhTwQuestNote()] : [];
  const single = files.filter(([rel]) => SINGLE_FILE.test(rel));
  const split = files.filter(([rel]) => SPLIT_FILE.test(rel));
  const lang = single.length > 0 ? single : split;
  if (lang.length > 0) {
    const { en, skipped } = await readLangFiles(ctx, lang);
    return supportedRead(single.length > 0 ? 'single' : 'split', en, [...(skipped > 0 ? [skippedQuestNote(skipped)] : []), ...packNotes]);
  }
  const legacy = await readLegacy(ctx, files);
  return supportedRead('single', legacy.en, [...legacy.notes, ...packNotes]);
}
