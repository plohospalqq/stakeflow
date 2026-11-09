import type { ParsedScenario, ScenarioParams } from '@/api/types.scenario';
import type { Dict } from '@/i18n/types';
import { formatPct } from '@/lib/format';

/** "Oil −25% · Gas +10% · 6 months": what the parser understood, in the reader's words. */
export function describeParsed(
  parsed: ParsedScenario,
  m: Dict,
  months: (n: number) => string,
): string {
  const label: Record<keyof ScenarioParams, string> = {
    brentChangePct: m.scenarios.drivers.brent,
    ttfChangePct: m.scenarios.drivers.ttf,
    productionChangePct: m.scenarios.drivers.production,
    eurusdChangePct: m.scenarios.drivers.eurusd,
    horizonMonths: m.scenarios.horizon,
  };
  return parsed.recognised
    .map((key) =>
      key === 'horizonMonths'
        ? months(parsed.params.horizonMonths)
        : `${label[key]} ${formatPct(parsed.params[key], 0, true)}`,
    )
    .join(' · ');
}
