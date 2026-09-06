from __future__ import annotations

from datetime import UTC, datetime

import httpx

from app.errors import AppError
from app.schemas import ForecastResponse

URL = "https://api.openweathermap.org/data/2.5/weather"


class OpenWeatherMapProvider:
    name = "openweathermap"

    def __init__(self, client: httpx.AsyncClient, api_key: str) -> None:
        self._client = client
        self._api_key = api_key

    async def get_forecast(self, location: str, units: str) -> ForecastResponse:
        # Note: never log full URL (contains appid).
        try:
            r = await self._client.get(
                URL,
                params={"q": location, "units": "metric", "appid": self._api_key},
            )
        except httpx.HTTPError as e:
            raise AppError("upstream_unreachable", str(e), status_code=502) from e

        if r.status_code == 404:
            raise AppError("invalid_location", f"No match for {location!r}", 400)
        if r.status_code in (401, 403):
            raise AppError("upstream_auth", "Upstream auth failed", 502)
        if r.status_code == 429:
            raise AppError("upstream_rate_limited", "Upstream rate limit", 502)
        if r.status_code >= 400:
            raise AppError("upstream_error", f"Upstream {r.status_code}", 502)

        data = r.json()
        weather = (data.get("weather") or [{}])[0]
        return ForecastResponse(
            location=location,
            temperature_c=float(data["main"]["temp"]),
            condition=str(weather.get("description", "")).title(),
            forecast_time_utc=datetime.fromtimestamp(int(data["dt"]), tz=UTC)
            .isoformat()
            .replace("+00:00", "Z"),
            provider=self.name,
        )