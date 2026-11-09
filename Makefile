.DEFAULT_GOAL := help
.PHONY: help env up down reset psql logs ingest refresh dbt forecast predictions openapi web demo reader-role eval test lint

help: ## List available commands
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

env: ## Create .env from .env.example (random DB and reader passwords) if missing
	@test -f .env || sed -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$$(openssl rand -hex 16)/" \
		-e "s/^STAKEFLOW_READER_PASSWORD=.*/STAKEFLOW_READER_PASSWORD=$$(openssl rand -hex 16)/" .env.example > .env

up: env ## Build and start everything (app :3002, API :8000/docs, Dagster :3000)
	docker compose up -d --build --wait

down: ## Stop all services (data is kept)
	docker compose down

reset: ## Stop services and DELETE the database volume
	docker compose down -v

psql: ## Open a psql shell in the database
	docker compose exec db sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

logs: ## Follow service logs
	docker compose logs -f

refresh: ## Queue a full refresh (all Sodir layers + dbt) in the running Dagster
	docker compose exec dagster-daemon dagster job launch -j sodir_refresh -w /opt/dagster/home/workspace.yaml

ingest: ## Without Dagster: download all Sodir layers into the raw schema (or: make ingest LAYERS="field profiles")
	cd pipeline && uv run --env-file ../.env stakeflow-ingest $(LAYERS)

dbt: ## Without Dagster: dbt build of the marts (models + tests); `make forecast` builds the ml models
	cd pipeline && uv run --env-file ../.env dbt build --project-dir dbt --profiles-dir dbt --exclude tag:ml

forecast: ## Without Dagster: Arps forecasts, nowcasts and predictions into ml.*, then the ml dbt models
	cd pipeline && uv run --env-file ../.env stakeflow-forecast
	cd pipeline && uv run --env-file ../.env dbt build --project-dir dbt --profiles-dir dbt --select tag:ml

predictions: ## Export a quarter's live predictions as JSON (make predictions Q=2026Q4)
	cd pipeline && uv run --env-file ../.env stakeflow-export-predictions --quarter $(Q) --out ../predictions

openapi: ## Write the API contract to api/openapi.json (frontend types are generated from it)
	cd api && POSTGRES_HOST=x POSTGRES_PORT=1 POSTGRES_USER=x POSTGRES_PASSWORD=x POSTGRES_DB=x \
		uv run python -c "import json; from stakeflow_api.main import app; print(json.dumps(app.openapi(), indent=2))" > openapi.json

web: ## Frontend dev server with hot reload on :5173 (needs the API from make up)
	cd frontend && pnpm install && VITE_FEATURE_ASK=true pnpm dev

demo: ## Static demo like GitHub Pages: export the running API, build for /stakeflow/
	cd api && uv run python scripts/export_static.py ../frontend/public/data
	cd frontend && pnpm install && pnpm build:pages

reader-role: ## (Re)create the read-only role used for model-written SQL (existing databases)
	docker compose exec db /docker-entrypoint-initdb.d/03-reader-role.sh

eval: ## Score Ask and scenario parsing against the eval sets (needs ANTHROPIC_API_KEY; costs money)
	cd api && uv run --env-file ../.env python -m stakeflow_api.evals.run

test: ## Run pipeline, API and frontend tests (DB tests skip if the database is down)
	cd pipeline && uv run --env-file ../.env pytest -q
	cd api && uv run --env-file ../.env pytest -q
	cd frontend && pnpm test

lint: ## Lint + format + type checks (ruff for Python, eslint/prettier/tsc for the frontend)
	cd pipeline && uv run ruff check . && uv run ruff format --check .
	cd api && uv run ruff check . && uv run ruff format --check .
	cd frontend && pnpm lint && pnpm format:check && pnpm typecheck
