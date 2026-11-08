# Stakeflow frontend

The web app for Stakeflow: Norwegian Continental Shelf production per field and per company,
from public Sodir data. It shows what each field produces, splits it by licence share into what
each company owns, compares that with what the companies report, and (as a preview) how a
quarterly nowcast and a revenue estimate will be scored.

React 18 + TypeScript (strict) + Vite, Tailwind, TanStack Query and Table, ECharts, MapLibre
(`react-map-gl/maplibre`) on free OpenFreeMap tiles, Zustand for theme and unit. Built with pnpm.

![Overview, dark](docs/screenshots/overview-dark.png)

## Real data and sample data

The backend serves production, ownership and reported quarters today. Everything else comes
from a deterministic mock layer and is marked with a dashed amber **Sample data** badge wherever
it appears, so a sample number is never mistaken for a real one.

| Screen                          | Real (live API)                                                                                                                                                   | Sample (badged)                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Overview `/`                    | Company production, deltas, product mix, the one-line "what moved" sentence, largest fields, Sodir vs reported gap                                                | Nowcast and range, Brent/TTF, recent anomalies, model error in the track-record teaser                              |
| Field map `/map`                | Field centroids and outlines, production, oil share, owners, 36-month history, "Highlight owner"                                                                  | –                                                                                                                   |
| Fields `/fields`                | Every field with latest production and change                                                                                                                     | –                                                                                                                   |
| Field detail `/fields/:id`      | History by product, plateau, owners and ownership timeline, facts, monthly table and CSV                                                                          | Decline-curve forecast, model card, 12-month forecast KPI                                                           |
| Company detail `/companies/:id` | Net production by field (day-weighted shares), latest month, last reported quarter and its Sodir gap, **Sodir-attributed vs reported by quarter**, legal entities | Quarter nowcast, nowcast-vs-reported chart, revenue estimate (prices and nowcast volume; the product split is real) |
| Track record `/track-record`    | **Public data vs what the companies reported** (e.g. Aker BP Q2 2026: 380.8 attributed vs 383.6 reported kboe/d, −0.74%)                                          | Model summary, accuracy over time, prediction log and its CSV                                                       |
| Anomalies `/anomalies`          | Field names, operators and owners                                                                                                                                 | Every anomaly, its numbers and the impact per company                                                               |
| Ask `/ask` (beta)               | Table catalogue; the SQL shown runs as-is on the marts and the answers are its real output (data through Aug 2026)                                                | Pre-computed: only a few example questions are answered; anything else gets an honest "not yet"                     |

The reconciliation is the honest track record today: it compares Sodir field data × licence
shares with each company's own trading update, with no model in between. It always sits apart
from the sample prediction log. Quarters still missing a Sodir month are listed as provisional
and kept out of the average gap.

`VITE_USE_MOCKS=true` mocks everything (tests, CI, demos without a backend); the footer then
says every number is sample data.

### Rules the UI keeps

- **Equinor is always "Equinor (NCS only)"**, never shortened, truncated or hidden; company
  names wrap instead of using `truncate`, because a tooltip does not work on touch screens.
- **No share price prediction.** Outputs are production, a revenue estimate and forecast
  accuracy.
- **Nowcast framing:** forecasts are frozen at quarter end and scored against the company's
  trading update (Vår Energi about T+12, Aker BP about T+14; Equinor with its quarterly report).
  Lead days = report date − prediction time. See `docs/nowcast-feasibility.md`.
- The revenue estimate is volume × price with the formula on screen. Gas is
  Sm³ × 10.8 kWh/Sm³ × TTF (EUR/MWh) × EURUSD. It states that revenue follows volumes **sold**,
  not produced (over/underlift), and that hedging, tariffs and inventory timing are excluded.
- External links (Sodir FactPages, trading updates, commits) only render after
  `safeExternalUrl()` accepts them: https and a short list of known hosts.
- Oil, gas and NGL + condensate colours are reserved for those products; fields in stacked
  charts use a neutral grey ramp.

## Architecture

```
src/
  api/        CoreApi (live API or mocks) and ExtrasApi (always mocks), TanStack Query hooks
    http.ts     fetch + mapping from the generated OpenAPI types into domain models
    mock/       deterministic sample data behind the same interfaces
    hooks.ts    the only way components read data; query keys shared across screens
  lib/        pure, tested helpers: units, dates, formatting, ownership, revenue, scoring,
              map scales, CSV, SQL tokens
  components/ kit (KpiCard, ChartCard, DataTable, MapSidePanel, chips, badges) and chart
              option builders in components/charts
  pages/      one file per route, with its pieces in a folder of the same name
  stores/     theme and unit (Zustand); the unit also lives in the URL (?u=sm3)
```

- **Two halves of the data layer.** `CoreApi` is what the backend serves; `ExtrasApi` is what it
  does not serve yet and is always the mock layer. Swapping a mock for a real endpoint is a
  change in `src/api/` only. Sample-ness is decided by `isSample()` in `api/mode.ts`.
- **Units in one place.** Volumes are stored as Sm³ o.e. per month (Sodir native) and converted
  only in `lib/units.ts`, with the real number of days in each month. Every number on screen
  follows the boe/d ↔ Sm³ toggle.
- **Charts follow the theme.** ECharts draws on a canvas, so `useChartTheme()` reads the CSS
  variables at runtime and charts re-render on theme change. Each chart has a `role="img"`
  summary and a table alternative.
