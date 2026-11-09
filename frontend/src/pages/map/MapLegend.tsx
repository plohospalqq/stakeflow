import { useUnits } from '@/hooks/useUnits';
import { useI18n } from '@/i18n/useI18n';
import { circleRadius } from '@/lib/mapScale';

const SIZE_STEPS = [50, 250, 700];

/** Both encodings spelled out; drawn with the same scale functions as the map layers. */
export function MapLegend({ className }: { className?: string }) {
  const { m } = useI18n();
  const units = useUnits();
  return (
    <div className={`flex flex-col gap-3 ${className ?? ''}`}>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-muted">{m.map.legendColour}</span>
        <span className="oil-gas-ramp block h-2 w-full rounded-full" aria-hidden="true" />
        <span className="flex justify-between text-[12px] text-muted">
          <span>{m.products.oil}</span>
          <span>{m.products.gas}</span>
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-muted">{m.map.legendSize}</span>
        <span className="flex items-end gap-4 text-[12px] text-muted">
          {SIZE_STEPS.map((kboed) => {
            const d = circleRadius(kboed) * 2;
            return (
              <span key={kboed} className="flex flex-col items-center gap-1">
                <span
                  className="flex-none rounded-full border-[1.5px] border-muted"
                  style={{ width: d, height: d }}
                  aria-hidden="true"
                />
                <span className="num">
                  {units.format(units.fromRate(kboed), units.unit === 'boe' ? 0 : 2)}
                </span>
              </span>
            );
          })}
          <span className="pb-0.5">{units.label}</span>
        </span>
      </div>
    </div>
  );
}
