import { describe, expect, it } from 'vitest';
import { PACK_FORMATS, packFormatFor } from './index';

describe('packFormatFor', () => {
  it('returns the major and minor resource pack format', () => {
    expect(packFormatFor('1.20.1')).toEqual({ mcVersion: '1.20.1', packFormat: 15, packFormatMinor: 0 });
    expect(packFormatFor('1.21.8')).toEqual({ mcVersion: '1.21.8', packFormat: 64, packFormatMinor: 0 });
  });

  it('throws for versions that are not in the table', () => {
    expect(() => packFormatFor('9.9')).toThrow('不支援的 Minecraft 版本：9.9');
    expect(() => packFormatFor('')).toThrow('不支援的 Minecraft 版本：');
  });
});

describe('PACK_FORMATS', () => {
  it('records a non-negative integer minor version on every row', () => {
    expect(PACK_FORMATS.every((f) => Number.isInteger(f.packFormatMinor) && f.packFormatMinor >= 0)).toBe(true);
  });
});
