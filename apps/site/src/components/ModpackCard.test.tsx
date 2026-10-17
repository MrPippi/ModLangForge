import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ModpackSummary } from '../lib/modpackSummary';
import { ModpackCard } from './ModpackCard';

const pack = (kubejs: ModpackSummary['kubejs']): ModpackSummary => ({
  id: 'example-pack', name: 'Example Pack', nameZh: '範例整合包', summary: '簡介', mcVersion: '1.20.1', loader: 'forge',
  status: 'machine', includedMods: 2, totalMods: 3, kubejs, updatedAt: '2026-10-17',
});

describe('ModpackCard', () => {
  it('shows names, Minecraft version, loader, included mods and KubeJS progress', () => {
    render(<ModpackCard pack={pack({ total: 3, translated: 2, percent: 67 })} />);
    expect(screen.getByRole('link', { name: 'Example Pack（範例整合包）' })).toHaveAttribute('href', '/modpacks/example-pack/');
    expect(screen.getByText('Minecraft 1.20.1')).toBeInTheDocument();
    expect(screen.getByText('Forge')).toBeInTheDocument();
    expect(screen.getByText('已收錄模組 2／3')).toBeInTheDocument();
    expect(screen.getByText('整合包文字 67%')).toBeInTheDocument();
  });

  it('says when the modpack has no text of its own', () => {
    render(<ModpackCard pack={pack(null)} />);
    expect(screen.getByText('沒有整合包自己的文字')).toBeInTheDocument();
  });
});
