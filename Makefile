.DEFAULT_GOAL := help
.PHONY: help env up down reset psql logs ingest refresh dbt test lint

help: ## List available commands
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

env: ## Create .env from .env.example (with a random DB password) if missing
	@test -f .env || sed "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$$(openssl rand -hex 16)/" .env.example > .env

up: env ## Build and start everything (Dagster :3000, API :8000/docs)
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

dbt: ## Without Dagster: dbt build (models + tests) against the local database
	cd pipeline && uv run --env-file ../.env dbt build --project-dir dbt --profiles-dir dbt

test: ## Run pipeline + API tests (DB tests skip if the database is down)
	cd pipeline && uv run --env-file ../.env pytest -q
	cd api && uv run --env-file ../.env pytest -q

lint: ## Ruff lint + format check (pipeline, api)
	cd pipeline && uv run ruff check . && uv run ruff format --check .
	cd api && uv run ruff check . && uv run ruff format --check .
