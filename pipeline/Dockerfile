FROM python:3.12-slim-bookworm

COPY --from=ghcr.io/astral-sh/uv:0.13.7 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    DAGSTER_HOME=/opt/dagster/home

WORKDIR /app

# Dependencies first, so code edits don't reinstall them
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src ./src
RUN uv sync --frozen --no-dev

# dagster-dbt loads dbt's manifest at import; parse needs no database, only profile values
COPY dbt ./dbt
RUN POSTGRES_HOST=db POSTGRES_PORT=5432 POSTGRES_USER=x POSTGRES_PASSWORD=x POSTGRES_DB=x \
    dbt parse --project-dir dbt --profiles-dir dbt --quiet

COPY dagster.yaml workspace.yaml $DAGSTER_HOME/
