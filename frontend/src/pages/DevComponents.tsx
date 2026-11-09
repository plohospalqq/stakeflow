/**
 * Living style guide: the design language (tokens, type, materials, motion) and every core
 * component in its states, in both themes side by side. Charts draw on a canvas with colours
 * read from <html>, so they follow the global theme toggle rather than the side-by-side
 * panels. Demo copy is English on purpose: this page is for developers.
 */
import { useState } from 'react';
import { ChartCard } from '@/components/ChartCard';
import { Constellation } from '@/components/Constellation';
import { CountUp } from '@/components/CountUp';
import { Rings } from '@/components/Rings';
import { Term } from '@/components/Term';
import { LanguageSwitch, ModeSwitch } from '@/components/settings/PreferenceControls';
import { useI18n } from '@/i18n/useI18n';
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
  productColor: 'var(--oil)',
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
  ['--oil-ink', 'oil text'],
  ['--gas-ink', 'gas text'],
  ['--cnd-ink', 'NGL text'],
  ['--focus', 'focus ring'],
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
        <h3 className="cap m-0">Type · Inter Tight display, Inter text, tabular figures</h3>
        <span
          className="display num bg-clip-text text-[96px] font-extrabold leading-[0.9] tracking-[-0.055em] text-transparent"
          style={{ backgroundImage: 'var(--hero-grad)', WebkitBackgroundClip: 'text' }}
        >
          4.22
        </span>
        <span className="display text-display-l font-bold">Three companies. One shelf.</span>
        <span className="display num text-kpi font-bold">1,382.4</span>
        <span className="display text-h1 font-bold">Who produces what</span>
        <span className="display text-h2 font-semibold">Production history and forecast</span>
        <span>
          Each month <Term id="sodir" /> publishes how much each <Term id="field" /> produced.
        </span>
        <span className="lbl">Net to Aker BP · kboe/d</span>
        <span className="cap">Q4 2026 nowcast</span>
        <span className="eyebrow">Norwegian shelf · August 2026</span>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="cap m-0">Materials · tile, glass, stage</h3>
        <div className="relative grid grid-cols-3 gap-3 overflow-hidden rounded-[24px] bg-[radial-gradient(circle_at_30%_30%,var(--oil),transparent_45%),radial-gradient(circle_at_70%_70%,var(--gas),transparent_45%)] p-4">
          <div className="card p-4 text-[13px]">Tile</div>
          <div className="glass rounded-[22px] p-4 text-[13px]">Glass</div>
          <div className="lift card p-4 text-[13px]">Hover lift</div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="cap m-0">Motion · count-up, rings, staggered spring entrance</h3>
        <div className="flex flex-wrap items-center gap-5">
          <CountUp
            value={4.22}
            format={(v) => formatNumber(v, 2)}
            className="display num text-[44px] font-bold tracking-[-0.045em]"
          />
          <Rings
            size={120}
            stroke={12}
            label="Oil 44%, gas 51%, NGL 5%"
            rings={[
              { key: 'oil', value: 0.445, color: 'var(--oil)' },
              { key: 'gas', value: 0.51, color: 'var(--gas)' },
              { key: 'ngl', value: 0.046, color: 'var(--cnd)' },
            ]}
          />
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <span key={i} className="card enter h-10 w-14" style={{ '--i': i }} />
            ))}
          </div>
        </div>
        <span className="lbl">
          Everything is visible at rest; with reduced motion the final state shows at once.
        </span>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="cap m-0">Night-sky thumbnail</h3>
        <div className="card h-[180px] bg-[#05070b] p-3">
          <Constellation
            label="Demo constellation"
            points={[
              { id: 1, lon: 3.8, lat: 60.7, kboed: 799, oilShare: 0.02 },
              { id: 2, lon: 2.7, lat: 58.8, kboed: 618, oilShare: 0.97 },
              { id: 3, lon: 20.1, lat: 72.5, kboed: 214, oilShare: 1 },
              { id: 4, lon: 6.9, lat: 65, kboed: 128, oilShare: 0.3 },
              { id: 5, lon: 21.1, lat: 71.6, kboed: 134, oilShare: 0 },
            ]}
          />
        </div>
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
          <ModeSwitch />
          <LanguageSwitch />
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
  const { m } = useI18n();
  const [product, setProduct] = useState<ProductFilter>('all');
  return (
    <Page label={m.dev.label} title={m.dev.title} hideFreshness>
      <p className="m-0 max-w-[760px] text-muted">
        {m.dev.lede} Colours are CSS variables swapped by a t-dark / t-light class; the two columns
        below render the same kit in each theme.
      </p>

      <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        <div lang="en" className="t-dark rounded-[28px] border border-line bg-bg p-5 text-ink">
          <Kit />
        </div>
        <div lang="en" className="t-light rounded-[28px] border border-line bg-bg p-5 text-ink">
          <Kit />
        </div>
      </div>

      <h2 className="display m-0 text-h2 font-semibold">ChartCard (follows the global theme)</h2>
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
