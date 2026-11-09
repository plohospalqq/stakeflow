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
import type { FieldDetail as Field, FieldMonthly } from '@/api/types';
import { ChartCard } from '@/components/ChartCard';
import { FieldStatusChip } from '@/components/Chips';
import { DataTable } from '@/components/DataTable';
import { ErrorState } from '@/components/ErrorState';
import { Icon } from '@/components/Icon';
import { KpiCard } from '@/components/KpiCard';
import { Page } from '@/components/layout/Page';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Skeleton } from '@/components/Skeleton';
import { Term } from '@/components/Term';
import { ProductionChart } from '@/components/charts/ProductionChart';
import type {
  ForecastPoint,
  ProductFilter,
  ProductPoint,
} from '@/components/charts/productionOption';
import { useFieldStatusLabel } from '@/hooks/useFieldStatusLabel';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useUnits } from '@/hooks/useUnits';
import { useI18n } from '@/i18n/useI18n';
import { downloadCsv, rowsToCsv } from '@/lib/csv';
import { addMonths } from '@/lib/dates';
import { plateau } from '@/lib/fieldStats';
import { formatDate, formatMonth, formatMonthName, formatNumber, formatShare } from '@/lib/format';
import { latestView } from '@/lib/latest';
import { productKind, productKindColor } from '@/lib/mix';
import { sm3ToKboed } from '@/lib/units';
import { FieldPlainWords, FocusShareCard, ForecastExplainer } from './field/FieldPanels';
import { MonthlyTable } from './field/MonthlyTable';
import { OwnershipTimeline } from './field/OwnershipTimeline';

const PRODUCT_KEYS = { oil: 'oilSm3', gas: 'gasOeSm3', nglCond: 'nglCondSm3' } as const;

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

