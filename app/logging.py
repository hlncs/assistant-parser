from __future__ import annotations

import logging
import uuid
from collections.abc import Awaitable, Callable
from contextvars import ContextVar

from fastapi import Request
from pythonjsonlogger.json import JsonFormatter  # newer builds
from starlette.responses import Response

# fallback:
# from pythonjsonlogger import jsonlogger
# JsonFormatter = jsonlogger.JsonFormatter  # type: ignore[attr-defined]

correlation_id: ContextVar[str] = ContextVar("correlation_id", default="-")


class CorrelationFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.correlation_id = correlation_id.get()
        return True


def configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(
        JsonFormatter(
            "%(asctime)s %(levelname)s %(name)s %(correlation_id)s %(message)s"
        )
    )
    handler.addFilter(CorrelationFilter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)


async def correlation_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    cid = request.headers.get("x-correlation-id") or uuid.uuid4().hex
    token = correlation_id.set(cid)
    try:
        response = await call_next(request)
        response.headers["x-correlation-id"] = cid
        return response
    finally:
        correlation_id.reset(token)