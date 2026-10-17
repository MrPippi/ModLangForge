import { buildProject } from '../merge/buildProject';
import { mergeProject } from '../merge/mergeMod';
import { projectStats, type ProjectStats } from '../merge/stats';
import type { ModpackRef } from '../modpack/project';
import type { QuestData } from '../modpack/types';
import type { DetectedMod, ModProject } from '../types';
import { questProjectId } from './ids';
import type { QuestLayout } from './schema';

/** 任務專案的 modId（只用於顯示；輸出路徑由 questLayout 決定，不會寫到 assets/<modId>/） */
export const QUEST_MOD_ID = 'ftbquests';

export function questProjectName(name: string): string {
  return `${name}（FTB 任務）`;
}

/** 站上任務文字視為一個「jar 偵測結果」，以便沿用 buildProject／mergeProject 的規則 */
function toDetected(pack: ModpackRef, data: QuestData): DetectedMod {
  return {
    modId: QUEST_MOD_ID,
    name: questProjectName(pack.name),
    version: pack.version,
    jarName: '',
    format: 'json',
    source: data.en,
    order: Object.keys(data.en),
    zhTw: data.zh,
  };
}

export function questProject(pack: ModpackRef, data: QuestData, now: number): ModProject {
  return { ...buildProject(toDetected(pack, data), now), id: questProjectId(pack.id), questLayout: data.layout };
}

/** 重新載入同一整合包：原文相同保留譯文、原文變更標 new、移除的 key 標 obsolete；layout 改用新資料 */
export function mergeQuestProject(existing: ModProject, pack: ModpackRef, data: QuestData, now: number): ModProject {
  return { ...mergeProject(existing, toDetected(pack, data), now), questLayout: data.layout };
}

export function questLayoutOf(p: Pick<ModProject, 'questLayout'>): QuestLayout {
  return p.questLayout === 'split' ? 'split' : 'single';
}

/** 已翻譯、未移除的任務條目（未翻譯的由遊戲退回英文） */
export function questTranslations(p: ModProject): Record<string, string> {
  return Object.fromEntries(p.entries.filter((e) => e.status !== 'obsolete' && e.target !== '').map((e) => [e.key, e.target]));
}

export function questStats(pack: ModpackRef, data: QuestData): ProjectStats {
  return projectStats(questProject(pack, data, 0));
}
