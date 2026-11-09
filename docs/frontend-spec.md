# Frontend spec (design handoff)

Source of truth for the UI. Visual design: Claude Design canvas "Shelf Ledger — NCS production
analytics UI" (owner's private artifact, 9 artboards: Overview, Field map, Field detail, Company
detail, Track record, Anomalies, Ask, Mobile, Component kit). Every number in the design is sample.

## Adaptations agreed for Stakeflow (override the spec below)

- Product name is **Stakeflow** (the design predates the name "Shelf Ledger").
- Equinor is always **"Equinor (NCS only)"**; never compared with group totals.
- No stock price predictions. Real share prices for context and a what-if scenario explorer
  (transparent model, fit and uncertainty shown, "scenario, not a forecast") are allowed since
  2026-11-09. Core outputs: production, revenue estimate, forecast accuracy.
- Sodir has a 4th product, NGL. The third product is shown as **"NGL + condensate"** in the
  `--cnd` colour, so oil + gas + NGL/condensate stack exactly to total o.e.
- Nowcast framing (see `nowcast-feasibility.md`): forecasts are **frozen at quarter end and
  scored against the company's trading update** (Vår Energi ~T+12, Aker BP ~T+14), not "before
  the report" and not "freezes 24h before report".
- Real API data wherever the backend has it (companies, production, net-to-company by field,
  quarterly reconciliation, fields, ownership history, GeoJSON, freshness). Deterministic mocks
  only for what does not exist yet (Arps forecasts, prediction log, anomalies, prices, Ask),
  each badged "Sample data". `VITE_USE_MOCKS=true` mocks everything (tests, CI).
- The frontend calls `/api/...`; Vite proxies to the API in dev, nginx in Docker.
- Frontend served on **http://localhost:3002** in Docker.

---

# Task: build the frontend for "Shelf Ledger" (NCS production analytics)

You are working in my existing repo. First, explore it: find the backend/API (if any), existing frontend folder, package manager, lint/format config. Do NOT overwrite backend code. If there is no frontend yet, create it in `frontend/` (or the folder that fits the repo layout). Before writing code, give me a short plan (folder structure, libraries, phases) and wait for my OK.

## Product (context)
Public data from the Norwegian Offshore Directorate (Sodir): monthly production per field + licence ownership shares over time. The app turns it into:
- production per company (field volume × ownership share, respecting share history),
- decline-curve forecasts per field with an 80% confidence band,
- quarterly "nowcasts" of company production and revenue before the official report.
Focus companies: Aker BP, Vår Energi (≈100% Norwegian shelf), Equinor (Norway segment only).
Audience: recruiters/engineers (portfolio) and investors/analysts. Must feel like a serious, calm, data-dense pro tool (Bloomberg × Linear/Vercel), yet beginner-friendly.

## Stack
React 18 + TypeScript (strict) + Vite, Tailwind CSS, React Router, TanStack Query (data fetching), TanStack Table (tables), ECharts via `echarts-for-react` for production/forecast charts (stacked areas, bands, many points), Recharts or plain SVG allowed for sparklines/small bars, MapLibre GL (`react-map-gl/maplibre`) for the map, Zustand for UI state (theme, unit). Vitest + Testing Library for unit tests. ESLint + Prettier.

## Data layer
- Create `src/api/types.ts` with typed models: `Field`, `FieldMonthly` (month, oilSm3, gasSm3, condSm3, oeSm3), `LicenceShare` (fieldId, company, sharePct, validFrom, validTo), `Company`, `CompanyMonthly`, `Forecast` (month, p50, p10, p90), `Nowcast` (company, quarter, value, lo, hi, madeAt, modelVersion, hash, status: 'open'|'resolved'), `ReportedQuarter`, `Anomaly` (field, month, pctVsExpected, severity: 'high'|'medium'|'low', status: 'new'|'investigating'|'explained'|'resolved', note), `Price` (Brent USD/bbl, TTF EUR/MWh, daily).
- If the backend exposes endpoints, use them. Otherwise build a mock layer (`src/api/mock/`) with realistic deterministic sample data behind the same interface, switchable via `VITE_USE_MOCKS=true`. Label sample data in the UI footer.
- Store volumes in Sm³ o.e. per month (Sodir native). Conversions in one place, `src/lib/units.ts`:
  - kboe/d = Sm³ o.e. × 6.2898 ÷ daysInMonth ÷ 1000 (use the real number of days)
  - MSm³ o.e./mo = Sm³ o.e. ÷ 1e6
  - Write unit tests for these.

## Design tokens (CSS variables, theme via class on <html>)
Dark is default (respect `prefers-color-scheme` if light is set), toggle persists in localStorage, unit choice persists in URL (`?u=boe|sm3`) + store.

