import { describe, expect, it } from 'vitest';
import { checkGlossary, findTerms, type GlossaryTerm } from './index';

const term = (en: string, zh: string, level: GlossaryTerm['level'] = 'warning'): GlossaryTerm => ({ en, zh, level });
const ens = (terms: readonly GlossaryTerm[]) => terms.map((t) => t.en);

describe('findTerms', () => {
  const cog = term('Cogwheel', '齒輪');
  const large = term('Large Cogwheel', '大齒輪');
  const shaft = term('Shaft', '傳動軸');

  it('matches case-insensitively on whole words', () => {
    expect(ens(findTerms('place a COGWHEEL here', [cog]))).toEqual(['Cogwheel']);
    expect(findTerms('Shafting tool', [shaft])).toEqual([]);
  });

  it('accepts plural s and es on the last word', () => {
    expect(ens(findTerms('Two Cogwheels', [cog]))).toEqual(['Cogwheel']);
    expect(ens(findTerms('Glasses', [term('Glass', '玻璃')]))).toEqual(['Glass']);
  });

  it('matches multi-word terms across any whitespace', () => {
    expect(ens(findTerms('A Large\n  Cogwheel', [large]))).toEqual(['Large Cogwheel']);
  });

  it('drops a shorter term covered by a longer match', () => {
    expect(ens(findTerms('Large Cogwheel', [cog, large]))).toEqual(['Large Cogwheel']);
    expect(ens(findTerms('Large Cogwheel and Cogwheel', [cog, large]))).toEqual(['Large Cogwheel', 'Cogwheel']);
  });

  it('reports each term once, ordered by first appearance', () => {
    expect(ens(findTerms('Shaft, Cogwheel, Shaft', [cog, shaft]))).toEqual(['Shaft', 'Cogwheel']);
  });

  it('escapes regular-expression characters in terms', () => {
    const plus = term('C++', 'C 加加');
    const paren = term('Wand (Iron)', '鐵魔杖');
    expect(() => findTerms('Wand (Iron) and C++', [plus, paren])).not.toThrow();
    expect(ens(findTerms('Wand (Iron)', [plus, paren]))).toEqual(['Wand (Iron)']);
    expect(findTerms('Wand Iron', [paren])).toEqual([]);
  });
});

describe('checkGlossary', () => {
  const redstone = term('Redstone', '紅石');
  const ench = term('Enchantment', '附魔', 'error');
  const config = term('Config', '設定');

  it('reports a term whose translation is missing, with its level', () => {
    expect(checkGlossary('Redstone Dust', '紅色粉末', [redstone])).toEqual([{ term: redstone, level: 'warning' }]);
    expect(checkGlossary('Enchantment Table', '魔咒台', [ench])).toEqual([{ term: ench, level: 'error' }]);
  });

  it('accepts translations that contain the required term', () => {
    expect(checkGlossary('Redstone Dust', '紅石粉', [redstone])).toEqual([]);
    expect(checkGlossary('Config file', '設定檔', [config])).toEqual([]);
  });

  it('skips untranslated entries', () => {
    expect(checkGlossary('Redstone Dust', '', [redstone])).toEqual([]);
    expect(checkGlossary('Redstone Dust', '   ', [redstone])).toEqual([]);
    expect(checkGlossary('Redstone Dust', 'Redstone Dust', [redstone])).toEqual([]);
  });
});
