import { useMemo } from 'react';
import { useChartTheme } from '@/hooks/useChartTheme';
import { useI18n } from '@/i18n/useI18n';
import { EChart } from './EChart';
import { buildProductionOption, type ProductionChartProps } from './productionOption';

export function ProductionChart(props: ProductionChartProps) {
  const t = useChartTheme();
  const { m } = useI18n();
  const { history, forecast, product, events, compact, format, unitLabel } = props;
  const option = useMemo(
    () =>
      buildProductionOption(
        t,
        { history, forecast, product, events, compact, format, unitLabel },
        { m },
      ),
    [t, history, forecast, product, events, compact, format, unitLabel, m],
  );
  return (
    <EChart
      option={option}
      height={props.height ?? (compact ? 200 : 320)}
      ariaLabel={props.ariaLabel}
    />
  );
}
