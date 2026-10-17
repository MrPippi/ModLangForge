import type { QuestLayout } from './ftbquests/schema';

export type LangFormat = 'json' | 'lang';

export type EntryStatus = 'untranslated' | 'translated' | 'new' | 'obsolete';

export interface TranslationEntry {
  readonly key: string;
  /** en_us 原文 */
  readonly source: string;
  /** 譯文，空字串代表未翻譯 */
  readonly target: string;
  /** zh_cn 參考 */
  readonly reference?: string;
  readonly status: EntryStatus;
}

/** Patchouli 手冊原樣檔：相對 `patchouli/` 的路徑（例 `guide/en_us/entries/a.json`）→ 原始 JSON 文字 */
export type GuideFiles = Readonly<Record<string, string>>;

export interface SkippedBook {
  readonly book: string;
  readonly reason: string;
}

/** 從 jar 偵測到的手冊；所有手冊都被略過時 files 為空 */
export interface DetectedGuide {
  readonly files: GuideFiles;
  readonly skipped: readonly SkippedBook[];
}

/** 專案中的手冊；條目與語言檔條目分開 */
export interface ProjectGuide {
  readonly files: GuideFiles;
  readonly entries: readonly TranslationEntry[];
}

/** 條目所屬區塊 */
export type EntrySection = 'lang' | 'guide';

export interface ModProject {
  readonly id: string;
  readonly modId: string;
  readonly name: string;
  readonly version: string;
  readonly jarName: string;
  readonly format: LangFormat;
  readonly entries: readonly TranslationEntry[];
  readonly updatedAt: number;
  /** Patchouli 手冊；沒有手冊（含 IndexedDB 舊專案）時省略 */
  readonly guide?: ProjectGuide;
  /** FTB 任務專案的輸出格式；只有任務專案有，IndexedDB 舊資料可能沒有（視為 single） */
  readonly questLayout?: QuestLayout;
}

/** 從 jar 偵測到、尚未轉為專案的模組語言資料 */
export interface DetectedMod {
  readonly modId: string;
  readonly name: string;
  readonly version: string;
  readonly jarName: string;
  readonly format: LangFormat;
  readonly source: Readonly<Record<string, string>>;
  readonly order: readonly string[];
  readonly zhTw?: Readonly<Record<string, string>>;
  readonly zhCn?: Readonly<Record<string, string>>;
  readonly guide?: DetectedGuide;
}

export interface Workspace {
  readonly mods: readonly ModProject[];
  readonly activeModId: string | null;
}
