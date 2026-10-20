import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ModSummary } from '../lib/summary';
import { ModCard } from './ModCard';

const mod = (hasGuide: boolean): ModSummary => ({
  modId: 'demo', name: 'Demo', nameZh: null, summary: 's', mcVersions: ['1.20.1'], loaders: ['forge'],
  status: 'partial', percent: 50, total: 2, updatedAt: '2026-10-15', icon: null, hasGuide, translated: 1, banner: null, downloads: null, builtinPercent: null,
});

describe('ModCard', () => {
  it('labels mods that include a guide book', () => {
    render(<ModCard mod={mod(true)} />);
    expect(screen.getByText('含手冊')).toBeInTheDocument();
  });

  it('shows no guide label otherwise', () => {
    render(<ModCard mod={mod(false)} />);
    expect(screen.queryByText('含手冊')).not.toBeInTheDocument();
  });

  it('shows the translation tag on the banner and the download count', () => {
    render(<ModCard mod={{ ...mod(false), banner: '/mod-banners/demo.webp', downloads: { count: 98_400_000, platform: 'modrinth' }, translated: 1, total: 2, percent: 50 }} />);
    expect(screen.getByText('翻譯 50%')).toBeInTheDocument();
    expect(screen.getByText('⬇ 9,840 萬次下載')).toBeInTheDocument();
    expect(screen.getByText('Modrinth')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('names CurseForge next to the count of a CurseForge-only mod', () => {
    render(<ModCard mod={{ ...mod(false), downloads: { count: 120_000_000, platform: 'curseforge' } }} />);
    expect(screen.getByText('⬇ 1.2 億次下載')).toBeInTheDocument();
    expect(screen.getByText('CurseForge')).toBeInTheDocument();
    expect(screen.queryByText('Modrinth')).not.toBeInTheDocument();
  });

  it('stacks the icon above the banner so it is not covered', () => {
    const { container } = render(<ModCard mod={mod(false)} />);
    const iconRow = container.querySelector('[aria-hidden="true"].font-pixel')?.parentElement;
    expect(iconRow).toHaveClass('relative', 'z-10');
  });

  it('hides the download line when there is no Modrinth count', () => {
    render(<ModCard mod={{ ...mod(false), downloads: null }} />);
    expect(screen.queryByText(/次下載/)).not.toBeInTheDocument();
  });

  it('shows the built-in tag instead of progress and status badge for built-in mods', () => {
    render(<ModCard mod={{ ...mod(false), status: 'builtin', percent: 100, translated: 0, total: 0 }} />);
    expect(screen.getByText('內建繁中')).toBeInTheDocument();
    expect(screen.queryByText('機器翻譯・待校對')).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('adds the built-in percentage for regular mods that partly ship zh_tw', () => {
    render(<ModCard mod={{ ...mod(false), status: 'machine', builtinPercent: 99 }} />);
    expect(screen.getByText('內建繁中 99%')).toBeInTheDocument();
  });
});
