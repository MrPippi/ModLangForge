import { checkQuestFormat } from '../ftbquests/formatCodes';
import { type FtbquestsMeta, supportsQuestLang } from '../ftbquests/schema';
import { findKeyConflicts, type KeyConflict } from '../pipeline/addSourceVersion';
import { ModpackImportError } from './errors';
import type { ImportedQuests } from './questArchive';

/** 衝突清單中標示任務文字；不是合法命名空間，不會與 KubeJS 撞名 */
export const QUEST_CONFLICT_LABEL = 'FTB 任務';

/** 新版沒有任務檔時沿用既有任務資料（可能是整合包移除了 FTB Quests），提醒維護者確認 */
export const QUEST_KEPT_NOTE = '新版沒有 FTB 任務檔，沿用既有資料';

export interface QuestChange {
  readonly created: boolean;
  readonly addedKeys: readonly string[];
  /** 原文不同的 key（保留既有原文） */
  readonly conflicts: readonly KeyConflict[];
  /** 只在新版沒有任務檔而沿用既有任務資料時存在 */
  readonly note?: string;
}

export interface QuestPlanInput {
  readonly mcVersion: string;
  readonly existingMeta: FtbquestsMeta | undefined;
  readonly existingEn: Readonly<Record<string, string>> | undefined;
  readonly incoming: ImportedQuests | undefined;
}

export type QuestPlan =
  | { readonly kind: 'write'; readonly meta: FtbquestsMeta | undefined; readonly en?: Readonly<Record<string, string>>; readonly change?: QuestChange }
  | { readonly kind: 'refused'; readonly conflicts: readonly KeyConflict[] };

/** 沿用 findKeyConflicts 找出原文不同的 key；格式碼改變與否以 FTB 任務格式碼判斷（換行數量不算） */
function questConflicts(base: Readonly<Record<string, string>>, incoming: Readonly<Record<string, string>>): KeyConflict[] {
  return findKeyConflicts(base, incoming).map((c) => ({ ...c, formatChanged: checkQuestFormat(c.existing, c.incoming) !== null }));
}

/** 既有原文優先、新 key 依序附加在最後（KubeJS 命名空間與任務文字共用） */
export function appendNewKeys(
  base: Readonly<Record<string, string>>,
  incoming: Readonly<Record<string, string>>,
): { addedKeys: string[]; en: Record<string, string> } {
  const addedKeys = Object.keys(incoming).filter((k) => !Object.hasOwn(base, k));
  return { addedKeys, en: { ...base, ...Object.fromEntries(addedKeys.map((k) => [k, incoming[k] ?? ''])) } };
}

/** 新版沒有任務檔：沿用既有欄位；過時的 unsupported-version 不再有資料可標，直接移除 */
function keptMeta(existing: FtbquestsMeta | undefined): FtbquestsMeta | undefined {
  return existing?.status === 'unsupported-version' ? undefined : existing;
}

/** 規則同 KubeJS：新 key 依序附加、原文不同保留既有原文並列出、格式碼改變則整次拒絕；不動 zh_tw.json */
export function planQuestWrite({ mcVersion, existingMeta, existingEn, incoming }: QuestPlanInput): QuestPlan {
  if (existingEn !== undefined && !supportsQuestLang(mcVersion)) {
    throw new ModpackImportError(`這次匯入的是 Minecraft ${mcVersion}（低於 1.21），但已有 FTB 任務資料（ftbquests/en_us.json）；未寫入任何檔案，請人工確認`);
  }
  if (!incoming) {
    const meta = keptMeta(existingMeta);
    return meta?.status === 'supported'
      ? { kind: 'write', meta, change: { created: false, addedKeys: [], conflicts: [], note: QUEST_KEPT_NOTE } }
      : { kind: 'write', meta };
  }
  if (incoming.status === 'unsupported-version') return { kind: 'write', meta: { status: 'unsupported-version' } };
  const base = existingEn ?? {};
  const conflicts = questConflicts(base, incoming.en);
  const refused = conflicts.filter((c) => c.formatChanged);
  if (refused.length > 0) return { kind: 'refused', conflicts: refused };
  const { addedKeys, en } = appendNewKeys(base, incoming.en);
  const change: QuestChange = { created: existingEn === undefined, addedKeys, conflicts };
  const meta: FtbquestsMeta = { status: 'supported', layout: incoming.layout };
  if (!change.created && addedKeys.length === 0) return { kind: 'write', meta, change };
  return { kind: 'write', meta, en, change };
}
