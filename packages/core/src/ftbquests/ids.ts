import { isValidModpackId } from '../modpack/schema';

export const QUEST_PROJECT_PREFIX = 'modpack-quests';

/** 翻譯工具中整合包 FTB 任務專案的 ID；與模組（modId）及 KubeJS（modpack:<id>:<ns>）不會撞名 */
export function questProjectId(modpackId: string): string {
  return `${QUEST_PROJECT_PREFIX}:${modpackId}`;
}

export function parseQuestProjectId(id: string): { readonly modpackId: string } | null {
  const parts = id.split(':');
  if (parts.length !== 2 || parts[0] !== QUEST_PROJECT_PREFIX) return null;
  const modpackId = parts[1] ?? '';
  return isValidModpackId(modpackId) ? { modpackId } : null;
}

export function isQuestProjectId(id: string): boolean {
  return parseQuestProjectId(id) !== null;
}
