import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CountUp } from '@/components/CountUp';
import { Rings } from '@/components/Rings';

/** A browser that does not ask for reduced motion (the test setup asks for it). */
function allowMotion() {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('motion primitives', () => {
  it('shows the final number at once when motion is reduced', () => {
    render(<CountUp value={4.22} format={(v) => v.toFixed(2)} />);
    // Both the visible copy and the screen-reader copy are final from the first paint.
    expect(screen.getAllByText('4.22')).toHaveLength(2);
  });

  it('counts up otherwise, and a timer guarantees the final value', () => {
    vi.useFakeTimers();
    allowMotion();
    const { container } = render(<CountUp value={100} format={(v) => v.toFixed(0)} />);
    const visible = container.querySelector('[aria-hidden="true"]');
    // Starts from zero; screen readers already get the final value.
    expect(visible?.textContent).toBe('0');
    expect(screen.getByText('100')).toHaveClass('sr-only');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(visible?.textContent).toBe('100');
  });

  it('draws rings complete at rest, without waiting for an observer', () => {
    const { container } = render(
      <Rings
        label="Oil 40%"
        rings={[{ key: 'oil', value: 0.4, color: 'red' }]}
        size={100}
        stroke={10}
      />,
    );
    const arc = container.querySelector('.draw-ring');
    const len = 2 * Math.PI * 45;
    expect(Number(arc?.getAttribute('stroke-dashoffset'))).toBeCloseTo(len * 0.6, 3);
    // No reveal flag without motion: the CSS draw animation never hides it.
    expect(container.querySelector('svg')?.getAttribute('data-reveal')).toBeNull();
  });
});
