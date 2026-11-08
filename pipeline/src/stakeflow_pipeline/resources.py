"""Dagster resources: the Sodir API and the Postgres warehouse."""

from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from dagster import ConfigurableResource
from psycopg.conninfo import make_conninfo

from stakeflow_pipeline.sodir.client import SodirClient, make_http_client


class SodirResource(ConfigurableResource):
    base_url: str
    timeout_s: float = 60.0

    @contextmanager
    def client(self) -> Iterator[SodirClient]:
        with make_http_client(self.base_url, self.timeout_s) as http:
            yield SodirClient(http)


class PostgresResource(ConfigurableResource):
    host: str
    port: int
    user: str
    password: str
    dbname: str

    @contextmanager
    def connect(self) -> Iterator[psycopg.Connection]:
        conninfo = make_conninfo(
            host=self.host,
            port=self.port,
            user=self.user,
            password=self.password,
            dbname=self.dbname,
        )
        with psycopg.connect(conninfo) as conn:
            yield conn
