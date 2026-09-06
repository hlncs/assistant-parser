from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from openai import APIStatusError

log = logging.getLogger(__name__)


class AppError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def _envelope(code: str, message: str) -> dict[str, dict[str, str]]:
    return {"error": {"code": code, "message": message}}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=_envelope(exc.code, exc.message))

    @app.exception_handler(APIStatusError)
    async def _openai_error(_: Request, exc: APIStatusError) -> JSONResponse:
        resp = getattr(exc, "response", None)
        detail = resp.text if resp is not None else str(exc)
        log.error("openai_upstream_error status=%s body=%s", exc.status_code, detail)
        return JSONResponse(
            status_code=502,
            content=_envelope("upstream_llm_error", detail[:2000]),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(status_code=422, content=_envelope("invalid_request", str(exc.errors())))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled")
        return JSONResponse(
            status_code=500, content=_envelope("internal_error", f"{exc.__class__.__name__}: {exc}")
        )