- **Map.** OpenFreeMap `dark` and `positron` styles (no API key) follow the theme. Circles sit at
  field centroids with area ∝ production and colour = oil share (Lab interpolation, the same in
  the legend and the list). `lib/mapScale.ts` holds those encodings so map and legend cannot
  drift apart. The "Fields by production" list is the keyboard and screen-reader way in.
- **Shareable state in the URL**: unit (`?u=`), selected map field (`?field=`), track-record
  company (`?co=`).

## Run it

```bash
pnpm install
pnpm dev                       # http://localhost:5173, proxies /api to http://localhost:8000
```

The API comes from `make up` at the repo root (which also serves this app on
http://localhost:3002). `make web` runs the dev server for you.

| Variable            | Default                 | What it does                                            |
| ------------------- | ----------------------- | ------------------------------------------------------- |
| `VITE_USE_MOCKS`    | `false`                 | `true` = no backend needed, every number is sample data |
| `VITE_FEATURE_ASK`  | unset                   | `true` shows the Ask page and its nav item              |
| `STAKEFLOW_API_URL` | `http://localhost:8000` | Where the dev proxy sends `/api`                        |

Copy `.env.example` to `.env` to set them.

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
pnpm gen:api                   # regenerate src/api/schema.gen.ts from ../api/openapi.json
```

Tests run against the mock layer (never the network) with Vitest and Testing Library; the map
canvas and ECharts are replaced by their accessible summaries in jsdom.

## Accessibility and responsiveness

- Semantic landmarks and headings, real links and buttons, a skip link, visible focus rings,
  `aria-pressed` on toggles, real tabs (arrow keys) on Ask, `aria-sort` on sortable tables.
- The map side panel announces changes, closes on Escape and returns focus to the row or map
  that opened it; on phones it becomes a bottom sheet.
- Checked with axe-core (WCAG 2.1 A/AA and best practices) on every route in both themes at
  1440 px and at 390 px: no violations. Pill text uses darker "ink" tokens in light mode to stay
  above 4.5:1 on its tint.
- Every route works at 390 px without horizontal page scrolling; wide tables scroll inside their
  card. Touch targets are 44 px below the 1024 px breakpoint.

## Screenshots

All taken from the live API at 1440 × 1000 (desktop) and 390 × 844 (phone).

|                                    | Dark                                                                                            | Light                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Overview                           | ![Overview, dark theme](docs/screenshots/overview-dark.png)                                     | ![Overview, light theme](docs/screenshots/overview-light.png)                                     |
| Field map                          | ![Field map, dark theme](docs/screenshots/map-dark.png)                                         | ![Field map, light theme](docs/screenshots/map-light.png)                                         |
| Fields                             | ![Fields list, dark theme](docs/screenshots/fields-dark.png)                                    | ![Fields list, light theme](docs/screenshots/fields-light.png)                                    |
| Field detail (Johan Sverdrup)      | ![Field detail for Johan Sverdrup, dark theme](docs/screenshots/field-johan-sverdrup-dark.png)  | ![Field detail for Johan Sverdrup, light theme](docs/screenshots/field-johan-sverdrup-light.png)  |
| Company detail (Aker BP)           | ![Company detail for Aker BP, dark theme](docs/screenshots/company-aker-bp-dark.png)            | ![Company detail for Aker BP, light theme](docs/screenshots/company-aker-bp-light.png)            |
| Company detail (Equinor, NCS only) | ![Company detail for Equinor (NCS only), dark theme](docs/screenshots/company-equinor-dark.png) | ![Company detail for Equinor (NCS only), light theme](docs/screenshots/company-equinor-light.png) |
| Track record                       | ![Track record, dark theme](docs/screenshots/track-record-dark.png)                             | ![Track record, light theme](docs/screenshots/track-record-light.png)                             |
| Anomalies                          | ![Anomaly feed, dark theme](docs/screenshots/anomalies-dark.png)                                | ![Anomaly feed, light theme](docs/screenshots/anomalies-light.png)                                |
| Ask (beta)                         | ![Ask the data, dark theme](docs/screenshots/ask-dark.png)                                      | ![Ask the data, light theme](docs/screenshots/ask-light.png)                                      |

| Overview                                                     | Field detail                                                                     | Company detail                                                                        | Map                                                      | Map, field picked                                                                                           |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| ![Overview on a phone](docs/screenshots/overview-mobile.png) | ![Field detail for Johan Sverdrup on a phone](docs/screenshots/field-mobile.png) | ![Company detail for Aker BP on a phone](docs/screenshots/company-aker-bp-mobile.png) | ![Field map on a phone](docs/screenshots/map-mobile.png) | ![Field map on a phone with Johan Sverdrup open in the bottom sheet](docs/screenshots/map-mobile-sheet.png) |

## Known limits

- Nowcasts, the prediction log, forecasts, anomalies, prices and Ask are sample data until the
  backend serves them. The prediction log has no commit links yet (`commitUrl` is null).
- Anomaly notes and "Mark explained" live in the browser tab only.
- Ask answers a handful of example questions; edited SQL cannot run yet.
- The basemap needs network access to `tiles.openfreemap.org`; without it the field list and
  side panel still work.

Not investment advice. Production and licence data: Norwegian Offshore Directorate (Sodir),
under the Norwegian Licence for Open Government Data (NLOD). Basemap © OpenFreeMap,
OpenMapTiles, OpenStreetMap contributors.
