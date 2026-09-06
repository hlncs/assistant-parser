from __future__ import annotations

import httpx
import pytest

from app.errors import AppError
from app.weather.open_meteo import OpenMeteoProvider


@pytest.mark.asyncio
async def test_open_meteo_happy_path():
    def handler(req: httpx.Request) -> httpx.Response:
        if "geocoding-api" in req.url.host:
            return httpx.Response(
                200,
                json={"results": [{"name": "Sydney", "country": "Australia",
                                   "latitude": -33.87, "longitude": 151.21}]},
            )
        return httpx.Response(
            200,
            json={"current_weather": {"temperature": 21.4, "weathercode": 2,
                                      "time": "2026-09-06T04:00"}},
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
        provider = OpenMeteoProvider(c)
        out = await provider.get_forecast("Sydney", "metric")
    assert out.temperature_c == 21.4
    assert out.condition == "Partly Cloudy"
    assert out.provider == "open-meteo"
    assert out.forecast_time_utc.endswith("Z")


@pytest.mark.asyncio
async def test_open_meteo_invalid_location():
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"results": []}))
    ) as c:
        provider = OpenMeteoProvider(c)
        with pytest.raises(AppError) as ei:
            await provider.get_forecast("Nowheresville", "metric")
    assert ei.value.code == "invalid_location"
    assert ei.value.status_code == 400