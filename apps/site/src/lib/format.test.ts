import { describe, expect, it } from 'vitest';
import { displayName, formatDate, formatPercent, formatSourceVersion, modPageDescription, modPageTitle } from './format';

describe('format helpers', () => {
  it('builds display name with optional Chinese name', () => {
    expect(displayName({ name: 'Create', nameZh: '機械動力' })).toBe('Create（機械動力）');
    expect(displayName({ name: 'JEI' })).toBe('JEI');
  });

  it('builds SEO title and description', () => {
    expect(modPageTitle({ name: 'Create', nameZh: '機械動力' })).toBe('Create（機械動力）繁體中文翻譯下載 | ModLangForge');
    expect(modPageDescription({ name: 'JEI', summary: '查配方。', mcVersions: ['1.20.1', '1.21.1'] }, 50))
      .toBe('JEI 繁體中文語言包，完成度 50%，支援 Minecraft 1.20.1、1.21.1。查配方。');
  });

  it('formats dates and clamps percentages', () => {
    expect(formatDate('2026-10-05')).toBe('2026 年 10 月 5 日');
    expect(formatDate('bad')).toBe('bad');
    expect(formatPercent(120)).toBe('100%');
    expect(formatPercent(-1)).toBe('0%');
    expect(formatPercent(66.6)).toBe('67%');
  });
});

describe('formatSourceVersion', () => {
  it('joins mc version, loader label and mod version', () => {
    expect(formatSourceVersion({ modVersion: '21.1.0.14', mcVersion: '1.21.1', loader: 'neoforge' })).toBe('1.21.1 · NeoForge · 21.1.0.14');
  });

  it('omits a missing mod version', () => {
    expect(formatSourceVersion({ mcVersion: '1.12.2', loader: 'forge' })).toBe('1.12.2 · Forge');
  });
});
