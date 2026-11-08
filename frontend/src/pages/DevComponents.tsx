/**
 * Living style guide: every core component in its states, in both themes side by side.
 * Charts draw on a canvas with colours read from <html>, so they follow the global theme
 * toggle rather than the side-by-side panels.
 */
import { useState } from 'react';
import { ChartCard } from '@/components/ChartCard';
import { FieldStatusChip, SeverityChip, StatusChip } from '@/components/Chips';
import { DataTable, type Column } from '@/components/DataTable';
import { DeltaBadge } from '@/components/DeltaBadge';
import { KpiCard } from '@/components/KpiCard';
import { MapSidePanel, type MapPanelField } from '@/components/MapSidePanel';
import { MixBar, OilShareBar } from '@/components/MixBar';
import { RangeBar } from '@/components/RangeBar';
import { SampleBadge } from '@/components/SampleBadge';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Sparkline } from '@/components/Sparkline';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UnitToggle } from '@/components/UnitToggle';
import { ProductionChart } from '@/components/charts/ProductionChart';
import type {
  ForecastPoint,
  ProductFilter,
  ProductPoint,
} from '@/components/charts/productionOption';
import { Page } from '@/components/layout/Page';
import { addMonths } from '@/lib/dates';
import { formatNumber } from '@/lib/format';

const SPARK = Array.from({ length: 24 }, (_, i) => 400 + Math.sin(i * 1.7) * 8 + i * 1.5);

const HISTORY: ProductPoint[] = Array.from({ length: 60 }, (_, i) => {
  const total = i < 8 ? 150 + i * 60 : 640 * Math.exp(-Math.max(0, i - 30) / 70);
  const wobble = 1 + Math.sin(i * 1.9) * 0.015;
  return {
    month: addMonths('2021-09-01', i),
    oil: total * 0.94 * wobble,
    gas: total * 0.045 * wobble,
    nglCond: total * 0.015 * wobble,
  };
});

const LAST = HISTORY[HISTORY.length - 1];
const LAST_TOTAL = LAST ? LAST.oil + LAST.gas + LAST.nglCond : 0;
const FORECAST: ForecastPoint[] = Array.from({ length: 37 }, (_, k) => {
  const p50 = LAST_TOTAL / Math.pow(1 + 0.6 * 0.12 * (k / 12), 1 / 0.6);
  const w = 0.02 + 0.05 * (k / 12);
  return {
    month: addMonths(LAST?.month ?? '2026-08-01', k),
    p50,
    p10: p50 * (1 - w),
    p90: p50 * (1 + w * 0.8),
  };
});

interface DemoRow {
  name: string;
  operator: string;
  value: number;
  mom: number;
  oilShare: number;
}

const ROWS: DemoRow[] = [
  {
    name: 'Johan Sverdrup',
    operator: 'Equinor (NCS only)',
    value: 618.1,
    mom: -0.8,
    oilShare: 0.97,
  },
  { name: 'Troll', operator: 'Equinor (NCS only)', value: 799.2, mom: -1.6, oilShare: 0.02 },
  { name: 'Edvard Grieg', operator: 'Aker BP', value: 77.2, mom: 4.8, oilShare: 0.83 },
  { name: 'Goliat', operator: 'Vår Energi', value: 0, mom: 0, oilShare: 0.7 },
];

const COLUMNS: Column<DemoRow>[] = [
  { id: 'name', header: 'Field', value: (r) => r.name },
  { id: 'operator', header: 'Operator', value: (r) => r.operator },
  {
    id: 'value',
    header: 'Production',
    align: 'right',
    value: (r) => r.value,
    cell: (r) => formatNumber(r.value, 1),
  },
  {
    id: 'mom',
    header: 'vs Jul',
    align: 'right',
    value: (r) => r.mom,
    cell: (r) => <DeltaBadge value={r.mom} />,
  },
  {
    id: 'oil',
    header: 'Oil share',
    value: (r) => r.oilShare,
    sortable: false,
    cell: (r) => <OilShareBar oilShare={r.oilShare} />,
  },
];

const PANEL_FIELD: MapPanelField = {
  id: 21675433,
  name: 'Edvard Grieg',
  status: 'Producing',
  mainArea: 'North sea',
  operatorName: 'Aker BP',
  productKind: 'Mainly oil',
  discoveryYear: 2007,
  areaKm2: 36,
  latest: { month: '2026-08-01', value: 77.2, momPct: 4.8, yoyPct: -12.0 },
  history: HISTORY.slice(-36).map((h) => ({
    month: h.month,
    oil: h.oil * 0.12,
    gas: h.gas * 3,
    nglCond: h.nglCond * 2,
  })),
  owners: [
    { groupId: 'aker-bp', name: 'Aker BP', sharePct: 65 },
    { groupId: 'c1', name: 'Wintershall Dea Norge AS', sharePct: 35 },
  ],
};

