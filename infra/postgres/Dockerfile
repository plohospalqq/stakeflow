# postgis/postgis is published for amd64 only. The official postgres image is
# multi-arch and already has the PGDG apt repo, so PostGIS installs natively on arm64 too.
FROM postgres:17-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-17-postgis-3 \
    && rm -rf /var/lib/apt/lists/*
