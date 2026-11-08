import { describe, expect, it } from 'vitest';
import { circleRadius, labelThreshold, MIN_RADIUS, oilShareColor } from './mapScale';

describe('circleRadius', () => {
  it('makes circle area proportional to production', () => {
    // Four times the production → twice the radius → four times the area.
    expect(circleRadius(400) / circleRadius(100)).toBeCloseTo(2);
  });

  it('keeps tiny and missing fields visible', () => {
    expect(circleRadius(0.5)).toBe(MIN_RADIUS);
    expect(circleRadius(-1)).toBe(MIN_RADIUS);
  });
});

describe('labelThreshold', () => {
  it('returns the n-th largest value', () => {
    expect(labelThreshold([5, 800, 40, 600, 90], 3)).toBe(90);
  });

  it('labels everything when there are fewer fields than labels', () => {
    expect(labelThreshold([5, 8], 10)).toBe(5);
    expect(labelThreshold([], 10)).toBe(Infinity);
  });
});

describe('oilShareColor', () => {
  it('mixes the product tokens and clamps the share', () => {
    expect(oilShareColor(0.84)).toBe('color-mix(in lab, var(--oil) 84%, var(--gas))');
    expect(oilShareColor(1.4)).toContain('var(--oil) 100%');
  });
});