```
.t-dark  { --bg:#0A0C0F; --sf:#111419; --sf2:#171B21; --sf3:#1F242C; --bd:#232932; --bd2:#2F3641;
           --tx:#E7E9EC; --mu:#9AA3B0; --fa:#5F6875;
           --oil:#E8A33D; --gas:#4A95E6; --cnd:#B8A2F4;
           --up:#5CBF93; --dn:#EE7B71; --warn:#E5B54A; --fc:#D5DAE1;
           --f1:#E3E8EE; --f2:#B9C3CF; --f3:#93A0B0; --f4:#707D8F; --f5:#535E6E; --f6:#3B4451; }
.t-light { --bg:#F5F6F8; --sf:#FFFFFF; --sf2:#F0F2F5; --sf3:#E6E9EE; --bd:#E0E4EA; --bd2:#CBD2DB;
           --tx:#13161B; --mu:#566070; --fa:#A0A8B3;
           --oil:#B4690C; --gas:#1F6BC1; --cnd:#7255D2;
           --up:#1B7E54; --dn:#C0443A; --warn:#946500; --fc:#2E3540;
           --f1:#1F2630; --f2:#3D4756; --f3:#5D697A; --f4:#7F8B9B; --f5:#A3ADBA; --f6:#C6CDD6; }
```
Map them in `tailwind.config.ts` (bg, surface, surface2, surface3, line, line-strong, ink, muted, oil, gas, cond, up, down, warn, forecast, field-1..6). ECharts must read colours from the CSS variables at runtime and re-render on theme change (write a `useChartTheme()` hook).

Rules:
- oil/gas/condensate colours are reserved for those products only, everywhere.
- Fields in stacked company charts use the neutral ramp --f1..--f6 (never product colours).
- Forecast = dashed --fc line + --fc band at ~14% opacity + vertical "latest data" divider.
- Deltas: arrow + sign + colour (never colour alone). Production up = good; for errors, lower = good.
- Muted text must keep ≥4.5:1 contrast; --fa is decoration only.
- Fonts: Inter (UI), JetBrains Mono with tabular-nums for every number.
- Type: KPI 30/600 mono, H1 22/600, H2 15/600, body 14, label 12 muted, caption 11 uppercase +0.07em.
- Spacing 4/8/12/16/20/24/32; radius 6 chips, 10 controls, 12 cards, pill badges. Page padding 32 desktop / 16 mobile. Touch targets ≥44px on mobile.
- No gradients-for-decoration, no emoji, no 3D, no pie charts with >3 parts.

## Core components (build first, in `src/components/`, each with a story-like demo page `/dev/components`)
1. `DeltaBadge` { value; format?: 'pct'|'abs'; goodWhen?: 'up'|'down'; flatBelow?=0.05; size?: 'sm'|'lg' }
2. `KpiCard` { label; value: number|null (null = skeleton); unit; delta?; sub?; spark?: number[]; href? }
3. `ChartCard` { title; subtitle (always includes unit); info?: ReactNode (plain-language explainer popover via an (i) icon); actions?: ReactNode; legend: LegendItem[] (always visible); source: { label; asOf }; state?: 'ready'|'loading'|'empty'|'error'; children }
4. `DataTable<T>` on TanStack Table: numeric columns right-aligned, sortable headers with aria-sort, hover rows, sticky header, horizontal scroll on small screens, empty state, dense option.
5. `MapSidePanel` { field | null; focusCompanies; onClose } — aria-live="polite", Esc closes, focus returns to the marker; becomes a bottom sheet on mobile.
Plus: `SegmentedControl`, `UnitToggle`, `ThemeToggle`, `Sparkline`, `MixBar` (oil/gas/cond share bar), `SeverityChip`, `StatusChip`, `AppShell` (sidebar nav ≥1024px, bottom tab bar on mobile), `Footer`.

## Screens (routes)
Every page: header with page label + H1, unit toggle, theme toggle, data-freshness indicator ("Sodir · through Sep 2026"), and a footer: **"Not investment advice. Based on public data."** + Sodir/NLOD attribution.

1. `/` Overview
   - "How this works" strip: 1 Field output → 2 × ownership share → 3 = company + nowcast.
   - One card per company: latest month value + unit, delta vs previous month and vs same month last year, 24-month sparkline, oil/gas/cond mix bar, a one-sentence auto-generated explanation (template from data, e.g. biggest contributing field change), current-quarter nowcast vs last reported quarter with an 80% range bar, "x of 3 months in data", expected report date.
   - Largest fields table (field, operator, production, MoM, oil-share bar).
   - Brent + TTF sparkline cards. Recent anomalies (4) with severity, status, mini chart.
   - Track-record teaser: model avg error vs simple-guess error, link to /track-record.
