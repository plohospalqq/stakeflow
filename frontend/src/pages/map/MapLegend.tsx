import { useUnits } from '@/hooks/useUnits';
import { circleRadius } from '@/lib/mapScale';

const SIZE_STEPS = [50, 250, 700];

/** Both encodings spelled out; drawn with the same scale functions as the map layers. */
export function MapLegend() {
  const units = useUnits();
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <span className="flex items-center gap-2 text-[12px]">
        <span className="cap">Colour = product</span>
        Oil
        <span className="oil-gas-ramp h-2 w-[90px] rounded" aria-hidden="true" />
        Gas
      </span>
      <span className="flex items-center gap-2.5 text-[12px] text-muted">
        <span className="cap">Size = production</span>
        {SIZE_STEPS.map((kboed) => {
          const d = circleRadius(kboed) * 2;
          return (
            <span key={kboed} className="flex items-center gap-1.5">
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
        <span>{units.label}</span>
      </span>
    </div>
  );
}
