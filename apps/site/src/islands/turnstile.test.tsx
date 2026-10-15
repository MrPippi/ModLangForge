import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';

beforeEach(() => {
  vi.resetModules();
  document.head.innerHTML = '';
  delete window.turnstile;
});

async function loadWidget() {
  return (await import('./TurnstileWidget')).default;
}

describe('TurnstileWidget', () => {
  it('injects the script once and renders every widget after it loads', async () => {
    const TurnstileWidget = await loadWidget();
    render(<><TurnstileWidget onToken={() => undefined} /><TurnstileWidget onToken={() => undefined} /></>);
    const scripts = document.head.querySelectorAll('script');
    expect(scripts).toHaveLength(1);
    const renderSpy = vi.fn(() => 'w');
    window.turnstile = { render: renderSpy, remove: vi.fn() } as never;
    await act(async () => { scripts[0]?.dispatchEvent(new Event('load')); });
    expect(renderSpy).toHaveBeenCalledTimes(2);
  });

  it('injects a fresh script after a failed load instead of waiting on the dead one', async () => {
    const TurnstileWidget = await loadWidget();
    const first = render(<TurnstileWidget onToken={() => undefined} />);
    const failed = document.head.querySelector('script');
    await act(async () => { failed?.dispatchEvent(new Event('error')); });
    first.unmount();
    render(<TurnstileWidget onToken={() => undefined} />);
    const scripts = document.head.querySelectorAll('script');
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).not.toBe(failed);
    const renderSpy = vi.fn(() => 'w');
    window.turnstile = { render: renderSpy, remove: vi.fn() } as never;
    await act(async () => { scripts[0]?.dispatchEvent(new Event('load')); });
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });
});
