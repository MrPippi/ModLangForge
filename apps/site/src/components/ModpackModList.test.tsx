import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModpackModList } from './ModpackModList';

describe('ModpackModList', () => {
  it('links included mods with progress and lists missing mods with platform links', () => {
    render(
      <ModpackModList
        included={[{ modId: 'create', name: 'Create', nameZh: '機械動力', percent: 50 }]}
        missing={[{ platform: 'curseforge', projectId: '1', slug: 'mystery-mod' }]}
      />,
    );
    expect(screen.getByRole('heading', { name: '已收錄（1 個）' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create（機械動力）' })).toHaveAttribute('href', '/mods/create/');
    expect(screen.getByText('完成 50%')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '尚未收錄（1 個）' })).toBeInTheDocument();
    expect(screen.getByText('mystery-mod')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /CurseForge/ })).toHaveAttribute('href', 'https://www.curseforge.com/minecraft/mc-mods/mystery-mod');
  });

  it('explains an empty list and hides the missing section when nothing is missing', () => {
    render(<ModpackModList included={[]} missing={[]} />);
    expect(screen.getByText('這個整合包的模組都還沒有收錄翻譯。')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /尚未收錄/ })).not.toBeInTheDocument();
  });
});
