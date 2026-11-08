import { describe, expect, it } from 'vitest';
import { arpsRate } from './arps';

describe('arpsRate', () => {
  it('starts at qi', () => {
    expect(arpsRate(100, 0.6, 0.2, 0)).toBe(100);
  });

  it('declines more slowly than exponential for b > 0', () => {
    expect(arpsRate(100, 0.6, 0.2, 5)).toBeGreaterThan(arpsRate(100, 0, 0.2, 5));
  });

  it('falls back to exponential at b = 0', () => {
    expect(arpsRate(100, 0, 0.1, 1)).toBeCloseTo(100 * Math.exp(-0.1), 10);
  });
});
