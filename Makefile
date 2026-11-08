.DEFAULT_GOAL := help
.PHONY: help env up down reset psql logs ingest test lint

help: ## List available commands
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

env: ## Create .env from .env.example (with a random DB password) if missing
	@test -f .env || sed "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$$(openssl rand -hex 16)/" .env.example > .env

up: env ## Start all services and wait until healthy
	docker compose up -d --wait

down: ## Stop all services (data is kept)
	docker compose down

reset: ## Stop services and DELETE the database volume
	docker compose down -v

psql: ## Open a psql shell in the database
	docker compose exec db sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

logs: ## Follow service logs
	docker compose logs -f

ingest: ## Download all Sodir layers into the raw schema (or: make ingest LAYERS="field profiles")
	cd pipeline && uv run --env-file ../.env stakeflow-ingest $(LAYERS)

test: ## Run pipeline tests (DB tests skip if the database is down)
	cd pipeline && uv run --env-file ../.env pytest -q

lint: ## Ruff lint + format check
	cd pipeline && uv run ruff check . && uv run ruff format --check .
