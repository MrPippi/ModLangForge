import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModIcon } from './ModIcon';

describe('ModIcon', () => {
  it('renders a decorative image when an icon exists', () => {
    const { container } = render(<ModIcon src="/mod-icons/create.webp" name="Create" size={40} />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/mod-icons/create.webp');
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('width')).toBe('40');
  });

  it('falls back to the first letter, hidden from screen readers', () => {
    const { container } = render(<ModIcon src={null} name="journeymap" size={40} />);
    expect(container.querySelector('img')).toBeNull();
    const span = container.querySelector('span')!;
    expect(span.textContent).toBe('J');
    expect(span.getAttribute('aria-hidden')).toBe('true');
  });
});
