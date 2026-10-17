import type { QuestLayout } from '../ftbquests/schema';

/** 一個 KubeJS 命名空間的英文原文與譯文 */
export interface KubejsTexts {
  readonly en: Readonly<Record<string, string>>;
  readonly zh: Readonly<Record<string, string>>;
}

/** 命名空間 → KubeJS 文字 */
export type KubejsData = Readonly<Record<string, KubejsTexts>>;

/** 整合包的 FTB 任務文字（只在 modpack.json 的 ftbquests 為 supported 時存在） */
export interface QuestData extends KubejsTexts {
  readonly layout: QuestLayout;
}
