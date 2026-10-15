import { describe, expect, it } from 'vitest';
import { countViolations, findCandidates, type GlossaryTerm, type MineEntry, renderMineReport } from './index';

const e = (modId: string, key: string, source: string, target: string): MineEntry => ({ modId, key, source, target });

describe('findCandidates', () => {
  const entries = [
    e('a', 'k1', 'Enchantment', '附魔'),
    e('b', 'k1', 'enchantment ', '魔咒'),
    e('c', 'k1', 'Enchantment', '附魔'),
    e('a', 'k2', 'Shaft', '傳動軸'),
    e('b', 'k2', 'Shaft', '傳動軸'),
    e('a', 'k3', 'A very long sentence here', '很長'),
    e('b', 'k3', 'A very long sentence here', '非常長'),
    e('a', 'k4', 'Redstone', ''),
    e('b', 'k4', 'Redstone', 'Redstone'),
    e('c', 'k5', 'Gem', '寶石'),
    e('d', 'k5', 'Gem', '寶珠'),
  ];

  it('groups short translated sources case-insensitively and keeps groups with several translations', () => {
    const result = findCandidates(entries);
    expect(result.map((c) => c.en)).toEqual(['enchantment', 'gem']);
    expect(result[0]).toEqual({
      en: 'enchantment',
      modCount: 3,
      variants: [
        { target: '附魔', refs: ['a:k1', 'c:k1'] },
        { target: '魔咒', refs: ['b:k1'] },
      ],
    });
  });
});

describe('countViolations', () => {
  const redstone: GlossaryTerm = { en: 'Redstone', zh: '紅石', level: 'warning' };
  const shaft: GlossaryTerm = { en: 'Shaft', zh: '傳動軸', level: 'warning' };

  it('counts violations per term using each mod’s terms, most violated first', () => {
    const entries = [
      e('a', 'k1', 'Redstone Dust', '紅色粉末'),
      e('b', 'k1', 'Redstone Torch', '紅色火把'),
      e('b', 'k2', 'Shaft', '軸'),
      e('c', 'k1', 'Shaft', '軸'),
    ];
    const termsFor = (modId: string) => (modId === 'b' ? [redstone, shaft] : [redstone]);
    expect(countViolations(entries, termsFor)).toEqual([
      { term: redstone, count: 2, refs: ['a:k1', 'b:k1'] },
      { term: shaft, count: 1, refs: ['b:k2'] },
    ]);
  });
});

describe('renderMineReport', () => {
  it('renders both sections', () => {
    const md = renderMineReport(
      [{ en: 'gem', modCount: 2, variants: [{ target: '寶石', refs: ['c:k5'] }, { target: '寶珠', refs: ['d:k5'] }] }],
      [{ term: { en: 'Shaft', zh: '傳動軸', level: 'warning' }, count: 1, refs: ['b:k2'] }],
    );
    expect(md).toContain('## 譯法不一致候選');
    expect(md).toContain('### gem（2 個模組）');
    expect(md).toContain('- 寶石：c:k5');
    expect(md).toContain('## 現有術語違規');
    expect(md).toContain('- Shaft → 傳動軸：1 次（b:k2）');
  });

  it('renders empty states', () => {
    const md = renderMineReport([], []);
    expect(md).toContain('沒有譯法不一致的候選。');
    expect(md).toContain('沒有術語違規。');
  });

  it('lists warnings first so incomplete reports are visible', () => {
    const md = renderMineReport([], [], ['以下模組有錯誤，未納入統計：alpha']);
    expect(md.indexOf('## 注意')).toBeGreaterThan(-1);
    expect(md.indexOf('## 注意')).toBeLessThan(md.indexOf('## 譯法不一致候選'));
    expect(md).toContain('- 以下模組有錯誤，未納入統計：alpha');
  });

  it('omits the warning section when there is nothing to warn about', () => {
    expect(renderMineReport([], [])).not.toContain('## 注意');
  });
});
