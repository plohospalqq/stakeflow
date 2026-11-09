# Stakeflow frontend

The web app for Stakeflow: Norwegian Continental Shelf production per field and per company,
from public Sodir data. It shows what each field produces, splits it by licence share into what
each company owns, compares that with what the companies report, and explains what it means to
someone who has never looked at an oil field, in English, Ukrainian and Norwegian.

React 18 + TypeScript (strict) + Vite, Tailwind, TanStack Query and Table, ECharts, MapLibre
(`react-map-gl/maplibre`) on free OpenFreeMap tiles, Zustand for theme, unit, language and mode.
Built with pnpm.

![The landing page, dark](docs/screenshots/overview-dark.png)

## Design language

One design language, three roles, inspired by Apple's product pages:

| Role        | Where                                                           | Feel                                                                                                       |
| ----------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Keynote** | the landing page `/`                                            | one idea per screen: a giant counted-up number, three facts, a company race, the honest record, a scenario |
| **Bento**   | company, field, fields, scenarios, track record, anomalies, Ask | widgets on a grid: big numbers, rings, sparklines that draw, tables and charts in soft tiles               |
| **Atlas**   | the map `/map`                                                  | a night sky of glowing fields over a real dark basemap, glass panels floating on it, a 24-month timeline   |

- **Type.** Inter Tight (`@fontsource/inter-tight`, 600–800) for headings and big numbers with
  tight tracking; Inter for text; tabular figures everywhere a number can change. JetBrains Mono
  only for SQL.
- **Materials.** Tiles with 24–32 px radii: a soft shadow in light, a hairline in dark. Glass
  (`backdrop-filter: saturate(180%) blur(22px)`) for floating chrome: the top navigation, the
  map panels, popovers, the phone sheet. Pills for every control.
- **Colour tokens** (`src/index.css`, one class on `<html>`): dark is the default stage (`#000`,
  tiles `#141416`), light is the bento look (`#f5f5f7`, white tiles). Products keep their hue in
  both themes: oil `#ff9f0a`/`#ff9500`, gas `#64d2ff`/`#007aff`, NGL + condensate
  `#bf5af2`/`#af52de` (dark/light), reserved for products only; fields in stacked company charts
  use a neutral grey ramp. Text that carries a product or a direction uses the `-ink` variants,
  darker in light mode, so it stays above 4.5:1 (e.g. oil text `#b25000` on white).
- **Motion** (`src/hooks/useMotion.ts`, `index.css`): numbers count up, lines and rings draw
  when they come into view, tiles enter with a springy stagger, link tiles lift on hover. Every
  element is fully visible at rest: entrances start from a visible state, draw-on-view replays a
  finished drawing, count-ups have a timer fallback, and `prefers-reduced-motion` shows the final
  state at once.
- `/dev/components` shows the kit (tokens, type, materials, motion, every component and state)
  in both themes side by side.

## Languages: English, Ukrainian, Norwegian (Bokmål)

No i18n library: `src/i18n/` is a small typed dictionary module.

- `en.ts` is the source; `uk.ts` and `nb.ts` are typed against its shape, so a missing or extra
  key is a compile error. A test checks that all three have the same keys, the same
  `{placeholders}` and `<b>` emphasis, and every plural form their language needs (Ukrainian
  one/few/many via `Intl.PluralRules`).
- `useI18n()` gives `m` (the dictionary), `t()` (placeholders), `plural()` and `v()` (Simple
  words / Expert variants). `<Rich>` renders `<b>` emphasis without ever interpreting data as
  markup.
- Numbers, percentages, months and dates go through `Intl` in the active locale (`lib/format.ts`
  follows the language store), so 1,463.5 becomes 1 463,5 in Norwegian and Ukrainian.
- Language comes from `?lang=` (a shared link), then the reader's earlier choice
  (localStorage), then the browser; `<html lang>` follows. Field and company names stay as they
  are, except the scope label, which is translated and never shortened: "Equinor (NCS only)",
  "Equinor (лише норвезький шельф)", "Equinor (kun norsk sokkel)".
- Free text that comes from data (anomaly notes, the Ask preview's example answers, the scope
  notes of non-focus companies) is English and marked `lang="en"` until the backend serves
  translations.

## Simple words and Expert

A switch in the navigation; first-time visitors get **Simple words**.

