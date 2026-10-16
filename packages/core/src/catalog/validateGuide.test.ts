import { describe, expect, it } from 'vitest';
import type { GlossaryTerm } from '../glossary';
import { validateGuideData } from './index';

const PATH = 'guide/en_us/entries/intro.json';
const files = { [PATH]: JSON.stringify({ name: 'Intro', pages: [{ type: 'patchouli:text', text: 'Open $(br)the Wrench menu' }] }) };
const TEXT = 'guide/entries/intro.json#pages/0/text';

describe('validateGuideData', () => {
  it('accepts valid files and translations', () => {
    expect(validateGuideData(files, { 'guide/entries/intro.json#name': '簡介' })).toEqual([]);
  });

  it('reports broken, non-object and misplaced raw files as errors', () => {
    const issues = validateGuideData({
      [PATH]: '{"name":',
      'guide/en_us/entries/list.json': '[]',
      'guide/en_us/templates/custom.json': '{}',
    }, {});
    expect(issues).toEqual([
      { level: 'error', file: `patchouli/${PATH}`, message: expect.stringMatching(/^JSON 解析失敗：/) },
      { level: 'error', file: 'patchouli/guide/en_us/entries/list.json', message: '手冊檔頂層必須是物件' },
      { level: 'error', file: 'patchouli/guide/en_us/templates/custom.json', message: '手冊檔必須是 patchouli/<手冊>/en_us/ 下的 .json（templates/ 除外）' },
    ]);
  });

  it('reports malformed translation files as errors', () => {
    expect(validateGuideData(files, [])).toEqual([{ level: 'error', file: 'patchouli_zh_tw.json', message: '語言檔頂層必須是物件' }]);
    expect(validateGuideData(files, { [TEXT]: 1 })).toEqual([{ level: 'error', file: 'patchouli_zh_tw.json', key: TEXT, message: '值必須是字串' }]);
  });

  it('rejects unknown keys and warns about Patchouli format codes', () => {
    expect(validateGuideData(files, { 'guide/entries/missing.json#name': 'x', [TEXT]: '打開扳手選單' })).toEqual([
      { level: 'error', file: 'patchouli_zh_tw.json', key: 'guide/entries/missing.json#name', message: '手冊原文中沒有此 key' },
      { level: 'warning', file: 'patchouli_zh_tw.json', key: TEXT, message: '格式碼不一致：缺少 $(br)' },
    ]);
  });

  it('applies the glossary to guide text', () => {
    const terms: GlossaryTerm[] = [{ en: 'Wrench', zh: '扳手', level: 'error' }];
    expect(validateGuideData(files, { [TEXT]: '打開$(br)板手選單' }, terms)).toEqual([
      { level: 'error', file: 'patchouli_zh_tw.json', key: TEXT, message: '術語「Wrench」應譯為「扳手」' },
    ]);
  });
});
