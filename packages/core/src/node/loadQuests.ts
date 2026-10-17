import { join } from 'node:path';
import { QUEST_EN_FILE, QUEST_ZH_FILE, QUESTS_DIR, questFile, validateQuestData } from '../ftbquests/validate';
import type { GlossaryTerm } from '../glossary/schema';
import type { CatalogModpack } from '../modpack/schema';
import type { KubejsTexts } from '../modpack/types';
import { MODPACK_FILE, type ModpackIssue } from '../modpack/validate';
import { listEntries, loadTextPair } from './modpackFs';

export interface QuestDirLoad {
  /** ftbquests/ 資料夾存在 */
  readonly present: boolean;
  /** ftbquests/en_us.json 存在（不論內容是否合法） */
  readonly hasEnglish: boolean;
  /** 只在沒有 error 時存在 */
  readonly texts?: KubejsTexts;
  readonly issues: readonly ModpackIssue[];
}

/** 讀取並驗證 <整合包>/ftbquests/；資料夾不存在時 present 為 false */
export async function loadQuestDir(dir: string, terms: readonly GlossaryTerm[]): Promise<QuestDirLoad> {
  const root = join(dir, QUESTS_DIR);
  if ((await listEntries(root)) === null) return { present: false, hasEnglish: false, issues: [] };
  const pair = await loadTextPair({
    dir: root,
    enFile: QUEST_EN_FILE,
    zhFile: QUEST_ZH_FILE,
    fileOf: questFile,
    enOptional: true,
    validate: (en, zh) => validateQuestData(en, zh, terms),
  });
  return { present: true, ...pair };
}

/** modpack.json 的 ftbquests 與 ftbquests/ 資料夾必須一致 */
export function questMetaIssues(meta: CatalogModpack, load: QuestDirLoad): ModpackIssue[] {
  const status = meta.ftbquests?.status;
  if (status === 'supported' && !load.hasEnglish) {
    return [{ level: 'error', file: questFile(QUEST_EN_FILE), message: 'modpack.json 的 ftbquests 為 supported，但沒有 ftbquests/en_us.json' }];
  }
  if (status === 'unsupported-version' && load.present) {
    return [{ level: 'error', file: MODPACK_FILE, message: 'ftbquests 為 unsupported-version 時不可有 ftbquests/ 資料夾' }];
  }
  if (status === undefined && load.present) {
    return [{ level: 'error', file: MODPACK_FILE, message: '有 ftbquests/ 資料夾，但 modpack.json 沒有 ftbquests 欄位' }];
  }
  return [];
}