- Units read "k barrels/day" instead of "kboe/d" (and "million m³/month" for the Sm³ toggle).
- "What it means" tiles on the landing, company and field pages, computed from real data: the
  state's share in barrels and per cent, homes one year of gas could heat
  (`bn m³ × 1e9 × 10.8 kWh ÷ 12,000 kWh per home`, with the assumption footnoted), how much a field
  fell in a year and why fields decline, how long it has produced and how far below its plateau
  it is, roughly what a company's oil and gas is worth a day at sample prices.
- Glossary terms (dotted underline) open a short definition in both modes: barrels of oil
  equivalent, licence share, the state's direct stake (Petoro/SDFI), NGL and condensate, trading
  update, nowcast, plateau, decline, 80% range, R² and more.
- **Expert** keeps the industry units and the dense layout without the explainer tiles.

## Real data and sample data

The backend serves production, ownership, reported quarters and the shelf summary. Everything
else comes from a deterministic mock layer and is marked with a dashed amber **Sample data**
badge wherever it appears.

| Screen                          | Real (live API)                                                                                                                                                                                         | Sample (badged)                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Landing `/`                     | Shelf total and its 24 months (`/summary`), state share, last year's gas, largest fields, the company race and what moved, how-it-works example, the reconciliation record                              | Scenario teaser, Brent/TTF, recent anomalies                                                                        |
| Field map `/map`                | Field centroids and outlines, production, oil share, owners, 36-month history, "Highlight owner", the shelf timeline                                                                                    | –                                                                                                                   |
| Fields `/fields`                | Every field with latest production and change                                                                                                                                                           | –                                                                                                                   |
| Field detail `/fields/:id`      | History by product, plateau, owners and ownership timeline, facts, plain-words facts, monthly table and CSV                                                                                             | Decline-curve forecast, model card, 12-month forecast KPI                                                           |
| Company detail `/companies/:id` | Net production by field (day-weighted shares), product rings, latest month, last reported quarter and its gap, **public data vs reported by quarter**, legal entities                                   | Quarter nowcast, nowcast-vs-reported chart, revenue estimate (prices and nowcast volume; the product split is real) |
| Scenarios `/scenarios`          | –                                                                                                                                                                                                       | Share prices, the fitted model and its answer, the free-text parser (until the endpoints are wired)                 |
| Track record `/track-record`    | **Public data vs what the companies reported** per company and quarter (e.g. 14 complete quarters each: 0.22% Equinor's Norway segment, 0.72% Aker BP, 3.8% Vår Energi, whose figures include fuel gas) | Model summary, accuracy over time, prediction log and its CSV                                                       |
| Anomalies `/anomalies`          | Field names, operators and owners                                                                                                                                                                       | Every anomaly, its numbers and the impact per company                                                               |
| Ask `/ask` (beta)               | Table catalogue; the SQL shown runs as-is on the marts and the answers are its real output                                                                                                              | Pre-computed: only a few example questions are answered                                                             |

`VITE_USE_MOCKS=true` mocks everything (tests, CI, demos without a backend); the footer then
says every number is sample data.

### Rules the UI keeps

- **Equinor is always "Equinor (NCS only)"** (translated, never shortened, truncated or hidden);
  company names wrap instead of truncating. Its share price in the scenario explorer is the
  group's, and the page says so.
- **No share price predictions.** The scenario explorer shows how a share price _might_ respond
  to assumptions the reader picks, with the model's fit (R², window, observations), its
  coefficients, an 80% range and a "Scenario, not a forecast · not investment advice" notice.
  The AI step only turns free text into the five parameters; the model computes the numbers.
- **Nowcast framing:** forecasts are frozen at quarter end and scored against the company's first
  publication. See `docs/nowcast-feasibility.md`.
- The revenue estimate is volume × price with the formula on screen, sold vs produced and the
  exclusions spelled out.
- External links render only after `safeExternalUrl()` accepts them.

## Scenario contract

The scenario explorer uses the backend's parameter contract, in camelCase in the frontend
(`lib/scenario.ts` maps both ways and clamps):

| Wire name               | Frontend              | Range       |
| ----------------------- | --------------------- | ----------- |
| `brent_change_pct`      | `brentChangePct`      | −90 … +300  |
| `ttf_change_pct`        | `ttfChangePct`        | −90 … +300  |
| `production_change_pct` | `productionChangePct` | −100 … +100 |
| `eurusd_change_pct`     | `eurusdChangePct`     | −50 … +100  |
| `horizon_months`        | `horizonMonths`       | 1 … 24      |

`ExtrasApi` has `sharePrices(companyId)`, `scenarioModel(companyId)`,
`runScenario(companyId, params)` and `parseScenario(text)`; types in `api/types.scenario.ts`,
sample implementations in `api/mock/scenario.ts`. A 503 from `parseScenario` is shown as "AI is
not configured on this server" with the ready-made scenarios next to it.

## Architecture

```
src/
  api/        CoreApi (live API or mocks) and ExtrasApi (always mocks), TanStack Query hooks
    summary.ts  GET /summary (kept beside http.ts until the data-mode work lands)
    mock/       deterministic sample data behind the same interfaces
  i18n/       en (source), uk, nb dictionaries, useI18n, <Rich>
  lib/        pure, tested helpers: units, Intl formatting, dates, plain-language facts,
              scenario contract and model, revenue, scoring, map scales, CSV, SQL tokens
  hooks/      units, motion (count-up, draw-on-view), company names, URL sync
  components/ kit (KpiCard, ChartCard, Rings, Sparkline, Term, Sheet, MapSidePanel…) and
              chart option builders in components/charts
  pages/      one file per route, with its pieces in a folder of the same name
  stores/     theme, unit, language and mode (Zustand)
```

- **Units in one place.** Volumes are stored as Sm³ o.e. per month (Sodir native) and converted
  only in `lib/units.ts`, with the real number of days in each month.
- **Charts follow the theme and the language.** `useChartTheme()` reads the CSS variables at
  runtime; chart builders take the dictionary for series names, tooltips and month labels.
  Each chart has a `role="img"` summary and a table alternative.
- **Map.** OpenFreeMap `dark` (deepened to a night-sky palette at runtime) and `positron`. Each
  field is two circle layers, a blurred halo under a crisp core, radius ∝ √production, colour =
  oil share; localized sea names; `lib/mapScale.ts` keeps map and legend in step. The
  "Fields by production" list is the keyboard and screen-reader way in; the field card closes
  on Escape and returns focus; on phones it becomes a bottom sheet. The timeline scrubs the
  shelf total; the field circles stay at the latest month, and the panel says so.
- **Shareable state in the URL**: unit (`?u=`), language (`?lang=`), map field (`?field=`),
  track-record company (`?co=`), scenario company and preset (`?co=`, `?preset=`).

## Run it

```bash
pnpm install
pnpm dev                       # http://localhost:5173, proxies /api to http://localhost:8000
```

The API comes from `make up` at the repo root. `make web` runs the dev server for you.

| Variable            | Default                 | What it does                                            |
| ------------------- | ----------------------- | ------------------------------------------------------- |
| `VITE_USE_MOCKS`    | `false`                 | `true` = no backend needed, every number is sample data |
| `VITE_FEATURE_ASK`  | unset                   | `true` shows the Ask page and its nav item              |
| `STAKEFLOW_API_URL` | `http://localhost:8000` | Where the dev proxy sends `/api`                        |

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
pnpm gen:api                   # regenerate src/api/schema.gen.ts from ../api/openapi.json
```

Tests run against the mock layer (never the network) with reduced motion; they cover the
dictionaries (keys, placeholders, plural forms), language detection, Simple words vs Expert,
the scenario contract (ranges, clamping, wire names, the 503 path), the motion fallbacks and
every screen's main flows.

## Accessibility and responsiveness

- Semantic landmarks and headings, real links and buttons, a skip link, a visible focus ring,
  `aria-pressed` on toggles, real tabs on Ask, `aria-sort` on tables, a focus-trapped sheet for
  "More" on phones, screen-reader copies of every counted-up number.
- Checked with axe-core (WCAG 2.1 A/AA and best practices) in both themes at 1440 px and 390 px:
  no violations. No route scrolls horizontally at 390 px; touch targets are 44 px on phones
  (glossary terms inside sentences are exempt as inline text).

## Screenshots

Taken from the live API at 1440 × 1000 and 390 × 844 with reduced motion.

|                                    | Dark                                                                                            | Light                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Landing (keynote)                  | ![Landing, dark theme](docs/screenshots/overview-dark.png)                                      | ![Landing, light theme](docs/screenshots/overview-light.png)                                      |
| Field map (atlas)                  | ![Field map, dark theme](docs/screenshots/map-dark.png)                                         | ![Field map, light theme](docs/screenshots/map-light.png)                                         |
| Company detail (Aker BP)           | ![Company detail for Aker BP, dark theme](docs/screenshots/company-aker-bp-dark.png)            | ![Company detail for Aker BP, light theme](docs/screenshots/company-aker-bp-light.png)            |
| Company detail (Equinor, NCS only) | ![Company detail for Equinor (NCS only), dark theme](docs/screenshots/company-equinor-dark.png) | ![Company detail for Equinor (NCS only), light theme](docs/screenshots/company-equinor-light.png) |
| Field detail (Johan Sverdrup)      | ![Field detail for Johan Sverdrup, dark theme](docs/screenshots/field-johan-sverdrup-dark.png)  | ![Field detail for Johan Sverdrup, light theme](docs/screenshots/field-johan-sverdrup-light.png)  |
| Scenarios                          | ![Scenario explorer, dark theme](docs/screenshots/scenarios-dark.png)                           | ![Scenario explorer, light theme](docs/screenshots/scenarios-light.png)                           |
| Track record                       | ![Track record, dark theme](docs/screenshots/track-record-dark.png)                             | ![Track record, light theme](docs/screenshots/track-record-light.png)                             |
| Fields                             | ![Fields list, dark theme](docs/screenshots/fields-dark.png)                                    | ![Fields list, light theme](docs/screenshots/fields-light.png)                                    |
| Anomalies                          | ![Anomaly feed, dark theme](docs/screenshots/anomalies-dark.png)                                | ![Anomaly feed, light theme](docs/screenshots/anomalies-light.png)                                |
| Ask (beta)                         | ![Ask the data, dark theme](docs/screenshots/ask-dark.png)                                      | ![Ask the data, light theme](docs/screenshots/ask-light.png)                                      |

In other languages and in Expert mode:

| Ukrainian                                                                                 | Norwegian                                                                    | Expert mode                                                                                                |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| ![Landing in Ukrainian, dark theme](docs/screenshots/overview-uk-dark.png)                | ![Landing in Norwegian, light theme](docs/screenshots/overview-nb-light.png) | ![Company detail for Aker BP in Expert mode, dark theme](docs/screenshots/company-aker-bp-expert-dark.png) |
| ![Company detail for Equinor in Ukrainian](docs/screenshots/company-equinor-uk-light.png) | ![Scenario explorer in Norwegian](docs/screenshots/scenarios-nb-dark.png)    |                                                                                                            |

On a phone:

| Landing                                                     | Company detail                                                                        | Field detail                                                                     | Scenarios                                                              | Map                                                      | Map, field picked                                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| ![Landing on a phone](docs/screenshots/overview-mobile.png) | ![Company detail for Aker BP on a phone](docs/screenshots/company-aker-bp-mobile.png) | ![Field detail for Johan Sverdrup on a phone](docs/screenshots/field-mobile.png) | ![Scenario explorer on a phone](docs/screenshots/scenarios-mobile.png) | ![Field map on a phone](docs/screenshots/map-mobile.png) | ![Field map on a phone with Johan Sverdrup open in the bottom sheet](docs/screenshots/map-mobile-sheet.png) |

## Known limits

- Nowcasts, the prediction log, forecasts, anomalies, Brent/TTF, share prices, the scenario
  model and Ask are sample data until the backend serves them.
- `/summary` is fetched by `api/summary.ts` with plain `fetch`; it does not follow a static data
  mode yet.
- Anomaly notes, the Ask examples and non-focus companies' scope notes are English in every
  language (marked `lang="en"`).
- The map circles always show the latest month; the timeline replays the shelf total only.
- The basemap needs network access to `tiles.openfreemap.org`; without it the field list, the
  field card and the timeline still work.

Not investment advice. Production and licence data: Norwegian Offshore Directorate (Sodir),
under the Norwegian Licence for Open Government Data (NLOD). Basemap © OpenFreeMap,
OpenMapTiles, OpenStreetMap contributors.
