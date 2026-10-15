import { describe, expect, it } from 'vitest';
import { validateGlossaryFile } from './index';

describe('validateGlossaryFile', () => {
  it('returns parsed terms with defaults', () => {
    expect(validateGlossaryFile({ terms: [{ en: 'Redstone', zh: '紅石' }] })).toEqual({
      ok: true, terms: [{ en: 'Redstone', zh: '紅石', level: 'warning' }],
    });
  });

  it('reports schema problems with their path', () => {
    const result = validateGlossaryFile({ terms: [{ en: 'Redstone' }] });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.messages[0]).toMatch(/^terms\.0\.zh：/);
  });

  it('reports duplicate English terms case-insensitively', () => {
    const result = validateGlossaryFile({ terms: [{ en: 'Shaft', zh: '軸' }, { en: 'shaft', zh: '傳動軸' }] });
    expect(result).toEqual({ ok: false, messages: ['術語「shaft」重複'] });
  });
});
