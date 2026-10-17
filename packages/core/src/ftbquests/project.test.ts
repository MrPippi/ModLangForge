import { describe, expect, it } from 'vitest';
import { updateEntry } from '../merge';
import type { QuestData } from '../modpack';
import { mergeQuestProject, questLayoutOf, questProject, questStats, questTranslations } from './index';

const pack = { id: 'example-quests', name: 'Example Quests', version: '1.0.0' };
const TITLE = 'quest.44A5523F7A909209.title';
const DESC = 'quest.44A5523F7A909209.quest_desc';
const CHAPTER = 'chapter.1A2B3C4D5E6F7081.title';
const data: QuestData = { layout: 'single', en: { [TITLE]: '&aWelcome', [DESC]: 'Line one\nLine two', [CHAPTER]: 'Start' }, zh: { [TITLE]: '&a歡迎' } };

describe('questProject', () => {
  it('builds one project per modpack with the shipped translations and the layout', () => {
    const p = questProject(pack, data, 5);
    expect(p).toMatchObject({
      id: 'modpack-quests:example-quests', modId: 'ftbquests', name: 'Example Quests（FTB 任務）',
      version: '1.0.0', jarName: '', format: 'json', updatedAt: 5, questLayout: 'single',
    });
    expect(p.entries.map((e) => [e.key, e.target, e.status])).toEqual([
      [TITLE, '&a歡迎', 'translated'], [DESC, '', 'untranslated'], [CHAPTER, '', 'untranslated'],
    ]);
  });

  it('merges a reloaded modpack like a re-uploaded mod and follows the new layout', () => {
    const edited = updateEntry(questProject(pack, data, 1), DESC, '第一行\n第二行\n第三行', 2);
    const next = mergeQuestProject(edited, { ...pack, version: '1.1.0' }, { layout: 'split', en: { [DESC]: 'Line one\nLine two', [CHAPTER]: 'Begin' }, zh: {} }, 3);
    expect(next).toMatchObject({ id: 'modpack-quests:example-quests', version: '1.1.0', questLayout: 'split', updatedAt: 3 });
    expect(next.entries.map((e) => [e.key, e.target, e.status])).toEqual([
      [DESC, '第一行\n第二行\n第三行', 'translated'],
      [CHAPTER, '', 'new'],
      [TITLE, '&a歡迎', 'obsolete'],
    ]);
    expect(questTranslations(next)).toEqual({ [DESC]: '第一行\n第二行\n第三行' });
  });

  it('treats stored projects without questLayout as single', () => {
    expect(questLayoutOf({})).toBe('single');
    expect(questLayoutOf({ questLayout: 'split' })).toBe('split');
  });

  it('counts progress with the quest format checker', () => {
    expect(questStats(pack, data)).toEqual({ total: 3, translated: 1, warnings: 0, percent: 33 });
    expect(questStats(pack, { ...data, zh: { [TITLE]: '歡迎' } }).warnings).toBe(1);
  });
});
