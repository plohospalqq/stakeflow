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
make up      # start Postgres (PostGIS) and wait until healthy
make psql    # SQL shell
make down    # stop (keeps data)
make reset   # stop and delete the DB volume
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
- Never commit secrets, `.env`, or raw data files.
- Commits: small, Conventional Commits, English, no AI attribution trailers.
- Ask before adding a new dependency.
