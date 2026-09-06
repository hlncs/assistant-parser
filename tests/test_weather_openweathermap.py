from __future__ import annotations

import httpx
import pytest

from app.errors import AppError
from app.weather.openweathermap import OpenWeatherMapProvider


@pytest.mark.asyncio
async def test_owm_happy_path():
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "weather": [{"description": "partly cloudy"}],
                "main": {"temp": 21.4},
                "dt": 1793030400,
                "name": "Sydney",
                "sys": {"country": "AU"},
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
        provider = OpenWeatherMapProvider(c, api_key="x")
        out = await provider.get_forecast("Sydney", "metric")
    assert out.condition == "Partly Cloudy"
    assert out.provider == "openweathermap"


@pytest.mark.asyncio
async def test_owm_404_maps_to_invalid_location():
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda r: httpx.Response(404, json={}))
    ) as c:
        provider = OpenWeatherMapProvider(c, api_key="x")
        with pytest.raises(AppError) as ei:
            await provider.get_forecast("Nowheresville", "metric")
    assert ei.value.code == "invalid_location"