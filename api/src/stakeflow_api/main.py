"""Stakeflow API: read-only access to NCS production attributed to the companies that own it.

Run locally: `uvicorn stakeflow_api.main:app --reload` (OpenAPI docs at /docs).
"""

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from stakeflow_api.caching import not_modified
from stakeflow_api.db import make_pool
from stakeflow_api.routers import ask, companies, fields, meta, scenarios, summary


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.pool = make_pool()
    try:
        yield
    finally:
        app.state.pool.close()


app = FastAPI(
    title="Stakeflow API",
    version="0.1.0",
    summary="Norwegian Continental Shelf production, attributed to the companies that own it.",
    description=(
        "Source: Sodir (Norwegian Offshore Directorate), Norwegian Licence for Open Government "
        "Data (NLOD). Volumes are monthly Sm³ oil equivalent unless the field name says "
        "otherwise. Equinor figures cover the Norwegian shelf only. Not investment advice."
    ),
    lifespan=lifespan,
)

# Registered before CORS so CORS stays the outer layer and also decorates the 304s
app.middleware("http")(not_modified)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(meta.router)
app.include_router(summary.router)
app.include_router(companies.router)
app.include_router(fields.router)
app.include_router(ask.router)
app.include_router(scenarios.router)
