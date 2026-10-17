import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModBanner } from './ModBanner';

describe('ModBanner', () => {
  it('lazy-loads by default and eager-loads above the fold', () => {
    const { container, rerender } = render(<ModBanner src="/mod-banners/a.webp" name="A" fallback="none" />);
    expect(container.querySelector('img')?.getAttribute('loading')).toBe('lazy');
    rerender(<ModBanner src="/mod-banners/a.webp" name="A" fallback="none" eager />);
    expect(container.querySelector('img')?.getAttribute('loading')).toBe('eager');
  });

  it('renders nothing without a banner when fallback is none', () => {
    const { container } = render(<ModBanner src={null} name="A" fallback="none" />);
    expect(container).toBeEmptyDOMElement();
  });
});
