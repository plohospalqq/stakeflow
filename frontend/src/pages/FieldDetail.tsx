import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  useField,
  useFieldForecast,
  useFieldHistory,
  useFieldOwnership,
  useFreshness,
} from '@/api/hooks';
import { isNotFound } from '@/api/http';
import { USE_MOCKS } from '@/api/mode';
import type { FieldDetail as Field, FieldForecast, FieldMonthly } from '@/api/types';
import { ChartCard } from '@/components/ChartCard';
import { FieldStatusChip } from '@/components/Chips';
import { DataTable } from '@/components/DataTable';
import { ErrorState } from '@/components/ErrorState';
import { KpiCard } from '@/components/KpiCard';
import { Page } from '@/components/layout/Page';
import { SampleBadge } from '@/components/SampleBadge';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Skeleton } from '@/components/Skeleton';
import { ProductionChart } from '@/components/charts/ProductionChart';
import type {
  ForecastPoint,
  ProductFilter,
  ProductPoint,
} from '@/components/charts/productionOption';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useUnits } from '@/hooks/useUnits';
import { FOCUS_ORDER } from '@/lib/companies';
import { downloadCsv, rowsToCsv } from '@/lib/csv';
import { addMonths } from '@/lib/dates';
import { plateau } from '@/lib/fieldStats';
import {
  formatDate,
  formatMonth,
  formatMonthName,
  formatNumber,
  formatShare,
  formatUtc,
} from '@/lib/format';
import { latestView } from '@/lib/latest';
import { productKind } from '@/lib/mix';
import { sm3ToKboed } from '@/lib/units';
import { MonthlyTable } from './field/MonthlyTable';
import { OwnershipTimeline } from './field/OwnershipTimeline';

const PRODUCT_OPTIONS = [
  { value: 'all', label: 'All' },
  {
    value: 'oil',
    label: (
      <>
        <span className="dot bg-oil" aria-hidden="true" />
        Oil
      </>
    ),
  },
  {
    value: 'gas',
    label: (
      <>
        <span className="dot bg-gas" aria-hidden="true" />
        Gas
      </>
    ),
  },
  {
    value: 'nglCond',
    label: (
      <>
        <span className="dot bg-cond" aria-hidden="true" />
        NGL + cond.
      </>
    ),
  },
] as const;

const PRODUCT_KEYS = { oil: 'oilSm3', gas: 'gasOeSm3', nglCond: 'nglCondSm3' } as const;

function productDot(kind: string): string | null {
  if (kind === 'Mainly oil') return 'var(--oil)';
  if (kind === 'Mainly gas') return 'var(--gas)';
  if (kind === 'Gas and condensate') return 'var(--cnd)';
  return null;
}

/** Share of a product in the last 12 months, used to split the total forecast. */
function productShare(history: FieldMonthly[], product: ProductFilter): number {
  if (product === 'all') return 1;
  const recent = history.slice(-12);
  const total = recent.reduce((s, h) => s + h.oeSm3, 0);
  const part = recent.reduce((s, h) => s + h[PRODUCT_KEYS[product]], 0);
  return total > 0 ? part / total : 0;
}

function csvFor(field: Field, history: FieldMonthly[]): string {
  return rowsToCsv(
    [
      { header: 'month', value: (h: FieldMonthly) => h.month },
      { header: 'oil_sm3', value: (h) => h.oilSm3 },
      { header: 'gas_oe_sm3', value: (h) => h.gasOeSm3 },
      { header: 'ngl_condensate_sm3', value: (h) => h.nglCondSm3 },
      { header: 'total_oe_sm3', value: (h) => h.oeSm3 },
      { header: 'gas_sm3', value: (h) => h.gasSm3 },
      {
        header: 'kboe_per_day',
        value: (h) => Math.round(sm3ToKboed(h.oeSm3, h.daysInMonth) * 1000) / 1000,
      },
      { header: 'field', value: () => field.name },
    ],
    history,
  );
}

