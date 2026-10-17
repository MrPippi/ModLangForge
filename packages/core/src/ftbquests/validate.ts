import { langIssues, translationKeyIssues } from '../catalog/validateMod';
import type { GlossaryTerm } from '../glossary/schema';
import type { ModpackIssue } from '../modpack/validate';
import { checkQuestFormat } from './formatCodes';
import { isQuestKey } from './keys';

export const QUESTS_DIR = 'ftbquests';
export const QUEST_EN_FILE = 'en_us.json';
export const QUEST_ZH_FILE = 'zh_tw.json';

const KEY_MESSAGE = 'key 格式不符（應為 <類型>.<16 位十六進位 ID>.<欄位>）';

export function questFile(name: string): ModpackIssue['file'] {
  return `${QUESTS_DIR}/${name}`;
}

/** 驗證 ftbquests/ 的英文與譯文；zh 為 zh_tw.json 的內容（不存在時傳 {}）；回傳空陣列代表完全合法 */
export function validateQuestData(en: unknown, zh: unknown, terms: readonly GlossaryTerm[] = []): ModpackIssue[] {
  const enFile = questFile(QUEST_EN_FILE);
  const zhFile = questFile(QUEST_ZH_FILE);
  const base: ModpackIssue[] = [...langIssues(enFile, en), ...langIssues(zhFile, zh)];
  if (base.some((i) => i.level === 'error')) return base;
  const enRecord = en as Record<string, string>;
  const zhRecord = zh as Record<string, string>;
  const badKeys = Object.keys(enRecord)
    .filter((key) => !isQuestKey(key))
    .map((key): ModpackIssue => ({ level: 'error', file: enFile, key, message: KEY_MESSAGE }));
  const keyIssues = translationKeyIssues(enRecord, zhRecord, terms, checkQuestFormat).map((i): ModpackIssue => ({ ...i, file: zhFile }));
  return [...badKeys, ...keyIssues];
}
