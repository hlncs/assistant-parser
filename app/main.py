from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.errors import register_error_handlers
from app.logging import configure_logging
from app.orchestrator import router as chat_router
from app.weather.router import router as tools_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    app.state.http = httpx.AsyncClient(timeout=settings.request_timeout_s)
    try:
        yield
    finally:
        await app.state.http.aclose()


def create_app() -> FastAPI:
    app = FastAPI(lifespan=lifespan, title="assistant-parser")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    app.include_router(tools_router)
    app.include_router(chat_router)

    register_error_handlers(app)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()


@app.middleware("http")
async def correlation_id_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    response = await call_next(request)
    response.headers["X-Correlation-ID"] = request.headers.get("X-Correlation-ID", "")
    return response