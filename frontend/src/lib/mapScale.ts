/**
 * Map encodings in one place so the map layers and the legend can never disagree:
 * circle area ∝ production (radius ∝ √kboe/d), colour = oil share on an oil→gas ramp.
 */

/** Free, key-less OpenFreeMap styles (checked to exist), one per app theme. */
export const MAP_STYLES = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron',
} as const;

/** Glyphs the OpenFreeMap styles serve; labels must use a font the style has. */
export const MAP_FONT = 'Noto Sans Regular';

/** The Norwegian shelf from the North Sea to the Barents Sea, [west, south], [east, north]. */
export const NCS_BOUNDS: [[number, number], [number, number]] = [
  [1.2, 55.8],
  [26.5, 72.8],
];

/** Pixels of radius per √(kboe/d) at the overview zoom. */
export const RADIUS_PER_SQRT_KBOED = 0.75;

/** Tiny fields still get a circle big enough to see and tap. */
export const MIN_RADIUS = 3;

export function circleRadius(kboed: number): number {
  return Math.max(MIN_RADIUS, RADIUS_PER_SQRT_KBOED * Math.sqrt(Math.max(0, kboed)));
}

/** Production of the n-th largest field: fields at or above it get a name label. */
export function labelThreshold(kboed: number[], count: number): number {
  const sorted = [...kboed].sort((a, b) => b - a);
  return sorted[Math.min(count, sorted.length) - 1] ?? Infinity;
}

/** CSS colour for an oil share, matching the map's Lab interpolation. */
export function oilShareColor(oilShare: number): string {
  const pct = Math.round(Math.min(1, Math.max(0, oilShare)) * 100);
  return `color-mix(in lab, var(--oil) ${pct}%, var(--gas))`;
}
