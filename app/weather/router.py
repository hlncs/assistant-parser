from __future__ import annotations

import httpx
from fastapi import APIRouter, Request

from app.config import settings
from app.schemas import ForecastRequest, ForecastResponse
from app.weather import build_provider

router = APIRouter(prefix="/tools", tags=["tools"])


@router.post("/get_forecast", response_model=ForecastResponse)
async def get_forecast(body: ForecastRequest, request: Request) -> ForecastResponse:
    client: httpx.AsyncClient = request.app.state.http
    provider = build_provider(client)
    return await provider.get_forecast(body.location, body.units)


async def get_forecast_direct(location: str, units: str = "metric") -> ForecastResponse:
    """In-process call used by the orchestrator to avoid self-HTTP."""
    async with httpx.AsyncClient(timeout=settings.request_timeout_s) as client:
        provider = build_provider(client)
        return await provider.get_forecast(location, units)