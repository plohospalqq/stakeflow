# Stakeflow: project conventions

Personal portfolio project (not client or employer work). Norwegian Continental Shelf
production data from Sodir, attributed to the companies that own the fields.

## Layout

| Path        | What                                                    |
|-------------|---------------------------------------------------------|
| `pipeline/` | Dagster + dbt. Sodir ingestion → raw → staging → marts  |
| `api/`      | FastAPI, read-only on `marts`                           |
| `frontend/` | React + TypeScript (strict) + Vite + MapLibre           |
| `infra/`    | Dockerfiles, Postgres init SQL                          |
| `docs/`     | Plans, decisions, ERD                                   |

## Commands

```bash
make help    # list all commands
make up      # build + start everything: app :3002, API :8000/docs, Dagster :3000
make refresh # queue a full refresh job in the running Dagster
make psql    # SQL shell
make down    # stop (keeps data)
make reset   # stop and delete the DB volume
make ingest  # without Dagster: download Sodir layers into raw.* (LAYERS="field profiles" for a subset)
make dbt     # without Dagster: dbt build (models + tests)
make web     # frontend dev server with hot reload on :5173
make test    # pipeline + api pytest, frontend vitest (DB tests skip when the DB is down)
make lint    # ruff + eslint/prettier/tsc
```

More commands get added here as each phase step lands.

## Conventions

- Python 3.12, `uv`, type hints everywhere, `ruff`, `pytest`
- TypeScript strict mode, no `any`, no `as` casts
- Postgres layers: `raw` (jsonb payloads, append-only, keyed by `ingestion_run_id`),
  `staging`, `marts`, `ml`. The API reads only from `marts`.
- Sodir data: use the DataService REST API only (see `docs/phase-1-plan.md`). Never guess
  endpoints. Tests use recorded fixtures, never the live network.
- Production uses **net (saleable)** volumes. Ownership attribution uses
  `field_licensee_hst` (field level, unitised), day-weighted within a month.
- **Equinor is labelled "Equinor (NCS only)"** in every company-level number, API response and
  UI. Never compare its attributed production with Equinor group totals (international,
  trading and renewables are out of scope). Same rule for any company that stops being
  NCS-only (watch Vår Energi + BlueNord).
- **No stock price forecasts presented as predictions.** Allowed (decided 2026-11-09):
  real share prices for context, and a **what-if scenario explorer** that shows how a share
  price *might* respond to assumptions the user picks (Brent, TTF, production…), computed by a
  transparent model whose historical fit, uncertainty band and coefficients are always shown,
  with a "scenario, not a forecast; not investment advice" notice. An LLM may only translate a
  user's free-text case into scenario parameters; it never produces the numbers itself.
  Core outputs stay production, revenue estimate, forecast accuracy.
- **Plain-language layer:** every screen must make sense to someone who knows nothing about
  oil and gas (what it means in money, homes heated, how long a field lasts).
- **Languages:** English, Ukrainian, Norwegian (Bokmål).
- Nowcast scope is set by `docs/nowcast-feasibility.md` (companies publish production at
  T+12/14, Sodir field data lands at T+40–69).
- Never commit secrets, `.env`, or raw data files.
- Commits: small, Conventional Commits, English, no AI attribution trailers.
- Ask before adding a new dependency.
