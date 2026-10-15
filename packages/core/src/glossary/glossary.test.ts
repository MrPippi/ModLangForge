import { describe, expect, it } from 'vitest';
import { glossaryFileSchema, glossaryTermSchema, type GlossaryTerm, mergeGlossaries } from './index';

const term = (en: string, zh: string, level: GlossaryTerm['level'] = 'warning'): GlossaryTerm => ({ en, zh, level });

describe('glossaryTermSchema', () => {
  it('defaults level to warning and trims text', () => {
    expect(glossaryTermSchema.parse({ en: ' Cogwheel ', zh: ' 齒輪 ' })).toEqual({ en: 'Cogwheel', zh: '齒輪', level: 'warning' });
  });

  it('keeps note and an explicit error level', () => {
    expect(glossaryTermSchema.parse({ en: 'Enchantment', zh: '附魔', level: 'error', note: '原版' })).toEqual({
      en: 'Enchantment', zh: '附魔', level: 'error', note: '原版',
    });
  });

  it('rejects empty text and unknown levels', () => {
    expect(glossaryTermSchema.safeParse({ en: '  ', zh: '齒輪' }).success).toBe(false);
    expect(glossaryTermSchema.safeParse({ en: 'Cogwheel', zh: '' }).success).toBe(false);
    expect(glossaryTermSchema.safeParse({ en: 'Cogwheel', zh: '齒輪', level: 'fatal' }).success).toBe(false);
  });

  it('requires a terms array at the file level', () => {
    expect(glossaryFileSchema.safeParse({}).success).toBe(false);
    expect(glossaryFileSchema.parse({ terms: [] })).toEqual({ terms: [] });
  });
});

describe('mergeGlossaries', () => {
  it('lets module terms override global ones case-insensitively, keeping position', () => {
    const merged = mergeGlossaries([term('Shaft', '軸'), term('Redstone', '紅石')], [term('shaft', '傳動軸')]);
    expect(merged).toEqual([term('shaft', '傳動軸'), term('Redstone', '紅石')]);
  });

  it('appends module-only terms after global ones', () => {
    expect(mergeGlossaries([term('Redstone', '紅石')], [term('Cogwheel', '齒輪')]).map((t) => t.en)).toEqual(['Redstone', 'Cogwheel']);
  });

  it('does not mutate its inputs', () => {
    const global = [term('Shaft', '軸')];
    const mod = [term('Shaft', '傳動軸')];
    mergeGlossaries(global, mod);
    expect(global).toEqual([term('Shaft', '軸')]);
    expect(mod).toEqual([term('Shaft', '傳動軸')]);
  });
});
