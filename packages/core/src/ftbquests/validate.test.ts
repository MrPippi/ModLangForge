import { describe, expect, it } from 'vitest';
import type { GlossaryTerm } from '../glossary';
import { catalogModpackSchema, validateModpackMeta } from '../modpack';
import { questApiSchema, supportsQuestLang, validateQuestData } from './index';

const META = {
  id: 'example-quests', name: 'Example Quests', summary: '簡介', authors: ['someone'],
  links: { modrinth: 'https://modrinth.com/modpack/example-quests' },
  source: { platform: 'modrinth', projectId: 'AbCd1234', version: '1.0.0', mcVersion: '1.21.1', loader: 'neoforge' },
  mods: [],
  translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: '機器翻譯', url: null } },
  updatedAt: '2026-10-17',
};
const OLD_SOURCE = { ...META.source, mcVersion: '1.20.1', loader: 'forge' };
const TITLE = 'quest.44A5523F7A909209.title';
const DESC = 'quest.44A5523F7A909209.quest_desc';
const EN = 'ftbquests/en_us.json';
const ZH = 'ftbquests/zh_tw.json';

function messages(raw: unknown): string[] {
  const result = catalogModpackSchema.safeParse(raw);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}：${i.message}`);
}

describe('ftbquests in modpack.json', () => {
  it('accepts supported with a layout, unsupported-version without one, or no field at all', () => {
    expect(messages({ ...META, ftbquests: { status: 'supported', layout: 'split' } })).toEqual([]);
    expect(messages({ ...META, source: OLD_SOURCE, ftbquests: { status: 'unsupported-version' } })).toEqual([]);
    expect(catalogModpackSchema.parse(META).ftbquests).toBeUndefined();
  });

  it('rejects a missing layout, a layout on unsupported-version and unknown values', () => {
    for (const ftbquests of [{ status: 'supported' }, { status: 'unsupported-version', layout: 'single' }, { status: 'supported', layout: 'flat' }, { status: 'maybe' }]) {
      expect(messages({ ...META, ftbquests })[0]).toMatch(/^ftbquests/);
    }
  });

  it('checks the Minecraft version against the status', () => {
    expect(validateModpackMeta('example-quests', { ...META, ftbquests: { status: 'supported', layout: 'single' } })).toEqual([]);
    expect(validateModpackMeta('example-quests', { ...META, source: OLD_SOURCE, ftbquests: { status: 'supported', layout: 'single' } })).toEqual([
      { level: 'error', file: 'modpack.json', message: 'ftbquests 為 supported 時，source.mcVersion 必須是 1.21 以上' },
    ]);
    expect(validateModpackMeta('example-quests', { ...META, ftbquests: { status: 'unsupported-version' } })).toEqual([
      { level: 'error', file: 'modpack.json', message: 'ftbquests 為 unsupported-version 時，source.mcVersion 必須低於 1.21' },
    ]);
  });
});

describe('supportsQuestLang', () => {
  it.each([['1.20.1', false], ['1.12.2', false], ['0.21', false], ['abc', false], ['1.21', true], ['1.21.1', true], ['1.21.8', true], ['26.1.2', true]])(
    '%s → %s', (version, expected) => {
      expect(supportsQuestLang(version)).toBe(expected);
    },
  );
});

describe('questApiSchema', () => {
  it('validates quest keys and the layout of supported payloads', () => {
    expect(questApiSchema.safeParse({ status: 'supported', layout: 'single', en_us: { [TITLE]: 'Hi' }, zh_tw: {} }).success).toBe(true);
    expect(questApiSchema.safeParse({ status: 'unsupported-version' }).success).toBe(true);
    expect(questApiSchema.safeParse({ status: 'supported', layout: '../x', en_us: {}, zh_tw: {} }).success).toBe(false);
    expect(questApiSchema.safeParse({ status: 'supported', layout: 'single', en_us: { 'task.5555555555555555.title': 'x' }, zh_tw: {} }).success).toBe(false);
  });
});

describe('validateQuestData', () => {
  it('accepts matching texts, ignoring a different number of lines', () => {
    expect(validateQuestData({ [TITLE]: '&aHi', [DESC]: 'a\nb\nc' }, { [TITLE]: '&a嗨', [DESC]: '一行' })).toEqual([]);
  });

  it('reports malformed files as errors', () => {
    expect(validateQuestData([], {})).toEqual([{ level: 'error', file: EN, message: '語言檔頂層必須是物件' }]);
    expect(validateQuestData({ [TITLE]: 'a' }, { [TITLE]: 1 })).toEqual([{ level: 'error', file: ZH, key: TITLE, message: '值必須是字串' }]);
  });

  it('rejects keys that do not follow the FTB key format', () => {
    expect(validateQuestData({ 'task.5555555555555555.title': 'x', [TITLE]: 'y' }, {})).toEqual([
      { level: 'error', file: EN, key: 'task.5555555555555555.title', message: 'key 格式不符（應為 <類型>.<16 位十六進位 ID>.<欄位>）' },
    ]);
  });

  it('rejects unknown translated keys and warns about quest format codes', () => {
    expect(validateQuestData({ [TITLE]: '&aHi', [DESC]: 'a\nb' }, { [DESC]: '一', 'quest.1111111111111111.title': 'x', [TITLE]: '嗨' })).toEqual([
      { level: 'error', file: ZH, key: 'quest.1111111111111111.title', message: 'en_us.json 中沒有此 key' },
      { level: 'warning', file: ZH, key: TITLE, message: '格式碼不一致：缺少 &a' },
    ]);
  });

  it('applies the glossary with the term level', () => {
    const terms: GlossaryTerm[] = [{ en: 'Redstone', zh: '紅石', level: 'error' }];
    expect(validateQuestData({ [TITLE]: 'Redstone Dust' }, { [TITLE]: '紅色粉末' }, terms)).toEqual([
      { level: 'error', file: ZH, key: TITLE, message: '術語「Redstone」應譯為「紅石」' },
    ]);
  });
});
