import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ModSummary } from '../lib/summary';
import { ModRow } from './ModRow';

const mod: ModSummary = {
  modId: 'demo', name: 'Demo', nameZh: '示範', summary: '一句話簡介', mcVersions: ['1.20.1'], loaders: ['forge'],
  status: 'reviewed', percent: 100, total: 2, updatedAt: '2026-10-15', icon: null, hasGuide: false,
  translated: 2, banner: '/mod-banners/demo.webp', downloads: { count: 12_000, platform: 'curseforge' }, builtinPercent: null,
};

describe('ModRow', () => {
  it('shows names, summary, tag and downloads, and never renders the banner even when the mod has one', () => {
    const { container } = render(<ModRow mod={mod} />);
    expect(screen.getByText('Demo')).toBeInTheDocument();
    expect(screen.getByText('示範')).toBeInTheDocument();
    expect(screen.getByText('一句話簡介')).toBeInTheDocument();
    expect(screen.getByText('✓ 完整翻譯')).toBeInTheDocument();
    expect(screen.getByText('⬇ 1 萬次下載')).toBeInTheDocument();
    expect(screen.getByText('CurseForge')).toBeInTheDocument();
    expect(container.querySelector('img[src^="/mod-banners/"]')).toBeNull();
  });

  it('omits the download count when unknown', () => {
    render(<ModRow mod={{ ...mod, downloads: null }} />);
    expect(screen.queryByText(/次下載/)).not.toBeInTheDocument();
  });

  it('shows the built-in tag instead of progress and status badge for built-in mods', () => {
    render(<ModRow mod={{ ...mod, status: 'builtin', percent: 100, translated: 0, total: 0 }} />);
    expect(screen.getByText('內建繁中')).toBeInTheDocument();
    expect(screen.queryByText('機器翻譯・待校對')).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('adds the built-in percentage for regular mods that partly ship zh_tw', () => {
    render(<ModRow mod={{ ...mod, status: 'machine', builtinPercent: 99 }} />);
    expect(screen.getByText('內建繁中 99%')).toBeInTheDocument();
  });
});
