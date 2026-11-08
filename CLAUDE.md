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
- **No stock price prediction.** Share prices may be shown for context at most. Core outputs:
  production, revenue estimate, forecast accuracy.
- Nowcast scope is set by `docs/nowcast-feasibility.md` (companies publish production at
  T+12/14, Sodir field data lands at T+40–69).
- Never commit secrets, `.env`, or raw data files.
- Commits: small, Conventional Commits, English, no AI attribution trailers.
- Ask before adding a new dependency.
