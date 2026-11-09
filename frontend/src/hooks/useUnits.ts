import { useMemo } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { formatVolume } from '@/lib/format';
import { monthToDisplay, quarterRateToDisplay, rateToDisplay, type Unit } from '@/lib/units';
import { useUnitStore } from '@/stores/unit';

export interface Units {
  unit: Unit;
  /** 'kboe/d' (expert) or 'k barrels/day' (simple words), in the active language. */
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
  /** Digits for small values in tables: 1 for kboe/d, 3 for MSm³. */
  digits: number;
}

/**
 * One place every component reads the unit from, so a toggle updates every number. Labels
 * follow the language and the Simple words / Expert mode ("k barrels/day" vs "kboe/d").
 */
export function useUnits(): Units {
  const unit = useUnitStore((s) => s.unit);
  const { m, v } = useI18n();
  return useMemo(
    () => ({
      unit,
      label: v(m.units[unit].short),
      longLabel: v(m.units[unit].long),
      fromMonth: (sm3, month) => monthToDisplay(sm3, month, unit),
      fromQuarterRate: (kboed, quarterStart) => quarterRateToDisplay(kboed, quarterStart, unit),
      fromRate: (kboed) => rateToDisplay(kboed, unit),
      format: (value, digits) => formatVolume(value, unit, digits),
      digits: unit === 'boe' ? 1 : 3,
    }),
    [unit, m, v],
  );
}
