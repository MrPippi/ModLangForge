import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { parseSnbt, questProject, readQuestLang } from '../ftbquests';
import { buildProject, updateEntry } from '../merge';
import type { ModProject } from '../types';
import { zipFileNames } from '../test/zipFiles';
import { type ExportOptions, exportFiles, questFiles } from './index';

const TITLE = 'quest.44A5523F7A909209.title';
const DESC = 'quest.44A5523F7A909209.quest_desc';

const mod = updateEntry(buildProject({ modId: 'a', name: 'A', version: '1', jarName: 'a.jar', format: 'json', source: { k: 'Key' }, order: ['k'] }, 1), 'k', '鍵', 2);

function quests(id: string, layout: 'single' | 'split' = 'single'): ModProject {
  const p = questProject({ id, name: id, version: '1' }, { layout, en: { [TITLE]: 'Welcome', [DESC]: 'Line one\nLine two' }, zh: {} }, 1);
  return updateEntry(p, DESC, '第一行\n第二行\n第三行', 2);
}

const opts = (o: Partial<ExportOptions> = {}): ExportOptions => ({ kind: 'merged-pack', untranslated: 'keep-source', mcVersion: '1.21.1', description: '測試', ...o });

const names = (files: readonly { fileName: string }[]) => files.map((f) => f.fileName);
const questTexts = async (f: { blob: Blob }) => readQuestLang(parseSnbt(await f.blob.text())).texts;

describe('questFiles', () => {
  it('names a single modpack file by layout and writes translated entries only', async () => {
    const [single] = questFiles([{ modpackId: 'p', layout: 'single', translations: { [DESC]: '一\n二', [TITLE]: '' } }]);
    expect(single?.fileName).toBe('zh_tw.snbt');
    expect(await questTexts(single!)).toEqual({ [DESC]: '一\n二' });
    expect(names(questFiles([{ modpackId: 'p', layout: 'split', translations: { [TITLE]: '甲' } }]))).toEqual(['modlangforge.snbt']);
  });

  it('skips modpacks without translations and prefixes the modpack id when several are exported', () => {
    expect(questFiles([{ modpackId: 'p', layout: 'single', translations: {} }])).toEqual([]);
    const two = questFiles([
      { modpackId: 'p', layout: 'single', translations: { [TITLE]: '甲' } },
      { modpackId: 'q', layout: 'split', translations: { [TITLE]: '乙' } },
      { modpackId: 'r', layout: 'single', translations: {} },
    ]);
    expect(names(two)).toEqual(['p-zh_tw.snbt', 'q-modlangforge.snbt']);
  });
});

describe('exportFiles with quest projects', () => {
  it('merged-pack: a plain resource pack plus a separate quest file', async () => {
    const files = await exportFiles([mod, quests('pack')], opts());
    expect(names(files)).toEqual(['ModLangForge-zh_tw.zip', 'zh_tw.snbt']);
    const zip = await JSZip.loadAsync(await files[0]!.blob.arrayBuffer());
    expect(zipFileNames(zip)).toEqual(['assets/a/lang/zh_tw.json', 'pack.mcmeta']);
    expect(await questTexts(files[1]!)).toEqual({ [DESC]: '第一行\n第二行\n第三行' });
  });

  it('quest-only selection yields only quest files', async () => {
    expect(names(await exportFiles([quests('pack', 'split')], opts()))).toEqual(['modlangforge.snbt']);
  });

  it('separate-packs and lang-files give separate quest files, never a config tree or guide', async () => {
    expect(names(await exportFiles([mod, quests('pack')], opts({ kind: 'separate-packs' })))).toEqual(['ModLangForge-packs.zip', 'zh_tw.snbt']);
    expect(names(await exportFiles([mod, quests('pack')], opts({ kind: 'lang-files' })))).toEqual(['zh_tw.json', 'zh_tw.snbt']);
  });

  it('prefixes the modpack id when two modpacks are exported', async () => {
    expect(names(await exportFiles([quests('p'), quests('q', 'split')], opts()))).toEqual(['p-zh_tw.snbt', 'q-modlangforge.snbt']);
  });

  it('defaults to the single layout for stored projects without questLayout', async () => {
    const { questLayout: _layout, ...stored } = quests('pack', 'split');
    expect(names(await exportFiles([stored], opts()))).toEqual(['zh_tw.snbt']);
  });

  it('without quest projects it equals the plain export', async () => {
    expect(names(await exportFiles([mod], opts()))).toEqual(['ModLangForge-zh_tw.zip']);
  });
});
