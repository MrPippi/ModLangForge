import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TranslationTag } from './TranslationTag';

describe('TranslationTag', () => {
  it('shows complete tag in primary tier', () => {
    render(<TranslationTag translated={10} total={10} percent={100} />);
    expect(screen.getByText('✓ 完整翻譯')).toHaveClass('bg-primary-soft');
  });

  it('caps nearly-complete at 99% in info tier', () => {
    render(<TranslationTag translated={1339} total={1340} percent={100} />);
    expect(screen.getByText('翻譯 99%')).toHaveClass('bg-info-soft');
  });

  it('uses warn tier below 70%', () => {
    render(<TranslationTag translated={1} total={10} percent={10} className="extra" />);
    const tag = screen.getByText('翻譯 10%');
    expect(tag).toHaveClass('bg-warn-soft');
    expect(tag).toHaveClass('extra');
  });
});
