from __future__ import annotations

from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.errors import register_error_handlers
from app.logging import configure_logging, correlation_middleware
from app.orchestrator import router as chat_router
from app.weather.router import router as tools_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    app.state.http = httpx.AsyncClient(timeout=settings.request_timeout_s)
    try:
        yield
    finally:
        await app.state.http.aclose()


app = FastAPI(title="assistant-parser", lifespan=lifespan)
app.add_middleware(BaseHTTPMiddleware, dispatch=correlation_middleware)
register_error_handlers(app)
app.include_router(tools_router)
app.include_router(chat_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}