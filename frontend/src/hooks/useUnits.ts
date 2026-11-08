import { useMemo } from 'react';
import { formatVolume } from '@/lib/format';
import {
  UNIT_LABELS,
  monthToDisplay,
  quarterRateToDisplay,
  rateToDisplay,
  type Unit,
} from '@/lib/units';
import { useUnitStore } from '@/stores/unit';

export interface Units {
  unit: Unit;
  /** 'kboe/d' or 'MSm³ o.e./mo' */
  label: string;
  /** Spelled out, for subtitles and screen readers. */
  longLabel: string;
  /** Monthly Sm³ o.e. → display value. */
  fromMonth: (sm3: number, month: string) => number;
  /** Quarterly kboe/d → display value. */
  fromQuarterRate: (kboed: number, quarterStart: string) => number;
  /** Any kboe/d rate → display value (30.4-day month in Sm³ mode). */
  fromRate: (kboed: number) => number;
  format: (displayValue: number, digits?: number) => string;
}

/** One place every component reads the unit from, so a toggle updates every number. */
export function useUnits(): Units {
  const unit = useUnitStore((s) => s.unit);
  return useMemo(
    () => ({
      unit,
      label: UNIT_LABELS[unit].short,
      longLabel: UNIT_LABELS[unit].long,
      fromMonth: (sm3, month) => monthToDisplay(sm3, month, unit),
      fromQuarterRate: (kboed, quarterStart) => quarterRateToDisplay(kboed, quarterStart, unit),
      fromRate: (kboed) => rateToDisplay(kboed, unit),
      format: (value, digits) => formatVolume(value, unit, digits),
    }),
    [unit],
  );
}