2. `/map` Field map
   - MapLibre dark/light basemap (free style, e.g. OpenFreeMap or MapTiler with env key), Sodir field outlines/centroids.
   - Circle layer: radius ∝ √production, colour = oil share interpolated oil→gas. Labels for the largest fields.
   - "Highlight owner" segmented control dims fields not owned by the selected company. Search box.
   - Right: `MapSidePanel` (name, status, area, discovery year, operator, latest/MoM/YoY, 36-month oil+gas mini chart, owners bars with focus companies emphasised, "Open field detail") + clickable "Fields by production" list (keyboard-accessible alternative to the map).
   - Legend: colour = what it produces, size = production.
3. `/fields/:id` Field detail
   - Chips: status, operator, product type. KPIs: latest, plateau, forecast in 12 months with range, Aker BP/Equinor/Vår share of output.
   - Main ChartCard: stacked oil/gas/condensate history + forecast (p50 dashed, p10–p90 band), product toggle (All/Oil/Gas/Condensate), event markers (e.g. "Phase 2 on stream"), tooltip listing every series.
   - "How to read the forecast" panel + model card (method Arps hyperbolic, b, initial decline, fit window, backtest error, model run timestamp).
   - Ownership timeline: one row per company across time with share labels per period; event list (e.g. "Jul 2022 Lundin merged into Aker BP: 11.57% → 31.57%").
   - Field facts list; monthly data table (last N months) with CSV download.
4. `/companies/:id` Company detail
   - Company switcher. KPIs: latest month, last reported quarter (+ our error), current-quarter nowcast (+ range), revenue estimate.
   - Stacked monthly production by field (net to company, using share history), field ramp colours, legend with value + share.
   - Quarterly chart: reported bars, nowcast tick on each, open quarter dashed with range whisker, error label per quarter.
   - Revenue estimate card: volume × price with the full formula visible; sliders for Brent, TTF, realisation %; reset to forward prices; liquids/gas split bar; caveat (excludes hedging, tariffs, inventory timing). Gas: Sm³ × 10.8 kWh/Sm³ × days × TTF × EURUSD.
5. `/track-record` The "proof" page — must feel trustworthy
   - Four trust items: timestamped before report, hash committed to public Git log, compared with a simple baseline (last quarter's reported value), never edited (revisions = new rows).
   - Company filter. Summary: avg absolute error (model), avg error (baseline) + "N× more accurate", actual inside 80% range "x / n", bias.
   - Accuracy-over-time grouped bars (model vs baseline per quarter) with a 2% target line.
   - Prediction log table: quarter, company, prediction made (UTC), report published, lead days, predicted, 80% range, actual, error (green <2%, amber 2–4%, red >4%), in range, proof (short hash linking to commit). Open quarters on top ("Live · freezes 24h before report"). CSV download.
6. `/anomalies` Feed
   - Explainer of what counts as an anomaly (outside expected band: >10% and >3σ). Counts (open, high severity, this month, last 12 months). Status filter with counts.
   - Item: severity chip, status chip, month, field link, % vs expected, operator, note, mini chart (actual line + expected band, last segment highlighted), "hits company production" per owner (kboe/d), actions (Add note / Mark explained — UI only for now).
7. `/ask` (later phase, build the UI behind a feature flag `VITE_FEATURE_ASK`)
   - Chat layout: user bubble, answer card with step list (understood → found tables → ran query (ms, rows) → sanity check), one-paragraph answer, Chart/Table tabs, collapsible generated SQL (syntax highlighted, copy, edit & rerun, CSV), follow-up suggestion chips, input with send button, sidebar "Good first questions" + "Data you can ask about" (table names + descriptions). Mock the response for now.

## Responsive
Desktop first (1280–1440). Overview and Field detail must be fully usable at 390px: cards stack, KPIs in a 2-column grid, charts simplified (fewer ticks, legend below), side nav → bottom tab bar (Overview, Map, Fields, Record, Alerts), side panel → bottom sheet, tables scroll horizontally.

## Accessibility & quality
Semantic HTML, real buttons/links, visible focus rings, aria-labels on icon buttons, aria-pressed on toggles, charts with `role="img"` + aria-label summary, table alternatives for key charts, keyboard-operable map list. Lighthouse a11y ≥ 95. No layout shift on unit/theme change. Loading skeletons and empty/error states for every ChartCard and table.

## Phases (commit after each, conventional commits)
1. Scaffold, tokens, Tailwind mapping, theme + unit stores, units.ts with tests, AppShell, Footer.
2. Core components + `/dev/components` demo page (dark and light).
3. Mock data layer + API hooks (TanStack Query).
4. Overview + Field detail (incl. mobile).
5. Company detail + Track record.
6. Field map.
7. Anomalies, then Ask (flagged).
8. Polish: a11y pass, responsive pass, README section with screenshots and an architecture note.

After each phase: run typecheck, lint, tests, and `vite build`; fix errors before moving on; give me a short summary of what changed and what's next.
