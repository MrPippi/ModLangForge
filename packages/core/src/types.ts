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

export interface ModProject {
  readonly id: string;
  readonly modId: string;
  readonly name: string;
  readonly version: string;
  readonly jarName: string;
  readonly format: LangFormat;
  readonly entries: readonly TranslationEntry[];
  readonly updatedAt: number;
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
}

export interface Workspace {
  readonly mods: readonly ModProject[];
  readonly activeModId: string | null;
}
