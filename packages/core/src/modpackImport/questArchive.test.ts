import { describe, expect, it } from 'vitest';
import { makeJar } from '../test/makeJar';
import { CF_MANIFEST_121, MR_INDEX, MR_INDEX_121, QUEST_CHAPTER_SNBT, QUEST_EN, QUEST_LANG_SNBT } from '../test/modpackFixtures';
import { packZhTwQuestNote, readCurseZip, readMrpack, skippedQuestNote, unsupportedQuestNote } from './index';

const ROOT = 'overrides/config/ftbquests/quests';
const BACKSLASH = String.fromCharCode(92);

function pack(files: Readonly<Record<string, string>>, index: unknown = MR_INDEX_121): Promise<Uint8Array> {
  return makeJar({ 'modrinth.index.json': JSON.stringify(index), ...files });
}

async function quests(files: Readonly<Record<string, string>>, index?: unknown) {
  return (await readMrpack(await pack(files, index), 'p.mrpack')).ftbquests;
}

describe('readMrpack: FTB quests already translated by the pack', () => {
  it('notes a single lang/zh_tw.snbt (any case) without parsing it', async () => {
    expect(await quests({ [`${ROOT}/lang/en_us.snbt`]: QUEST_LANG_SNBT, [`${ROOT}/lang/ZH_TW.snbt`]: '{ broken' })).toEqual({
      quests: { status: 'supported', layout: 'single', en: QUEST_EN }, notes: [packZhTwQuestNote()],
    });
    expect(packZhTwQuestNote()).toBe('整合包已附 FTB 任務繁中（lang/zh_tw…）；網站下載會取代它，請先確認是否要把它的內容納入 ftbquests/zh_tw.json 或暫不收錄任務');
  });

  it('notes a split lang/zh_tw/**.snbt without parsing it', async () => {
    expect(await quests({
      [`${ROOT}/lang/en_us/quests.snbt`]: QUEST_LANG_SNBT,
      [`${ROOT}/lang/zh_tw/chapters/a.snbt`]: '{ broken',
    })).toEqual({ quests: { status: 'supported', layout: 'split', en: QUEST_EN }, notes: [packZhTwQuestNote()] });
  });
});

describe('readMrpack: FTB quests', () => {
  it('prefers lang/en_us.snbt (single) and reads nothing else', async () => {
    expect(await quests({
      [`${ROOT}/lang/en_us.snbt`]: QUEST_LANG_SNBT,
      [`${ROOT}/lang/zh_tw.snbt`]: '{ broken',
      [`${ROOT}/lang/en_us/extra.snbt`]: '{ broken',
      [`${ROOT}/chapters/broken.snbt`]: '{ broken',
    })).toEqual({ quests: { status: 'supported', layout: 'single', en: QUEST_EN }, notes: [packZhTwQuestNote()] });
  });

  it('matches the locale file name case-insensitively and notes out-of-scope keys', async () => {
    const lang = '{\n\tquest.44A5523F7A909209.title: "Welcome"\n\ttask.5555555555555555.title: "Collect"\n\treward_table.6666666666666666.title: "Loot"\n}';
    expect(await quests({ [`${ROOT}/lang/en_US.snbt`]: lang })).toEqual({
      quests: { status: 'supported', layout: 'single', en: { 'quest.44A5523F7A909209.title': 'Welcome' } },
      notes: [skippedQuestNote(2)],
    });
    expect(skippedQuestNote(2)).toBe('略過 2 條不在翻譯範圍或格式不符的任務文字（例如獎勵表、任務項目的標題）');
  });

  it('merges every file under lang/en_us/ (split), including JSON5-style files', async () => {
    expect(await quests({
      [`${ROOT}/lang/en_us/chapters/getting_started.snbt`]: '{\n  "chapter.1A2B3C4D5E6F7081.title": "Getting Started",\n}\n',
      [`${ROOT}/lang/en_us/quests.snbt`]: '{\n\tquest.44A5523F7A909209.title: "Welcome"\n\tquest.44A5523F7A909209.quest_desc: ["Line one", "Line two"]\n}',
    })).toEqual({ quests: { status: 'supported', layout: 'split', en: QUEST_EN }, notes: [] });
  });

  it('extracts text from chapter files when there is no lang file (single)', async () => {
    expect(await quests({
      [`${ROOT}/data.snbt`]: '{\n\tversion: 13\n\ttitle: "Example Book"\n}',
      [`${ROOT}/chapters/getting_started.snbt`]: QUEST_CHAPTER_SNBT,
      [`${ROOT}/chapters/nested/ignored.snbt`]: '{ broken',
    })).toEqual({ quests: { status: 'supported', layout: 'single', en: { 'file.0000000000000001.title': 'Example Book', ...QUEST_EN } }, notes: [] });
  });

  it('reads entry names written with backslashes', async () => {
    const name = [ROOT, 'lang', 'en_us.snbt'].join('/').split('/').join(BACKSLASH);
    expect((await quests({ [name]: QUEST_LANG_SNBT })).quests).toEqual({ status: 'supported', layout: 'single', en: QUEST_EN });
  });

  it('skips quest text below Minecraft 1.21 without parsing it', async () => {
    expect(await quests({ [`${ROOT}/chapters/a.snbt`]: '{ broken' }, MR_INDEX)).toEqual({
      quests: { status: 'unsupported-version' }, notes: [unsupportedQuestNote('1.20.1')],
    });
    expect(unsupportedQuestNote('1.20.1')).toBe('整合包為 Minecraft 1.20.1（低於 1.21），FTB 任務文字暫不支援翻譯，已略過');
  });

  it('returns nothing without quest files or without any text', async () => {
    expect(await quests({})).toEqual({ quests: null, notes: [] });
    expect(await quests({ [`${ROOT}/chapters/nested/x.snbt`]: '{}' })).toEqual({ quests: null, notes: [] });
    expect(await quests({ [`${ROOT}/chapters/a.snbt`]: '{ title: "No id" }' })).toEqual({
      quests: null, notes: ['略過 1 個沒有有效 ID 的任務物件（遊戲載入時會重新產生 ID，無法對應翻譯）'],
    });
  });

  it('stops with the file path and line when a quest file cannot be parsed', async () => {
    await expect(quests({ [`${ROOT}/lang/en_us.snbt`]: '{\n\tquest.44A5523F7A909209.title: "x\n}' })).rejects.toThrow(
      `${ROOT}/lang/en_us.snbt 解析失敗：第 2 行：字串缺少結尾的引號（字串不可跨行）`,
    );
  });

  it('counts quest files against the shared decompressed budget', async () => {
    const bytes = await pack({ [`${ROOT}/lang/en_us.snbt`]: QUEST_LANG_SNBT });
    const budget = JSON.stringify(MR_INDEX_121).length + 10;
    await expect(readMrpack(bytes, 'p.mrpack', { maxUncompressedBytes: budget })).rejects.toThrow('p.mrpack 解壓後內容超過');
    expect((await readMrpack(bytes, 'p.mrpack')).ftbquests.quests).toEqual({ status: 'supported', layout: 'single', en: QUEST_EN });
  });
});

describe('readCurseZip: FTB quests', () => {
  it('reads quest text from a CurseForge zip', async () => {
    const bytes = await makeJar({ 'manifest.json': JSON.stringify(CF_MANIFEST_121), [`${ROOT}/lang/en_us.snbt`]: QUEST_LANG_SNBT });
    expect((await readCurseZip(bytes, 'p.zip')).ftbquests).toEqual({ quests: { status: 'supported', layout: 'single', en: QUEST_EN }, notes: [] });
  });
});