const TOKENS = [
  ['--bg', 'page'],
  ['--sf', 'card'],
  ['--sf2', 'hover'],
  ['--sf3', 'selected'],
  ['--bd', 'line'],
  ['--bd2', 'strong line'],
  ['--fa', 'decor only'],
  ['--mu', 'muted text'],
  ['--tx', 'text'],
  ['--fc', 'forecast'],
  ['--oil', 'oil'],
  ['--gas', 'gas'],
  ['--cnd', 'NGL + cond.'],
  ['--up', 'good'],
  ['--dn', 'bad'],
  ['--warn', 'warning'],
  ['--f1', 'field 1'],
  ['--f2', 'field 2'],
  ['--f3', 'field 3'],
  ['--f4', 'field 4'],
  ['--f5', 'field 5'],
  ['--f6', 'field 6'],
] as const;

const fmt1 = (v: number) => formatNumber(v, v >= 100 ? 0 : 1);

function Kit() {
  const [product, setProduct] = useState<ProductFilter>('all');
  const [panelOpen, setPanelOpen] = useState(true);
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="cap m-0">Tokens</h3>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
          {TOKENS.map(([name, use]) => (
            <div key={name} className="flex flex-col gap-1">
              <span
                className="h-9 rounded-lg border border-line"
                style={{ background: `var(${name})` }}
              />
              <span className="num lbl">{name}</span>
              <span className="lbl text-[11px]">{use}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="cap m-0">Type</h3>
        <span className="num text-kpi">1,382.4</span>
        <span className="text-h1">Who produces what on the shelf</span>
        <span className="text-h2">Production history and forecast</span>
        <span>Each month Sodir publishes how much each field produced.</span>
        <span className="lbl">Net to Aker BP · kboe/d</span>
        <span className="cap">Q4 2026 nowcast</span>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="cap m-0">DeltaBadge</h3>
        <div className="flex flex-wrap items-center gap-2.5">
          <DeltaBadge value={2.1} />
          <DeltaBadge value={-3.2} />
          <DeltaBadge value={0.01} />
          <DeltaBadge value={21.4} size="lg" />
          <span className="lbl">errors, lower is good:</span>
          <DeltaBadge value={-0.5} goodWhen="down" />
          <DeltaBadge value={1.2} goodWhen="down" />
          <DeltaBadge value={-4.7} format="abs" suffix=" kboe/d" />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="cap m-0">KpiCard</h3>
        <div className="grid grid-cols-2 gap-3">
          <KpiCard
            label="Production, Aug 2026"
            value={371.6}
            unit="kboe/d"
            format={fmt1}
            delta={{ value: -1.2 }}
            sub="vs Jul"
          />
          <KpiCard label="Loading" value={null} unit="kboe/d" format={fmt1} />
          <KpiCard label="With sparkline" value={397.5} unit="kboe/d" format={fmt1} spark={SPARK} />
          <KpiCard
            label="Q4 2026 nowcast"
            value={381}
            unit="kboe/d"
            format={fmt1}
            sub="80% range 369–393"
            sample
          />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="cap m-0">Controls</h3>
        <div className="flex flex-wrap items-center gap-2.5">
          <UnitToggle />
          <SegmentedControl
            label="Product"
            value={product}
            onChange={setProduct}
            options={[
              { value: 'all', label: 'All' },
              { value: 'oil', label: 'Oil' },
              { value: 'gas', label: 'Gas' },
              { value: 'nglCond', label: 'NGL + cond.' },
            ]}
          />
          <ThemeToggle />
          <button type="button" className="btn">
            Secondary
          </button>
          <button type="button" className="btn btn-primary">
            Primary
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="cap m-0">Chips and badges</h3>
        <div className="flex flex-wrap items-center gap-2">
          <SeverityChip severity="high" />
          <SeverityChip severity="medium" />
          <SeverityChip severity="low" />
          <StatusChip status="new" />
          <StatusChip status="investigating" />
          <StatusChip status="explained" />
          <StatusChip status="resolved" />
          <FieldStatusChip status="Producing" />
          <FieldStatusChip status="Approved for production" />
          <FieldStatusChip status="Shut down" />
          <SampleBadge />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card flex flex-col gap-2 p-4">
          <h3 className="cap m-0">MixBar</h3>
          <MixBar mix={{ oil: 0.84, gas: 0.13, nglCond: 0.03 }} showLegend />
          <OilShareBar oilShare={0.62} />
        </div>
        <div className="card flex flex-col gap-2 p-4">
          <h3 className="cap m-0">Sparkline</h3>
          <Sparkline values={SPARK} area label="Demo trend, last 24 months, rising" height={44} />
          <Sparkline values={[...SPARK.slice(0, 23), 360]} tailColor="var(--dn)" height={28} />
        </div>
        <div className="card flex flex-col gap-2 p-4">
          <h3 className="cap m-0">RangeBar</h3>
          <RangeBar value={381} lo={369} hi={393} reference={374.3} />
          <span className="lbl">Nowcast 381 · 80% range 369–393 · last reported 374.3</span>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="card min-w-0">
          <DataTable
            caption="Demo fields table"
            columns={COLUMNS}
            rows={ROWS}
            rowKey={(r) => r.name}
            initialSort={{ id: 'value', desc: true }}
          />
        </div>
        {panelOpen ? (
          <MapSidePanel
            field={PANEL_FIELD}
            focusCompanies={['aker-bp', 'equinor', 'var-energi']}
            onClose={() => setPanelOpen(false)}
            unitLabel="kboe/d"
            format={fmt1}
            detailHref={(id) => `/fields/${id}`}
          />
        ) : (
          <button type="button" className="btn" onClick={() => setPanelOpen(true)}>
            Reopen panel
          </button>
        )}
      </section>
    </div>
  );
}

export default function DevComponents() {
  const [product, setProduct] = useState<ProductFilter>('all');
  return (
    <Page label="Developer" title="Component kit and tokens">
      <p className="m-0 max-w-[760px] text-muted">
        Every screen is assembled from these components. Colours are CSS variables swapped by a
        t-dark / t-light class; the two columns below render the same kit in each theme.
      </p>

      <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        <div className="t-dark rounded-card border border-line bg-bg p-5 text-ink">
          <Kit />
        </div>
        <div className="t-light rounded-card border border-line bg-bg p-5 text-ink">
          <Kit />
        </div>
      </div>

      <h2 className="m-0 text-h2">ChartCard (follows the global theme)</h2>
      <ChartCard
        title="Production history and forecast"
        subtitle="Monthly · kboe/d"
        info="The coloured areas are what the field produced each month. The dashed line is the most likely path ahead; the shaded band is where production should land 8 times out of 10."
        actions={
          <SegmentedControl
            label="Product"
            value={product}
            onChange={setProduct}
            options={[
              { value: 'all', label: 'All' },
              { value: 'oil', label: 'Oil' },
              { value: 'gas', label: 'Gas' },
              { value: 'nglCond', label: 'NGL + cond.' },
            ]}
          />
        }
        legend={[
          { label: 'Oil', color: 'var(--oil)' },
          { label: 'Gas', color: 'var(--gas)' },
          { label: 'NGL + condensate', color: 'var(--cnd)' },
          { label: 'Forecast', color: 'var(--fc)', kind: 'dashed' },
          { label: '80% range', color: 'var(--fc)', kind: 'band' },
        ]}
        source={{ label: 'Demo data' }}
        sample="Demo series"
        table={<p className="lbl m-2">The table alternative renders here.</p>}
      >
        <ProductionChart
          history={HISTORY}
          forecast={FORECAST}
          product={product}
          events={[{ month: '2022-12-01', label: 'Phase 2 on stream' }]}
          ariaLabel="Demo field production since 2021 with a three-year forecast"
          format={fmt1}
          unitLabel="kboe/d"
        />
      </ChartCard>
      <div className="grid gap-4 nav:grid-cols-3">
        <ChartCard
          title="Loading"
          subtitle="kboe/d"
          legend={[]}
          source={{ label: 'Sodir' }}
          state="loading"
          height={140}
        >
          {null}
        </ChartCard>
        <ChartCard
          title="Empty"
          subtitle="kboe/d"
          legend={[]}
          source={{ label: 'Sodir' }}
          state="empty"
          height={140}
        >
          {null}
        </ChartCard>
        <ChartCard
          title="Error"
          subtitle="kboe/d"
          legend={[]}
          source={{ label: 'Sodir' }}
          state="error"
          onRetry={() => undefined}
          height={140}
        >
          {null}
        </ChartCard>
      </div>
    </Page>
  );
}