function ForecastExplainer({
  forecast,
  history,
}: {
  forecast: FieldForecast | undefined;
  history: FieldMonthly[];
}) {
  const units = useUnits();
  const model = forecast?.model;
  const next12 = forecast?.points.slice(1, 13) ?? [];
  const last12 = history.slice(-12);
  const avg = (values: number[]) => values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
  const nextAvg = avg(next12.map((p) => units.fromMonth(p.p50, p.month)));
  const lastAvg = avg(last12.map((h) => units.fromMonth(h.oeSm3, h.month)));

  return (
    <aside className="card flex min-w-0 flex-col gap-3.5 px-[18px] py-4" aria-labelledby="hw-h">
      <h2 id="hw-h" className="m-0 text-h2">
        How to read the forecast
      </h2>
      <p className="m-0 text-[13px] text-muted">
        Fields produce less every year once the reservoir starts to drain. A{' '}
        <strong className="font-semibold text-ink">decline curve</strong> fits that slowdown and
        extends it forward.
      </p>
      <p className="m-0 text-[13px] text-muted">
        The dashed line is the most likely path. The shaded band is where production should land{' '}
        <strong className="font-semibold text-ink">8 times out of 10</strong>; it widens because the
        far future is less certain. Product views split the total by the last 12 months&apos; mix.
      </p>
      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <span className="flex items-center gap-2">
          <span className="cap">Model</span>
          <SampleBadge detail="Forecast model not in the backend yet" />
        </span>
        {model ? (
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[13px] [&_dd]:m-0 [&_dd]:text-right [&_dt]:text-muted">
            <dt>Method</dt>
            <dd>{model.method}</dd>
            <dt>b-factor</dt>
            <dd className="num">{formatNumber(model.b, 2)}</dd>
            <dt>Initial decline</dt>
            <dd className="num">{formatNumber(model.initialDeclinePctPerYear, 1)}% / yr</dd>
            <dt>Fitted on</dt>
            <dd>
              {model.fitWindow.start
                ? `${formatMonth(model.fitWindow.start)} – ${formatMonth(model.fitWindow.end)}`
                : '–'}
            </dd>
            <dt>Backtest error</dt>
            <dd className="num">{formatNumber(model.backtestErrorPct, 1)}%</dd>
            <dt>Model run</dt>
            <dd className="num">{formatUtc(model.runAt)}</dd>
          </dl>
        ) : (
          <Skeleton height={120} />
        )}
      </div>
      {next12.length > 0 && last12.length > 0 ? (
        <div className="rounded-control bg-surface2 px-3 py-2.5 text-[12px] text-muted">
          In the next 12 months the model expects{' '}
          <strong className="num text-ink">{units.format(nextAvg)}</strong> {units.label} on
          average,{' '}
          <strong className="text-ink">
            {formatNumber(Math.abs((nextAvg / lastAvg - 1) * 100), 1)}%{' '}
            {nextAvg < lastAvg ? 'lower' : 'higher'}
          </strong>{' '}
          than the last 12.
        </div>
      ) : null}
    </aside>
  );
}

