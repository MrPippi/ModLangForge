import { describe, expect, it } from 'vitest';
import { checkGuideFormat, extractGuideTokens } from './index';

describe('extractGuideTokens', () => {
  it('extracts Patchouli macros, lowercasing colours and collapsing tooltips', () => {
    const text = 'Use $(item)Wrench$() to $(l:basics/intro)read$(/l).$(br2)$(#FF0000)red$() $(t:Hover me)x$(/t) $(k:use)';
    expect(extractGuideTokens(text)).toEqual([
      '$(item)', '$()', '$(l:basics/intro)', '$(/l)', '$(br2)', '$(#ff0000)', '$()', '$(t:)', '$(/t)', '$(k:use)',
    ]);
  });

  it('ignores plain dollars and unclosed macros', () => {
    expect(extractGuideTokens('Costs $5 (cheap) $(item')).toEqual([]);
  });
});

describe('checkGuideFormat', () => {
  it('returns null for an empty target', () => {
    expect(checkGuideFormat('Use $(item)Wrench$()', '')).toBeNull();
  });

  it('reports missing Patchouli macros', () => {
    expect(checkGuideFormat('Use $(item)Wrench$()', '使用扳手')).toEqual({ missing: ['$(item)', '$()'], extra: [] });
  });

  it('also checks the regular format codes', () => {
    expect(checkGuideFormat('%s $(br)next', '%s 下一頁')).toEqual({ missing: ['$(br)'], extra: [] });
    expect(checkGuideFormat('Hi', '§a嗨')).toEqual({ missing: [], extra: ['§a'] });
  });

  it('accepts translated tooltip text and colour case differences', () => {
    expect(checkGuideFormat('$(t:Hover text)x$(/t) $(#FF0000)red$()', '$(t:提示)x$(/t) $(#ff0000)紅$()')).toBeNull();
  });

  it('requires link targets to stay identical', () => {
    expect(checkGuideFormat('$(l:basics/intro)Intro$(/l)', '$(l:basics/other)簡介$(/l)')).toEqual({
      missing: ['$(l:basics/intro)'], extra: ['$(l:basics/other)'],
    });
  });
});
