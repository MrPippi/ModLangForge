import { describe, expect, it } from 'vitest';
import { extractLegacyQuests, parseSnbt, questIdHex } from './index';

const DATA = parseSnbt('{\n\tversion: 13\n\ttitle: "Example Book"\n}');
const GROUPS = parseSnbt('{\n\tchapter_groups: [\n\t\t{ id: "0F0F0F0F0F0F0F0F", title: "Main" }\n\t\t{ id: "0E0E0E0E0E0E0E0E", title: "" }\n\t]\n}');
const CHAPTER = parseSnbt([
  '{',
  '\tid: "1A2B3C4D5E6F7081"',
  '\tgroup: "0F0F0F0F0F0F0F0F"',
  '\ttitle: "Getting Started"',
  '\tsubtitle: ["Your first steps", "in the pack"]',
  '\tquests: [',
  '\t\t{',
  '\t\t\tid: "44A5523F7A909209"',
  '\t\t\ttitle: "&aWelcome"',
  '\t\t\tsubtitle: "Read me"',
  '\t\t\tdescription: ["Line one", "", "{@pagebreak}", "Line two"]',
  '\t\t\ttasks: [{ id: "5555555555555555", type: "item", title: "Task title" }]',
  '\t\t}',
  '\t\t{ id: "#2b2b2b2b2b2b2b2b", title: "Lowercase id" }',
  '\t\t{ id: 255L, title: "Numeric id" }',
  '\t\t{ title: "No id" }',
  '\t\t{ id: "1", title: "Reserved id" }',
  '\t\t{ id: "44A5523F7A909209", title: "Duplicate" }',
  '\t\t{ id: "8000000000000000", title: "Too large" }',
  '\t\t{ id: "33333333333333333", title: "Too long" }',
  '\t\t{ id: "3333333333333333", subtitle: ["not a string"], description: "not a list" }',
  '\t]',
  '}',
].join('\n'));

describe('extractLegacyQuests', () => {
  it('moves inline text into keys like FTB Quests does on load', () => {
    const { texts } = extractLegacyQuests({ data: DATA, chapterGroups: GROUPS, chapters: [CHAPTER] });
    expect(Object.keys(texts)).toEqual([
      'file.0000000000000001.title',
      'chapter_group.0F0F0F0F0F0F0F0F.title',
      'chapter.1A2B3C4D5E6F7081.title',
      'chapter.1A2B3C4D5E6F7081.chapter_subtitle',
      'quest.44A5523F7A909209.title',
      'quest.44A5523F7A909209.quest_subtitle',
      'quest.44A5523F7A909209.quest_desc',
      'quest.2B2B2B2B2B2B2B2B.title',
      'quest.00000000000000FF.title',
    ]);
    expect(texts).toMatchObject({
      'file.0000000000000001.title': 'Example Book',
      'chapter.1A2B3C4D5E6F7081.chapter_subtitle': 'Your first steps\nin the pack',
      'quest.44A5523F7A909209.title': '&aWelcome',
      'quest.44A5523F7A909209.quest_desc': 'Line one\n\n{@pagebreak}\nLine two',
    });
  });

  it('follows FTB readID for ids and reports objects whose text cannot be matched', () => {
    expect(extractLegacyQuests({ chapters: [CHAPTER] }).notes).toEqual([
      '略過 4 個沒有有效 ID 的任務物件（遊戲載入時會重新產生 ID，無法對應翻譯）',
      '略過 1 個 ID 重複的任務物件',
    ]);
  });

  it('ignores fields of the wrong type like FTB does', () => {
    const chapter = parseSnbt('{ id: "1A2B3C4D5E6F7081", subtitle: "a string", quests: [{ id: "44A5523F7A909209", subtitle: ["a", "list"] }] }');
    expect(extractLegacyQuests({ chapters: [chapter] })).toEqual({ texts: {}, notes: [] });
  });

  it('returns nothing for an empty book', () => {
    expect(extractLegacyQuests({ chapters: [] })).toEqual({ texts: {}, notes: [] });
  });
});

describe('questIdHex', () => {
  it.each([
    [{ kind: 'string', value: '44A5523F7A909209' } as const, '44A5523F7A909209'],
    [{ kind: 'string', value: '#ff' } as const, '00000000000000FF'],
    [{ kind: 'number', raw: '255L' } as const, '00000000000000FF'],
    [{ kind: 'number', raw: '1' } as const, null],
    [{ kind: 'number', raw: '-5L' } as const, 'FFFFFFFFFFFFFFFB'],
    [{ kind: 'string', value: '-5' } as const, 'FFFFFFFFFFFFFFFB'],
    [{ kind: 'string', value: '0000000000000000F' } as const, '000000000000000F'],
    [{ kind: 'string', value: '7FFFFFFFFFFFFFFF' } as const, '7FFFFFFFFFFFFFFF'],
    [{ kind: 'string', value: '8000000000000000' } as const, null],
    [{ kind: 'string', value: '0' } as const, null],
    [{ kind: 'number', raw: '1.5d' } as const, null],
    [{ kind: 'string', value: 'xyz' } as const, null],
    [{ kind: 'boolean', value: true } as const, null],
    [undefined, null],
  ])('reads %j as %s', (value, expected) => {
    expect(questIdHex(value)).toBe(expected);
  });
});
