// Lets components pass CSS custom properties (--i, --len, --fill) in `style` without casts:
// the motion primitives in index.css read them for staggers, ring lengths and slider fills.
import 'react';

declare module 'react' {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
  }
}
