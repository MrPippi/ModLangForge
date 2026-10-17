import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GuideProgress } from './GuideProgress';

describe('GuideProgress', () => {
  it('shows guide progress with an accessible progress bar', () => {
    render(<GuideProgress stats={{ total: 4, translated: 3, warnings: 0, percent: 75 }} />);
    expect(screen.getByText('手冊 75%')).toBeInTheDocument();
    expect(screen.getByText(/3 \/ 4 段/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '手冊已翻譯 3 / 4 段' })).toHaveAttribute('aria-valuenow', '75');
    expect(screen.queryByText(/特殊符號/)).not.toBeInTheDocument();
  });

  it('mentions guide symbol warnings', () => {
    render(<GuideProgress stats={{ total: 4, translated: 3, warnings: 1, percent: 75 }} />);
    expect(screen.getByText('手冊有 1 段譯文的特殊符號（例如 $(item)）可能少打或多打')).toBeInTheDocument();
  });
});
