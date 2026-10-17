import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ModSummary } from '../lib/summary';
import { ModCard } from './ModCard';

const mod = (hasGuide: boolean): ModSummary => ({
  modId: 'demo', name: 'Demo', nameZh: null, summary: 's', mcVersions: ['1.20.1'], loaders: ['forge'],
  status: 'partial', percent: 50, total: 2, updatedAt: '2026-10-15', icon: null, hasGuide, translated: 1, banner: null, downloads: null,
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
});
