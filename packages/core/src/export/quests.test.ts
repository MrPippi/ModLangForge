import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { parseSnbt, questProject, readQuestLang } from '../ftbquests';
import { buildProject, updateEntry } from '../merge';
import type { ModProject } from '../types';
import { zipFileNames, zipInnerZip, zipQuestTexts } from '../test/zipFiles';
import { buildBundle, type ExportOptions, exportProjects, INSTALL_GUIDE_FILE, installGuide, questBundleFiles } from './index';

const TITLE = 'quest.44A5523F7A909209.title';
const DESC = 'quest.44A5523F7A909209.quest_desc';
const SINGLE = 'config/ftbquests/quests/lang/zh_tw.snbt';
const SPLIT = 'config/ftbquests/quests/lang/zh_tw/modlangforge.snbt';

const mod = updateEntry(buildProject({ modId: 'a', name: 'A', version: '1', jarName: 'a.jar', format: 'json', source: { k: 'Key' }, order: ['k'] }, 1), 'k', '鍵', 2);

function quests(id: string, layout: 'single' | 'split' = 'single'): ModProject {
  const p = questProject({ id, name: id, version: '1' }, { layout, en: { [TITLE]: 'Welcome', [DESC]: 'Line one\nLine two' }, zh: {} }, 1);
  return updateEntry(p, DESC, '第一行\n第二行\n第三行', 2);
}

const opts = (o: Partial<ExportOptions> = {}): ExportOptions => ({ kind: 'merged-pack', untranslated: 'keep-source', mcVersion: '1.21.1', description: '測試', ...o });

async function unzip(blob: Blob): Promise<JSZip> {
  return JSZip.loadAsync(await blob.arrayBuffer());
}

describe('questBundleFiles', () => {
  it('writes translated entries only, at the path of each layout', () => {
    const files = questBundleFiles([{ modpackId: 'p', layout: 'split', translations: { [DESC]: '一\n二', [TITLE]: '' } }]);
    expect(files.map(([path]) => path)).toEqual([SPLIT]);
    expect(readQuestLang(parseSnbt(files[0]?.[1] ?? '')).texts).toEqual({ [DESC]: '一\n二' });
  });

  it('skips modpacks without translations and nests several modpacks in their own folders', () => {
    expect(questBundleFiles([{ modpackId: 'p', layout: 'single', translations: {} }])).toEqual([]);
    const two = questBundleFiles([
      { modpackId: 'p', layout: 'single', translations: { [TITLE]: '甲' } },
      { modpackId: 'q', layout: 'split', translations: { [TITLE]: '乙' } },
      { modpackId: 'r', layout: 'single', translations: {} },
    ]);
    expect(two.map(([path]) => path)).toEqual([`p/${SINGLE}`, `q/${SPLIT}`]);
  });
});

describe('buildBundle / installGuide', () => {
  it('puts the resource pack under resourcepacks/ next to the quest files and the install guide', async () => {
    const zip = await unzip(await buildBundle({
      title: 'ModLangForge 繁中翻譯 · Pack', resourcePack: { fileName: 'pack-zh_tw.zip', bytes: new Uint8Array([1, 2, 3]) },
      quests: [{ modpackId: 'pack', layout: 'single', translations: { [TITLE]: '歡迎' } }],
    }));
    expect(zipFileNames(zip)).toEqual([SINGLE, 'resourcepacks/pack-zh_tw.zip', INSTALL_GUIDE_FILE]);
    expect(await zip.file('resourcepacks/pack-zh_tw.zip')?.async('uint8array')).toEqual(new Uint8Array([1, 2, 3]));
    const guide = (await zip.file(INSTALL_GUIDE_FILE)?.async('string')) ?? '';
    expect(guide).toBe(installGuide('ModLangForge 繁中翻譯 · Pack', 'pack-zh_tw.zip', true));
  });

  it('explains every part in player-friendly words and leaves out missing parts', () => {
    const full = installGuide('標題', 'pack-zh_tw.zip', true);
    expect(full.split('\n')[0]).toBe('標題');
    expect(full).toContain('解壓縮到整合包的資料夾');
    expect(full).toContain('「選項 → 資源包」');
    expect(full).toContain('伺服器的 config 資料夾');
    const packOnly = installGuide('標題', 'pack-zh_tw.zip', false);
    expect(packOnly).not.toContain('FTB 任務');
    expect(installGuide('標題', null, true)).not.toContain('資源包」');
    expect(full).not.toContain('每個整合包各有一個資料夾');
    expect(installGuide('標題', null, true, true)).toContain('壓縮檔裡每個整合包各有一個資料夾，請把其中的 config 資料夾放到對應的整合包資料夾。');
  });
});

describe('exportProjects with quest projects', () => {
  it('merged-pack: nests the resource pack and adds the quest file', async () => {
    const result = await exportProjects([mod, quests('pack')], opts());
    expect(result.fileName).toBe('ModLangForge-zh_tw-bundle.zip');
    const zip = await unzip(result.blob);
    expect(zipFileNames(zip)).toEqual([SINGLE, 'resourcepacks/ModLangForge-zh_tw.zip', INSTALL_GUIDE_FILE]);
    const inner = await zipInnerZip(zip, 'resourcepacks/ModLangForge-zh_tw.zip');
    expect(zipFileNames(inner)).toEqual(['assets/a/lang/zh_tw.json', 'pack.mcmeta']);
    expect(await zipQuestTexts(zip, SINGLE)).toEqual({ [DESC]: '第一行\n第二行\n第三行' });
  });

  it('merged-pack with only quests has no resource pack', async () => {
    const result = await exportProjects([quests('pack', 'split')], opts());
    expect(result.fileName).toBe('ModLangForge-zh_tw-bundle.zip');
    expect(zipFileNames(await unzip(result.blob))).toEqual([SPLIT, INSTALL_GUIDE_FILE]);
  });

  it('separate-packs and lang-files add the quest files', async () => {
    const separate = await unzip((await exportProjects([mod, quests('pack')], opts({ kind: 'separate-packs' }))).blob);
    expect(zipFileNames(separate)).toEqual(['a-zh_tw.zip', SINGLE]);
    const lang = await exportProjects([quests('pack')], opts({ kind: 'lang-files', untranslated: 'keep-source' }));
    expect(lang.fileName).toBe('ModLangForge-lang.zip');
    const langZip = await unzip(lang.blob);
    expect(zipFileNames(langZip)).toEqual([SINGLE]);
    expect(await zipQuestTexts(langZip, SINGLE)).toEqual({ [DESC]: '第一行\n第二行\n第三行' });
  });

  it('keeps two modpacks apart', async () => {
    const zip = await unzip((await exportProjects([quests('p'), quests('q', 'split')], opts())).blob);
    expect(zipFileNames(zip)).toEqual([`p/${SINGLE}`, `q/${SPLIT}`, INSTALL_GUIDE_FILE]);
    const guide = (await zip.file(INSTALL_GUIDE_FILE)?.async('string')) ?? '';
    expect(guide).toContain('壓縮檔裡每個整合包各有一個資料夾，請把其中的 config 資料夾放到對應的整合包資料夾。');
  });

  it('defaults to the single layout for stored projects without questLayout', async () => {
    const { questLayout: _layout, ...stored } = quests('pack', 'split');
    const zip = await unzip((await exportProjects([stored], opts())).blob);
    expect(zipFileNames(zip)).toEqual([SINGLE, INSTALL_GUIDE_FILE]);
  });
});
