import { describe, expect, it } from 'vitest';
import {
  isListKey, isQuestKey, joinLines, parseSnbt, questKey, questLangFileName, questLangText, readQuestLang, splitLines, writeSnbtLang,
} from './index';

const TITLE = 'quest.44A5523F7A909209.title';
const DESC = 'quest.44A5523F7A909209.quest_desc';
const CHAPTER = 'chapter.1A2B3C4D5E6F7081.title';

describe('quest keys', () => {
  it('accepts only the four object types and four fields with a 16-digit upper-case id', () => {
    expect(isQuestKey(TITLE)).toBe(true);
    expect(isQuestKey('chapter_group.0F0F0F0F0F0F0F0F.title')).toBe(true);
    expect(isQuestKey('file.0000000000000001.title')).toBe(true);
    for (const bad of ['quest.44a5523f7a909209.title', 'quest.44A5523F7A90920.title', 'task.44A5523F7A909209.title', 'reward_table.44A5523F7A909209.title', 'quest.44A5523F7A909209.description']) {
      expect(isQuestKey(bad)).toBe(false);
    }
  });

  it('knows which fields are lists and joins or splits lines', () => {
    expect(isListKey(DESC)).toBe(true);
    expect(isListKey('chapter.1A2B3C4D5E6F7081.chapter_subtitle')).toBe(true);
    expect(isListKey(TITLE)).toBe(false);
    expect(questKey('chapter', '1A2B3C4D5E6F7081', 'title')).toBe(CHAPTER);
    expect(joinLines(['a', '', 'b'])).toBe('a\n\nb');
    expect(splitLines('a\r\nb\n\nc')).toEqual(['a', 'b', '', 'c']);
  });
});

describe('writeSnbtLang', () => {
  it('writes quoted keys, escaped strings and string lists separated by commas', () => {
    expect(writeSnbtLang([[TITLE, 'Say "hi" \\ bye'], [DESC, ['a', 'b']]])).toBe(
      `{\n\t"${TITLE}": "Say \\"hi\\" \\\\ bye",\n\t"${DESC}": [\n\t\t"a",\n\t\t"b"\n\t]\n}\n`,
    );
    expect(writeSnbtLang([[DESC, []]])).toBe(`{\n\t"${DESC}": []\n}\n`);
    expect(writeSnbtLang([])).toBe('{\n}\n');
  });
});

describe('readQuestLang', () => {
  it('joins list fields with \\n and drops empty strings and empty lists', () => {
    const c = parseSnbt([
      '{',
      `\t${TITLE}: "Welcome"`,
      `\t${DESC}: ["Line one", "", "Line two"]`,
      `\t${CHAPTER}: ""`,
      '\tchapter.1A2B3C4D5E6F7081.chapter_subtitle: []',
      '}',
    ].join('\n'));
    expect(readQuestLang(c)).toEqual({ texts: { [TITLE]: 'Welcome', [DESC]: 'Line one\n\nLine two' }, skipped: 0 });
  });

  it('skips prototype-named and out-of-scope keys and values of the wrong type', () => {
    const c = parseSnbt([
      '{',
      '\t__proto__: "x"',
      '\tconstructor: "y"',
      '\ttask.5555555555555555.title: "Task"',
      '\treward_table.6666666666666666.title: "Loot"',
      `\t${TITLE}: ["not", "a string"]`,
      `\t${DESC}: "not a list"`,
      '\tquest.7777777777777777.quest_desc: ["ok", 1]',
      `\t${CHAPTER}: "Kept"`,
      '}',
    ].join('\n'));
    const read = readQuestLang(c);
    expect(read).toEqual({ texts: { [CHAPTER]: 'Kept' }, skipped: 7 });
    expect(Object.getPrototypeOf(read.texts)).toBe(Object.prototype);
  });
});

describe('questLangText', () => {
  it('writes list fields back as string lists and skips empty or invalid entries', () => {
    const text = questLangText({ [TITLE]: '歡迎', [DESC]: '第一行\n第二行', [CHAPTER]: '', 'task.5555555555555555.title': 'x' });
    expect(text).toBe(`{\n\t"${TITLE}": "歡迎",\n\t"${DESC}": [\n\t\t"第一行",\n\t\t"第二行"\n\t]\n}\n`);
    expect(JSON.parse(text)).toEqual({ [TITLE]: '歡迎', [DESC]: ['第一行', '第二行'] });
  });

  it('round-trips quotes, backslashes, tabs, CRLF and blank lines', () => {
    const translations = {
      [TITLE]: 'Tab\there "q" \\& back\\slash',
      [DESC]: '第一行\r\n第二行\n\n{@pagebreak}\n{"text":"點我","color":"gold"}',
      [CHAPTER]: 'Two\r\nlines',
    };
    expect(readQuestLang(parseSnbt(questLangText(translations))).texts).toEqual({
      [TITLE]: 'Tab\there "q" \\& back\\slash',
      [DESC]: '第一行\n第二行\n\n{@pagebreak}\n{"text":"點我","color":"gold"}',
      [CHAPTER]: 'Two\nlines',
    });
  });

  it('strips C0 control characters other than tab, newline and carriage return, so the output stays valid JSON', () => {
    const text = questLangText({ [TITLE]: 'a\u0001b\u0000\u001f', [DESC]: 'x\u0007y\nz', [CHAPTER]: '\u0002' });
    expect(JSON.parse(text)).toEqual({ [TITLE]: 'ab', [DESC]: ['xy', 'z'] });
    expect(readQuestLang(parseSnbt(text)).texts).toEqual({ [TITLE]: 'ab', [DESC]: 'xy\nz' });
  });
});

describe('questLangFileName', () => {
  it('uses zh_tw.snbt for single and modlangforge.snbt for split', () => {
    expect(questLangFileName('single')).toBe('zh_tw.snbt');
    expect(questLangFileName('split')).toBe('modlangforge.snbt');
  });
});
