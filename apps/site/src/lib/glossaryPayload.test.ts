import { describe, expect, it } from 'vitest';
import type { GlossaryTerm } from '@mlf/core/glossary';
import { toGlossaryPayload, type SiteMod } from './data';

const term = (en: string, zh: string): GlossaryTerm => ({ en, zh, level: 'warning' });
const mod = (modId: string, glossary: GlossaryTerm[]) => ({ meta: { modId }, glossary }) as unknown as Pick<SiteMod, 'meta' | 'glossary'>;

describe('toGlossaryPayload', () => {
  it('includes global terms and only mods that have their own glossary', () => {
    expect(toGlossaryPayload([mod('create', [term('Shaft', '傳動軸')]), mod('jei', [])], [term('Redstone', '紅石')])).toEqual({
      version: 1,
      global: [term('Redstone', '紅石')],
      mods: { create: [term('Shaft', '傳動軸')] },
    });
  });
});
