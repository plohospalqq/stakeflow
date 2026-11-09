import type { AskAnswer } from '@/api/types';
import { DeltaBadge } from '@/components/DeltaBadge';
import { useI18n } from '@/i18n/useI18n';
import { formatNumber } from '@/lib/format';

/** Horizontal bars: one per row, with last period's value as a thinner bar underneath. */
export function AskBars({ answer }: { answer: AskAnswer }) {
  const { m, t } = useI18n();
  const max = Math.max(...answer.chart.flatMap((b) => [b.value, b.previous ?? 0]), 0) || 1;
  const width = (v: number) => `${Math.max(0.5, (v / max) * 100)}%`;
  const top = answer.chart[0];
  const summary = top
    ? `${t(m.ask.barsAria, { n: answer.chart.length, unit: answer.chartUnit })}${
        answer.chartLegend.previous
          ? t(m.ask.barsAriaVs, { a: answer.chartLegend.current, b: answer.chartLegend.previous })
          : ''
      }${t(m.ask.barsAriaFirst, { label: top.label, value: formatNumber(top.value, 1) })}`
    : m.ask.emptyChart;

  return (
    <div role="img" aria-label={summary} className="flex flex-col gap-2.5 px-[18px] pb-4 pt-1">
      {answer.chart.map((b) => (
        <div
          key={b.label}
          className="grid grid-cols-[minmax(84px,130px)_minmax(0,1fr)_auto] items-center gap-3"
        >
          <span className="text-[13px]">{b.label}</span>
          <span className="flex flex-col gap-[3px]" aria-hidden="true">
            <span className="h-3 rounded-full bg-forecast" style={{ width: width(b.value) }} />
            {b.previous !== null ? (
              <span
                className="h-1.5 rounded-full bg-field-4"
                style={{ width: width(b.previous) }}
              />
            ) : null}
          </span>
          <span className="flex justify-end">
            {b.previous !== null && b.previous > 0 ? (
              <DeltaBadge value={(b.value / b.previous - 1) * 100} digits={0} />
            ) : (
              <span className="num text-[13px]">
                {formatNumber(b.value, 1)}
                <span className="lbl"> {answer.chartUnit}</span>
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