function FocusShareCard({ field }: { field: Field }) {
  const units = useUnits();
  const latest = field.latest;
  const owners = FOCUS_ORDER.map((id) => {
    const share = field.currentOwners
      .filter((o) => o.groupId === id)
      .reduce((s, o) => s + o.sharePct, 0);
    const name = field.currentOwners.find((o) => o.groupId === id)?.groupName ?? id;
    return { id, name, share };
  }).filter((o) => o.share > 0);
  const total = latest ? units.fromMonth(latest.oeSm3, latest.month) : 0;

  return (
    <div className="card col-span-2 flex min-w-0 flex-col gap-1.5 px-4 py-3.5 nav:col-span-1">
      <span className="lbl">Focus companies&apos; share of output</span>
      {owners.length === 0 ? (
        <span className="text-[13px] text-muted">
          Aker BP, Vår Energi and Equinor hold no share in this field.
        </span>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {owners.map((o) => (
            <li key={o.id} className="flex items-baseline justify-between gap-2 text-[13px]">
              <Link to={`/companies/${o.id}`} className="link truncate">
                {o.name}
              </Link>
              <span className="flex items-baseline gap-1.5">
                <span className="num text-[16px] font-semibold">
                  {units.format((total * o.share) / 100)}
                </span>
                <span className="lbl num">{formatNumber(o.share, 2)}%</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <span className="lbl">{units.label} · today&apos;s share × latest month</span>
    </div>
  );
}

export default function FieldDetail() {
  const params = useParams();
  const id = Number(params.id);
  const units = useUnits();
  const isDesktop = useIsDesktop();
  const [product, setProduct] = useState<ProductFilter>('all');
  const freshness = useFreshness();
  const field = useField(id);
  const latestMonth = freshness.data?.latestMonth;
  const history = useFieldHistory(id, field.data?.firstProductionMonth, latestMonth);
  const forecast = useFieldForecast(id);
  const ownership = useFieldOwnership(id);

  const historyData = useMemo(() => history.data ?? [], [history.data]);

  const chartHistory = useMemo<ProductPoint[]>(
    () =>
      historyData.map((h) => ({
        month: h.month,
        oil: units.fromMonth(h.oilSm3, h.month),
        gas: units.fromMonth(h.gasOeSm3, h.month),
        nglCond: units.fromMonth(h.nglCondSm3, h.month),
      })),
    [historyData, units],
  );
  const share = productShare(historyData, product);
  const chartForecast = useMemo<ForecastPoint[]>(
    () =>
      (forecast.data?.points ?? []).map((p) => ({
        month: p.month,
        p10: units.fromMonth(p.p10, p.month) * share,
        p50: units.fromMonth(p.p50, p.month) * share,
        p90: units.fromMonth(p.p90, p.month) * share,
      })),
    [forecast.data, units, share],
  );

  const download = useCallback(() => {
    if (!field.data) return;
    const slug = field.data.name.toLowerCase().replace(/[^a-z0-9æøå]+/g, '-');
    downloadCsv(`stakeflow-${slug}-monthly.csv`, csvFor(field.data, historyData));
  }, [field.data, historyData]);

  if (field.isError) {
    return (
      <Page
        label={
          <Link to="/fields" className="link">
            Fields
          </Link>
        }
        title={isNotFound(field.error) ? 'Field not found' : 'Field unavailable'}
      >
        <ErrorState
          message={
            isNotFound(field.error)
              ? `There is no field with id ${params.id ?? ''}.${USE_MOCKS ? ' Mock mode only knows a subset of fields.' : ''}`
              : 'The field could not be loaded.'
          }
          onRetry={isNotFound(field.error) ? undefined : () => void field.refetch()}
        />
      </Page>
    );
  }

  const f = field.data;
  const latest = f?.latest ?? null;
  const view = latest ? latestView(latest, units.unit) : null;
  const kind = latest ? productKind(latest.mix) : null;
  const plateauStats = plateau(
    historyData.map((h) => ({ month: h.month, value: units.fromMonth(h.oeSm3, h.month) })),
  );
  const in12 = forecast.data?.points[12];
  const forecastEnd = forecast.data?.points[forecast.data.points.length - 1]?.month;
  const digits = units.unit === 'boe' ? 1 : 3;

  const chartTable = (
    <DataTable
      caption={`${f?.name ?? 'Field'} production by month, last 24 months and forecast`}
      dense
      maxHeight={320}
      rowKey={(r) => r.month}
      rows={[
        ...chartHistory.slice(-24).map((h) => ({
          month: h.month,
          kind: 'Actual',
          total: h.oil + h.gas + h.nglCond,
          range: '',
        })),
        ...chartForecast.slice(1, 13).map((p) => ({
          month: p.month,
          kind: 'Forecast (sample)',
          total: p.p50,
          range: `${units.format(p.p10, digits)}–${units.format(p.p90, digits)}`,
        })),
      ]}
      columns={[
        { id: 'month', header: 'Month', value: (r) => r.month, cell: (r) => formatMonth(r.month) },
        { id: 'kind', header: 'Type', value: (r) => r.kind },
        {
          id: 'total',
          header: units.label,
          align: 'right',
          value: (r) => r.total,
          cell: (r) => units.format(r.total, digits),
        },
        { id: 'range', header: '80% range', align: 'right', value: (r) => r.range },
      ]}
    />
  );

  const title = f?.name ?? 'Loading field…';
  return (
    <Page
      documentTitle={f?.name}
      label={
        <nav aria-label="Breadcrumb" className="flex gap-1.5">
          <Link to="/fields" className="text-muted underline-offset-2 hover:underline">
            Fields
          </Link>
          <span aria-hidden="true">/</span>
          <span>{f?.mainArea ?? '…'}</span>
        </nav>
      }
      title={title}
      meta={
        f ? (
          <div className="flex flex-wrap items-center gap-2">
            <FieldStatusChip status={f.status} />
            {f.operator ? <span className="chip">Operator · {f.operator.name}</span> : null}
            {kind ? (
              <span className="chip">
                {productDot(kind) ? (
                  <span
                    className="dot"
                    style={{ background: productDot(kind) ?? undefined }}
                    aria-hidden="true"
                  />
                ) : null}
                {kind}
              </span>
            ) : null}
          </div>
        ) : null
      }
      actions={
        <button
          type="button"
          className="btn"
          onClick={download}
          disabled={historyData.length === 0}
        >
          CSV
        </button>
      }
    >
      <section
        aria-label="Key numbers"
        className="grid grid-cols-2 gap-3 nav:grid-cols-[repeat(auto-fit,minmax(210px,1fr))] nav:gap-3.5"
      >
        <KpiCard
          label={latest ? `Production, ${formatMonth(latest.month)}` : 'Production'}
          value={field.isPending ? null : (view?.value ?? 0)}
          unit={units.label}
          format={(v) => units.format(v)}
          compact={!isDesktop}
          delta={
            view?.momPct !== null && view?.momPct !== undefined ? { value: view.momPct } : undefined
          }
          sub={latest ? `vs ${formatMonthName(addMonths(latest.month, -1))}` : 'no recent output'}
        />
        <KpiCard
          label={
            plateauStats
              ? `Plateau, ${plateauStats.fromYear}${plateauStats.toYear !== plateauStats.fromYear ? `–${String(plateauStats.toYear).slice(2)}` : ''}`
              : 'Plateau'
          }
          value={history.isPending ? null : (plateauStats?.value ?? 0)}
          unit={units.label}
          format={(v) => units.format(v)}
          compact={!isDesktop}
          delta={
            plateauStats && view
              ? { value: (view.value / plateauStats.value - 1) * 100 }
              : undefined
          }
          sub="now vs plateau"
        />
        <KpiCard
          label={in12 ? `Forecast, ${formatMonth(in12.month)}` : 'Forecast in 12 months'}
          value={forecast.isPending ? null : in12 ? units.fromMonth(in12.p50, in12.month) : 0}
          unit={units.label}
          format={(v) => units.format(v)}
          compact={!isDesktop}
          sample
          delta={
            in12 && view && view.value > 0
              ? { value: (units.fromMonth(in12.p50, in12.month) / view.value - 1) * 100 }
              : undefined
          }
          sub={
            in12
              ? `range ${units.format(units.fromMonth(in12.p10, in12.month))}–${units.format(units.fromMonth(in12.p90, in12.month))}`
              : 'no forecast for this field'
          }
        />
        {f ? (
          <FocusShareCard field={f} />
        ) : (
          <KpiCard label="Focus companies" value={null} unit="" format={String} />
        )}
      </section>

      <div className="flex flex-wrap items-stretch gap-4">
        <ChartCard
          className="min-w-0 flex-[3_1_640px]"
          title="Production history and forecast"
          subtitle={`Monthly, gross field · ${units.label}${forecastEnd ? ` · forecast to ${formatMonth(forecastEnd)}` : ''}`}
          info="Coloured areas are what the field produced each month, by product. The dashed line is the forecast's most likely path and the shaded band its 80% range. Gas is shown as oil equivalent (1,000 Sm³ gas = 1 Sm³ o.e.)."
          sample="The forecast (dashed line and band) is sample data; production history is from Sodir"
          actions={
            <SegmentedControl
              label="Product"
              value={product}
              onChange={setProduct}
              options={PRODUCT_OPTIONS}
            />
          }
          legend={[
            ...(product === 'all' || product === 'oil'
              ? [{ label: 'Oil', color: 'var(--oil)' }]
              : []),
            ...(product === 'all' || product === 'gas'
              ? [{ label: 'Gas', color: 'var(--gas)' }]
              : []),
            ...(product === 'all' || product === 'nglCond'
              ? [{ label: 'NGL + condensate', color: 'var(--cnd)' }]
              : []),
            { label: 'Forecast (median)', color: 'var(--fc)', kind: 'dashed' },
            { label: '80% range', color: 'var(--fc)', kind: 'band' },
          ]}
          source={{
            label: USE_MOCKS ? 'Sample data' : 'Sodir',
            asOf: latestMonth ? `through ${formatMonth(latestMonth)}` : undefined,
          }}
          state={
            history.isError
              ? 'error'
              : history.isPending || field.isPending
                ? 'loading'
                : historyData.length === 0
                  ? 'empty'
                  : 'ready'
          }
          onRetry={() => void history.refetch()}
          height={isDesktop ? 400 : 220}
          table={chartTable}
        >
          <ProductionChart
            history={chartHistory}
            forecast={chartForecast}
            product={product}
            events={forecast.data?.events}
            compact={!isDesktop}
            height={isDesktop ? 400 : 220}
            format={(v) => units.format(v, digits)}
            unitLabel={units.label}
            ariaLabel={`${f?.name ?? 'Field'} monthly production since ${
              historyData[0] ? formatMonth(historyData[0].month) : ''
            }${view ? `, latest ${units.format(view.value)} ${units.label}` : ''}, with a sample forecast to ${
              forecastEnd ? formatMonth(forecastEnd) : 'later'
            }`}
          />
        </ChartCard>
        <div className="flex min-w-0 flex-[1_1_280px]">
          <ForecastExplainer forecast={forecast.data} history={historyData} />
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-[3_1_640px]">
          <OwnershipTimeline
            periods={ownership.data}
            today={latestMonth ?? f?.lastProductionMonth ?? '2026-08-01'}
            firstProductionMonth={f?.firstProductionMonth ?? null}
          />
        </div>
        <aside
          className="card flex min-w-0 flex-[1_1_280px] flex-col gap-3 px-[18px] py-4"
          aria-labelledby="fx-h"
        >
          <h2 id="fx-h" className="m-0 text-h2">
            Field facts
          </h2>
          {f ? (
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[13px] [&_dd]:m-0 [&_dd]:text-right [&_dt]:text-muted">
              <dt>Operator</dt>
              <dd>{f.operator?.name ?? '–'}</dd>
              <dt>Area</dt>
              <dd>{f.mainArea ?? '–'}</dd>
              <dt>Discovered</dt>
              <dd className="num">{f.discoveryYear ?? '–'}</dd>
              <dt>On stream</dt>
              <dd className="num">
                {f.firstProductionMonth ? formatMonth(f.firstProductionMonth) : '–'}
              </dd>
              <dt>Status</dt>
              <dd>{f.status}</dd>
              <dt>Size</dt>
              <dd className="num">{f.areaKm2 ? `${formatNumber(f.areaKm2, 0)} km²` : '–'}</dd>
              <dt>Main product</dt>
              <dd>
                {latest
                  ? `${latest.mix.oil >= latest.mix.gas ? 'Oil' : 'Gas'} (≈${formatShare(Math.max(latest.mix.oil, latest.mix.gas))})`
                  : (f.hcType ?? '–')}
              </dd>
              <dt>Sodir type</dt>
              <dd>{f.hcType ?? '–'}</dd>
              <dt>Owners today</dt>
              <dd className="num">{f.currentOwners.length}</dd>
              <dt>Source</dt>
              <dd>
                {f.factpageUrl ? (
                  <a
                    href={f.factpageUrl}
                    className="text-muted underline underline-offset-2"
                    rel="noreferrer"
                    target="_blank"
                  >
                    Sodir FactPages
                  </a>
                ) : (
                  'Sodir'
                )}
              </dd>
            </dl>
          ) : (
            <Skeleton height={200} />
          )}
          {latestMonth && f?.lastProductionMonth && f.lastProductionMonth < latestMonth ? (
            <p className="lbl m-0">Last production reported {formatDate(f.lastProductionMonth)}.</p>
          ) : null}
        </aside>
      </div>

      <MonthlyTable history={historyData} loading={history.isPending} onDownload={download} />
    </Page>
  );
}
