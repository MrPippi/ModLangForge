import { describe, expect, it } from 'vitest';
import { buildProject, projectStats } from '../merge';
import type { DetectedMod } from '../types';
import { checkFormat } from '../validate';
import {
  checkQuestFormat, extractQuestTokens, formatCheckFor, hasQuestWarning, isQuestProjectId, JSON_LINE, PAGEBREAK, PAGEBREAK_INLINE, parseQuestProjectId,
  questProjectId,
} from './index';

describe('extractQuestTokens', () => {
  it('finds colour codes, escaped ampersands, images and translation references', () => {
    expect(extractQuestTokens('&aHello &#FF00AA\\&b {image:ftbquests:textures/a.png width:50} {my.mod.key} {0} §Lbold &z')).toEqual([
      '&a', '&#ff00aa', '\\&', '{image:ftbquests:textures/a.png width:50}', '{my.mod.key}', '§l', '&z',
    ]);
  });

  it('only counts a page break that sits on its own line and marks whole-line JSON components', () => {
    expect(extractQuestTokens('Intro\n  {@pagebreak}  \nText {@pagebreak} more\n{"text":"Click","color":"gold"}\n["", {"text":"x"}]')).toEqual([
      PAGEBREAK, PAGEBREAK_INLINE, JSON_LINE, JSON_LINE,
    ]);
  });
});

describe('checkQuestFormat', () => {
  it('ignores the number of lines', () => {
    expect(checkQuestFormat('Line one\nLine two\nLine three', '第一行')).toBeNull();
  });

  it('reports missing colour codes, case-insensitively', () => {
    expect(checkQuestFormat('&aGreen', '綠色')).toEqual({ missing: ['&a'], extra: [] });
    expect(checkQuestFormat('&AGreen', '&a綠色')).toBeNull();
  });

  it('warns when a page break or JSON line no longer stands on its own line', () => {
    expect(checkQuestFormat('Intro\n{@pagebreak}\nMore', '介紹 {@pagebreak} 更多')).toEqual({ missing: [PAGEBREAK], extra: [PAGEBREAK_INLINE] });
    expect(checkQuestFormat('{"text":"Click"}', '請點 {"text":"點我"}')).toEqual({ missing: [JSON_LINE], extra: [] });
  });

  it('accepts an empty translation and ignores printf-like percent signs', () => {
    expect(checkQuestFormat('&aGreen', '')).toBeNull();
    expect(checkQuestFormat('50% chance', '50% 機率')).toBeNull();
  });

  it('flags entries and picks the checker by project id', () => {
    expect(hasQuestWarning({ key: 'k', source: '&aGo', target: '走', status: 'translated' })).toBe(true);
    expect(formatCheckFor('modpack-quests:example-pack')).toBe(checkQuestFormat);
    expect(formatCheckFor('create')).toBe(checkFormat);
    expect(formatCheckFor('modpack:example-pack:kubejs')).toBe(checkFormat);
  });
});

describe('quest project ids', () => {
  it('round-trips modpack-quests:<id>', () => {
    expect(questProjectId('example-pack')).toBe('modpack-quests:example-pack');
    expect(parseQuestProjectId('modpack-quests:example-pack')).toEqual({ modpackId: 'example-pack' });
    expect(isQuestProjectId('modpack-quests:example-pack')).toBe(true);
  });

  it.each([['create'], ['modpack-quests:'], ['modpack-quests:..'], ['modpack-quests:index'], ['modpack-quests:a:b'], ['modpack:a:b'], ['modpack-quests:A']])(
    'rejects %s', (id) => {
      expect(parseQuestProjectId(id)).toBeNull();
    },
  );
});

describe('projectStats for quest projects', () => {
  const detected: DetectedMod = {
    modId: 'ftbquests', name: 'q', version: '1', jarName: '', format: 'json',
    source: { a: 'Line one\nLine two' }, order: ['a'], zhTw: { a: '一行' },
  };

  it('uses the quest checker so a different number of lines is not a warning', () => {
    const plain = buildProject(detected, 1);
    expect(projectStats(plain).warnings).toBe(1);
    expect(projectStats({ ...plain, id: questProjectId('example-pack') }).warnings).toBe(0);
  });
});
