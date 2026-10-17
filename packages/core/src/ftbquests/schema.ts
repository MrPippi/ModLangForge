/** single：lang/<locale>.snbt；split：lang/<locale>/ 資料夾（FTB Quests 26.x） */
export const QUEST_LAYOUTS = ['single', 'split'] as const;

export type QuestLayout = (typeof QUEST_LAYOUTS)[number];
