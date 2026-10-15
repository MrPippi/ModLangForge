import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ModSummary } from '../lib/summary';
import ModsBrowser from './ModsBrowser';

const mod = (modId: string, loaders: ModSummary['loaders'], mcVersions: string[]): ModSummary => ({
  modId, name: modId, nameZh: null, summary: '', mcVersions, loaders, status: 'partial', percent: 50, total: 2, updatedAt: '2026-10-01',
});

const mods = [mod('a', ['fabric'], ['1.20.1']), mod('b', ['forge'], ['1.21.1', '1.20.1']), mod('c', ['forge'], ['1.12.2'])];

describe('ModsBrowser', () => {
  it('shows count and empty state', async () => {
    render(<ModsBrowser mods={mods} />);
    expect(screen.getByText('共 3 個模組')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('載入器'), 'quilt');
    expect(screen.getByText('沒有符合條件的模組')).toBeInTheDocument();
  });

  it('lists versions newest first', () => {
    render(<ModsBrowser mods={mods} />);
    const options = Array.from((screen.getByLabelText('Minecraft 版本') as HTMLSelectElement).options).map((o) => o.value);
    expect(options).toEqual(['', '1.21.1', '1.20.1', '1.12.2']);
  });
});
