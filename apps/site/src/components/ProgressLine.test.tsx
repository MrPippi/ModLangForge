import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressLine } from './ProgressLine';

describe('ProgressLine', () => {
  it('shows one line of text and an accessible thin bar', () => {
    render(<ProgressLine translated={1234} total={1340} percent={92} detail="已翻譯 1,234 / 1,340 條" label="翻譯完成度" />);
    expect(screen.getByText('翻譯 92%')).toBeInTheDocument();
    expect(screen.getByText(/已翻譯 1,234 \/ 1,340 條/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '翻譯完成度' })).toHaveAttribute('aria-valuenow', '92');
  });

  it('shows the complete text when fully translated', () => {
    render(<ProgressLine translated={5} total={5} percent={100} detail="d" label="l" />);
    expect(screen.getByText('✓ 完整翻譯')).toBeInTheDocument();
  });

  it('uses a custom percent text when given', () => {
    render(<ProgressLine translated={3} total={4} percent={75} detail="3 / 4 段" label="l" percentText={(p) => `手冊 ${p}%`} />);
    expect(screen.getByText('手冊 75%')).toBeInTheDocument();
  });
});
