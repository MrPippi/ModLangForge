import { describe, expect, it } from 'vitest';
import { MIN_MAX_FORMAT_FROM, PACK_FORMATS, packFormatFor, packMcmeta } from './index';

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

  it('lists every supported release newest first, 26.x before 1.21.x', () => {
    expect(PACK_FORMATS.map((f) => f.mcVersion)).toEqual([
      '26.3', '26.2', '26.1.2', '26.1.1', '26.1', '1.21.11', '1.21.10', '1.21.9',
      '1.21.8', '1.21.5', '1.21.4', '1.21.1', '1.20.6', '1.20.4', '1.20.1', '1.19.2', '1.18.2', '1.16.5', '1.12.2',
    ]);
  });

  it('records the 1.21.9+ formats from the spec', () => {
    expect(PACK_FORMATS.slice(0, 8).map((f) => [f.mcVersion, f.packFormat, f.packFormatMinor])).toEqual([
      ['26.3', 97, 1], ['26.2', 88, 0], ['26.1.2', 84, 0], ['26.1.1', 84, 0], ['26.1', 84, 0],
      ['1.21.11', 75, 0], ['1.21.10', 69, 0], ['1.21.9', 69, 0],
    ]);
  });

  it('never goes up in format from one row to the next', () => {
    const order = PACK_FORMATS.map((f) => f.packFormat * 1000 + f.packFormatMinor);
    expect(order).toEqual([...order].sort((a, b) => b - a));
  });
});

describe('packMcmeta', () => {
  const format = (packFormat: number, packFormatMinor = 0) => ({ mcVersion: 'x', packFormat, packFormatMinor });

  it('keeps pack_format below format 65', () => {
    expect(MIN_MAX_FORMAT_FROM).toBe(65);
    expect(packMcmeta(format(15), '說明')).toEqual({ pack: { pack_format: 15, description: '說明' } });
    expect(packMcmeta(format(64), '說明')).toEqual({ pack: { pack_format: 64, description: '說明' } });
  });

  it('writes min_format and max_format from format 65', () => {
    expect(packMcmeta(format(65), '說明')).toEqual({ pack: { description: '說明', min_format: [65, 0], max_format: [65, 0] } });
    expect(packMcmeta(format(69), '說明')).toEqual({ pack: { description: '說明', min_format: [69, 0], max_format: [69, 0] } });
    expect(packMcmeta(format(97, 1), '說明')).toEqual({ pack: { description: '說明', min_format: [97, 1], max_format: [97, 1] } });
  });

  it('writes the keys in the documented order', () => {
    expect(Object.keys(packMcmeta(format(64), 'd').pack)).toEqual(['pack_format', 'description']);
    expect(Object.keys(packMcmeta(format(97, 1), 'd').pack)).toEqual(['description', 'min_format', 'max_format']);
  });

  it('returns a fresh object and leaves the format untouched', () => {
    const f = Object.freeze(format(97, 1));
    const a = packMcmeta(f, 'd');
    const b = packMcmeta(f, 'd');
    expect(a).not.toBe(b);
    expect(f).toEqual({ mcVersion: 'x', packFormat: 97, packFormatMinor: 1 });
  });
});
