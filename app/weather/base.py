from __future__ import annotations

from typing import Protocol

from app.schemas import ForecastResponse


class WeatherProvider(Protocol):
    name: str

    async def get_forecast(self, location: str, units: str) -> ForecastResponse: ...