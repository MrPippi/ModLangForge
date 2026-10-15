import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useIncrementalList } from './useIncrementalList';

class MockObserver {
  static instances: MockObserver[] = [];
  readonly observed: Element[] = [];
  disconnected = false;
  constructor(private readonly callback: IntersectionObserverCallback) {
    MockObserver.instances.push(this);
  }
  observe(el: Element) { this.observed.push(el); }
  disconnect() { this.disconnected = true; }
  unobserve() {}
  takeRecords() { return []; }
  fire(isIntersecting: boolean) {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

const live = () => MockObserver.instances.filter((o) => !o.disconnected);

function Harness({ items, resetKey }: { items: readonly number[]; resetKey: string }) {
  const { visible, hasMore, sentinelRef } = useIncrementalList(items, resetKey, 2);
  return (
    <div>
      <span data-testid="count">{visible.length}</span>
      {hasMore && <div ref={sentinelRef} data-testid="sentinel" />}
    </div>
  );
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

afterEach(() => {
  MockObserver.instances = [];
  vi.unstubAllGlobals();
});

describe('useIncrementalList', () => {
  it('reveals one more page each time the sentinel intersects', () => {
    vi.stubGlobal('IntersectionObserver', MockObserver);
    render(<Harness items={range(5)} resetKey="k" />);
    expect(screen.getByTestId('count')).toHaveTextContent('2');
    act(() => live()[0]!.fire(true));
    expect(screen.getByTestId('count')).toHaveTextContent('4');
    act(() => live()[0]!.fire(false));
    expect(screen.getByTestId('count')).toHaveTextContent('4');
    act(() => live()[0]!.fire(true));
    expect(screen.getByTestId('count')).toHaveTextContent('5');
    expect(screen.queryByTestId('sentinel')).not.toBeInTheDocument();
    expect(live()).toHaveLength(0);
  });

  it('renders no sentinel and no observer when items fit in one page', () => {
    vi.stubGlobal('IntersectionObserver', MockObserver);
    render(<Harness items={range(2)} resetKey="k" />);
    expect(screen.getByTestId('count')).toHaveTextContent('2');
    expect(screen.queryByTestId('sentinel')).not.toBeInTheDocument();
    expect(MockObserver.instances).toHaveLength(0);
  });

  it('resets to the first page when resetKey changes', () => {
    vi.stubGlobal('IntersectionObserver', MockObserver);
    const { rerender } = render(<Harness items={range(5)} resetKey="a" />);
    act(() => live()[0]!.fire(true));
    expect(screen.getByTestId('count')).toHaveTextContent('4');
    rerender(<Harness items={range(5)} resetKey="b" />);
    expect(screen.getByTestId('count')).toHaveTextContent('2');
  });

  it('renders everything when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<Harness items={range(5)} resetKey="k" />);
    expect(screen.getByTestId('count')).toHaveTextContent('5');
    expect(screen.queryByTestId('sentinel')).not.toBeInTheDocument();
  });
});
