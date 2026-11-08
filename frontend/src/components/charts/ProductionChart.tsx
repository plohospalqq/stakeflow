import { useMemo } from 'react';
import { useChartTheme } from '@/hooks/useChartTheme';
import { EChart } from './EChart';
import { buildProductionOption, type ProductionChartProps } from './productionOption';

export function ProductionChart(props: ProductionChartProps) {
  const t = useChartTheme();
  const { history, forecast, product, events, compact, format, unitLabel } = props;
  const option = useMemo(
    () =>
      buildProductionOption(t, { history, forecast, product, events, compact, format, unitLabel }),
    [t, history, forecast, product, events, compact, format, unitLabel],
  );
  return (
    <EChart
      option={option}
      height={props.height ?? (compact ? 200 : 320)}
      ariaLabel={props.ariaLabel}
    />
  );
}