export default function FieldDetail() {
  const params = useParams();
  const id = Number(params.id);
  const { m, t, simple } = useI18n();
  const units = useUnits();
  const statusLabel = useFieldStatusLabel();
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
            {m.page.fields}
          </Link>
        }
        title={isNotFound(field.error) ? m.field.notFound : m.field.unavailable}
      >
        <ErrorState
          message={
            isNotFound(field.error)
              ? t(m.field.notFoundText, { id: params.id ?? '' }) +
                (USE_MOCKS ? m.field.notFoundMock : '')
              : m.field.unavailableText
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
  const kindColor = kind ? productKindColor(kind) : null;
  const plateauStats = plateau(
    historyData.map((h) => ({ month: h.month, value: units.fromMonth(h.oeSm3, h.month) })),
  );
  const in12 = forecast.data?.points[12];
  const forecastEnd = forecast.data?.points[forecast.data.points.length - 1]?.month;
  const digits = units.digits;
  const spark = historyData.slice(-24).map((h) => units.fromMonth(h.oeSm3, h.month));
  const compact = !isDesktop;

  const productOptions = [
    { value: 'all' as const, label: m.field.all },
    {
      value: 'oil' as const,
      label: (
        <>
          <span className="dot bg-oil" aria-hidden="true" />
          {m.products.oil}
        </>
      ),
    },
    {
      value: 'gas' as const,
      label: (
        <>
          <span className="dot bg-gas" aria-hidden="true" />
          {m.products.gas}
        </>
      ),
    },
    {
      value: 'nglCond' as const,
      label: (
        <>
          <span className="dot bg-cond" aria-hidden="true" />
          {m.products.nglCondShort}
        </>
      ),
    },
  ];

  const chartTable = (
    <DataTable
      caption={t(m.field.chartTableCaption, { field: f?.name ?? m.common.field })}
      dense
      maxHeight={320}
      rowKey={(r) => r.month}
      rows={[
        ...chartHistory.slice(-24).map((h) => ({
          month: h.month,
          kind: m.field.actual,
          total: h.oil + h.gas + h.nglCond,
          range: '',
        })),
        ...chartForecast.slice(1, 13).map((p) => ({
          month: p.month,
          kind: m.field.forecastSample,
          total: p.p50,
          range: `${units.format(p.p10, digits)}–${units.format(p.p90, digits)}`,
        })),
      ]}
      columns={[
        {
          id: 'month',
          header: m.common.month,
          value: (r) => r.month,
          cell: (r) => formatMonth(r.month),
        },
        { id: 'kind', header: m.field.type, value: (r) => r.kind },
        {
          id: 'total',
          header: units.label,
          align: 'right',
          value: (r) => r.total,
          cell: (r) => units.format(r.total, digits),
        },
        { id: 'range', header: m.field.range80, align: 'right', value: (r) => r.range },
      ]}
    />
  );

  return (
    <Page
      documentTitle={f?.name}
      label={
        <nav aria-label={m.page.breadcrumb} className="flex gap-1.5">
          <Link to="/fields" className="text-muted underline-offset-2 hover:underline">
            {m.page.fields}
          </Link>
          <span aria-hidden="true">/</span>
          <span>{f?.mainArea ?? '…'}</span>
        </nav>
      }
      title={f?.name ?? m.field.loadingName}
      meta={
        f ? (
          <div className="flex flex-wrap items-center gap-2">
            <FieldStatusChip status={f.status} />
            {f.operator ? (
              <span className="chip">
                <Term id="operator">{m.common.operator}</Term> · {f.operator.name}
              </span>
            ) : null}
            {kind ? (
              <span className="chip">
                {kindColor ? (
                  <span className="dot" style={{ background: kindColor }} aria-hidden="true" />
                ) : null}
                {m.products.kind[kind]}
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
          <Icon name="download" />
          {m.common.csv}
        </button>
      }
    >
      <section
        aria-label={m.page.keyNumbers}
        className="grid grid-cols-2 gap-3 nav:grid-cols-4 nav:gap-5"
      >
        <KpiCard
          index={0}
          label={
            latest
              ? t(simple ? m.company.productionPlain : m.company.production, {
                  month: formatMonth(latest.month),
                })
              : m.company.productionEmpty
          }
          value={field.isPending ? null : (view?.value ?? 0)}
          unit={units.label}
          format={(v) => units.format(v)}
          compact={compact}
          delta={view?.momPct != null ? { value: view.momPct } : undefined}
          sub={
            latest
              ? t(m.common.vsMonth, { month: formatMonthName(addMonths(latest.month, -1)) })
              : m.company.noRecent
          }
          spark={spark}
          sparkColor={kindColor ?? undefined}
        />
        <KpiCard
          index={1}
          label={
            <Term id="plateau">
              {plateauStats
                ? t(m.field.plateau, {
                    years:
                      plateauStats.toYear !== plateauStats.fromYear
                        ? `${plateauStats.fromYear}–${String(plateauStats.toYear).slice(2)}`
                        : String(plateauStats.fromYear),
                  })
                : m.field.plateauEmpty}
            </Term>
          }
          value={history.isPending ? null : (plateauStats?.value ?? 0)}
          unit={units.label}
          format={(v) => units.format(v)}
          compact={compact}
          delta={
            plateauStats && view
              ? { value: (view.value / plateauStats.value - 1) * 100 }
              : undefined
          }
          sub={m.field.nowVsPlateau}
        />
        <KpiCard
          index={2}
          label={
            in12 ? t(m.field.forecastIn, { month: formatMonth(in12.month) }) : m.field.forecast12
          }
          value={forecast.isPending ? null : in12 ? units.fromMonth(in12.p50, in12.month) : 0}
          unit={units.label}
          format={(v) => units.format(v)}
          compact={compact}
          sample
          delta={
            in12 && view && view.value > 0
              ? { value: (units.fromMonth(in12.p50, in12.month) / view.value - 1) * 100 }
              : undefined
          }
          sub={
            in12
              ? t(m.company.range, {
                  lo: units.format(units.fromMonth(in12.p10, in12.month)),
                  hi: units.format(units.fromMonth(in12.p90, in12.month)),
                })
              : m.field.noForecast
          }
        />
        {f ? (
          <FocusShareCard field={f} />
        ) : (
          <KpiCard label={m.field.focusTitle} value={null} unit="" format={String} />
        )}
      </section>

      {simple && f ? (
        <FieldPlainWords
          field={f}
          view={view}
          plateauStats={plateauStats}
          latestMonth={latestMonth}
        />
      ) : null}

      <div className="grid grid-cols-1 items-start gap-5 nav:grid-cols-4">
        <ChartCard
          className="nav:col-span-3"
          title={m.field.chartTitle}
          subtitle={`${t(m.field.chartSub, { unit: units.label })}${
            forecastEnd ? t(m.field.chartSubForecast, { month: formatMonth(forecastEnd) }) : ''
          }`}
          info={m.field.chartInfo}
          sample={m.sample.forecastChart}
          actions={
            <SegmentedControl
              size="sm"
              label={m.field.product}
              value={product}
              onChange={setProduct}
              options={productOptions}
            />
          }
          legend={[
            ...(product === 'all' || product === 'oil'
              ? [{ label: m.products.oil, color: 'var(--oil)' }]
              : []),
            ...(product === 'all' || product === 'gas'
              ? [{ label: m.products.gas, color: 'var(--gas)' }]
              : []),
            ...(product === 'all' || product === 'nglCond'
              ? [{ label: m.products.nglCond, color: 'var(--cnd)' }]
              : []),
            { label: m.field.forecastMedian, color: 'var(--fc)', kind: 'dashed' },
            { label: m.field.range80, color: 'var(--fc)', kind: 'band' },
          ]}
          source={{
            label: USE_MOCKS ? m.common.sampleSource : m.common.sodir,
            asOf: latestMonth
              ? t(m.common.throughMonth, { month: formatMonth(latestMonth) })
              : undefined,
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
          height={isDesktop ? 400 : 230}
          table={chartTable}
        >
          <ProductionChart
            history={chartHistory}
            forecast={chartForecast}
            product={product}
            events={forecast.data?.events}
            compact={!isDesktop}
            height={isDesktop ? 400 : 230}
            format={(v) => units.format(v, digits)}
            unitLabel={units.label}
            ariaLabel={`${t(m.field.chartAria, {
              field: f?.name ?? m.common.field,
              from: historyData[0] ? formatMonth(historyData[0].month) : '',
            })}${
              view
                ? t(m.field.chartAriaLatest, { value: units.format(view.value), unit: units.label })
                : ''
            }${forecastEnd ? t(m.field.chartAriaForecast, { month: formatMonth(forecastEnd) }) : ''}`}
          />
        </ChartCard>
        <ForecastExplainer forecast={forecast.data} history={historyData} />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 nav:grid-cols-4">
        <div className="min-w-0 nav:col-span-3">
          <OwnershipTimeline
            periods={ownership.data}
            today={latestMonth ?? f?.lastProductionMonth ?? '2026-08-01'}
            firstProductionMonth={f?.firstProductionMonth ?? null}
          />
        </div>
        <aside className="card enter flex min-w-0 flex-col gap-3 p-5" aria-labelledby="fx-h">
          <h2 id="fx-h" className="display m-0 text-h2 font-semibold">
            {m.field.factsTitle}
          </h2>
          {f ? (
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[14px] [&_dd]:m-0 [&_dd]:text-right [&_dt]:text-muted">
              <dt>{m.common.operator}</dt>
              <dd>{f.operator?.name ?? '–'}</dd>
              <dt>{m.field.area}</dt>
              <dd>{f.mainArea ?? '–'}</dd>
              <dt>{m.field.discovered}</dt>
              <dd className="num">{f.discoveryYear ?? '–'}</dd>
              <dt>{m.field.onStream}</dt>
              <dd className="num">
                {f.firstProductionMonth ? formatMonth(f.firstProductionMonth) : '–'}
              </dd>
              <dt>{m.field.status}</dt>
              <dd>{statusLabel(f.status)}</dd>
              <dt>{m.field.size}</dt>
              <dd className="num">{f.areaKm2 ? `${formatNumber(f.areaKm2, 0)} km²` : '–'}</dd>
              <dt>{m.field.mainProduct}</dt>
              <dd>
                {latest
                  ? `${latest.mix.oil >= latest.mix.gas ? m.products.oil : m.products.gas} (≈${formatShare(Math.max(latest.mix.oil, latest.mix.gas))})`
                  : (f.hcType ?? '–')}
              </dd>
              <dt>{m.field.sodirType}</dt>
              <dd>{f.hcType ?? '–'}</dd>
              <dt>{m.field.ownersToday}</dt>
              <dd className="num">{f.currentOwners.length}</dd>
              <dt>{m.field.source}</dt>
              <dd>
                {f.factpageUrl ? (
                  <a
                    href={f.factpageUrl}
                    className="text-muted underline underline-offset-2"
                    rel="noreferrer"
                    target="_blank"
                  >
                    {m.field.factpages}
                    <span className="sr-only"> {m.common.opensNewTab}</span>
                  </a>
                ) : (
                  m.common.sodir
                )}
              </dd>
            </dl>
          ) : (
            <Skeleton height={200} />
          )}
          {latestMonth && f?.lastProductionMonth && f.lastProductionMonth < latestMonth ? (
            <p className="lbl m-0">
              {t(m.field.lastProduction, { date: formatDate(f.lastProductionMonth) })}
            </p>
          ) : null}
        </aside>
      </div>

      <MonthlyTable history={historyData} loading={history.isPending} onDownload={download} />
    </Page>
  );
}
