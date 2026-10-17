import { describe, expect, it } from 'vitest';
import type { GlossaryTerm } from '../glossary';
import { validateKubejsData, validateModpackMeta } from './index';

const META = {
  id: 'example-pack', name: 'Example Pack', summary: '簡介', authors: ['someone'],
  links: { modrinth: 'https://modrinth.com/modpack/example-pack' },
  source: { platform: 'modrinth', projectId: 'AbCd1234', version: '1.0.0', mcVersion: '1.20.1', loader: 'forge' },
  mods: [],
  translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: '機器翻譯', url: null } },
  updatedAt: '2026-10-17',
};
const ZH = 'kubejs/kubejs/zh_tw.json';

describe('validateModpackMeta', () => {
  it('accepts a valid modpack.json in a matching folder', () => {
    expect(validateModpackMeta('example-pack', META)).toEqual([]);
  });

  it('reports schema errors with the field path', () => {
    expect(validateModpackMeta('example-pack', { ...META, source: { ...META.source, mcVersion: '9.9' } })).toEqual([
      { level: 'error', file: 'modpack.json', message: 'source.mcVersion：不支援的 Minecraft 版本' },
    ]);
    expect(validateModpackMeta('example-pack', [])[0]).toMatchObject({ level: 'error', file: 'modpack.json', message: expect.stringMatching(/^\(root\)：/) });
  });

  it('reports a folder name that differs from id', () => {
    expect(validateModpackMeta('other', META)).toEqual([
      { level: 'error', file: 'modpack.json', message: 'id「example-pack」與資料夾名稱「other」不一致' },
    ]);
  });
});

describe('validateKubejsData', () => {
  it('accepts matching texts', () => {
    expect(validateKubejsData('kubejs', { a: 'Gear %s' }, { a: '齒輪 %s' })).toEqual([]);
  });

  it('rejects invalid namespaces before reading texts', () => {
    expect(validateKubejsData('Bad', {}, {})).toEqual([
      { level: 'error', file: 'kubejs/Bad', message: '命名空間只能包含 a-z 0-9 _ . -，且不可為 . 或 ..' },
    ]);
  });

  it('reports malformed lang files as errors', () => {
    expect(validateKubejsData('kubejs', [], {})).toEqual([{ level: 'error', file: 'kubejs/kubejs/en_us.json', message: '語言檔頂層必須是物件' }]);
    expect(validateKubejsData('kubejs', { a: 'A' }, { a: 1 })).toEqual([{ level: 'error', file: ZH, key: 'a', message: '值必須是字串' }]);
  });

  it('rejects unknown keys and warns about format codes', () => {
    expect(validateKubejsData('kubejs', { a: 'Open %s' }, { x: '多', a: '打開' })).toEqual([
      { level: 'error', file: ZH, key: 'x', message: 'en_us.json 中沒有此 key' },
      { level: 'warning', file: ZH, key: 'a', message: '格式碼不一致：缺少 %s' },
    ]);
  });

  it('applies the glossary with the term level', () => {
    const terms: GlossaryTerm[] = [{ en: 'Redstone', zh: '紅石', level: 'error' }];
    expect(validateKubejsData('kubejs', { b: 'Redstone Dust' }, { b: '紅色粉末' }, terms)).toEqual([
      { level: 'error', file: ZH, key: 'b', message: '術語「Redstone」應譯為「紅石」' },
    ]);
  });
});
