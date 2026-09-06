from __future__ import annotations

from typing import Any, cast

import httpx

from app.errors import AppError
from app.schemas import ForecastResponse

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

# Subset of WMO weather-code → human text (title case).
WMO_CODES: dict[int, str] = {
    0: "Clear Sky",
    1: "Mainly Clear",
    2: "Partly Cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing Rime Fog",
    51: "Light Drizzle",
    53: "Moderate Drizzle",
    55: "Dense Drizzle",
    61: "Slight Rain",
    63: "Moderate Rain",
    65: "Heavy Rain",
    71: "Slight Snow",
    73: "Moderate Snow",
    75: "Heavy Snow",
    80: "Slight Rain Showers",
    81: "Moderate Rain Showers",
    82: "Violent Rain Showers",
    95: "Thunderstorm",
    96: "Thunderstorm With Slight Hail",
    99: "Thunderstorm With Heavy Hail",
}


def _condition(code: int) -> str:
    return WMO_CODES.get(code, f"Unknown ({code})")


class OpenMeteoProvider:
    name = "open-meteo"

    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def _get(self, url: str, params: dict[str, Any]) -> dict[str, Any]:
        typed_params: dict[str, str | int | float | bool] = {
            k: v for k, v in params.items() if isinstance(v, (str, int, float, bool))
        }
        try:
            r = await self._client.get(url, params=typed_params)
        except httpx.HTTPError as e:
            raise AppError("upstream_unreachable", str(e), status_code=502) from e
        if r.status_code == 429:
            raise AppError("upstream_rate_limited", "Upstream rate limit", status_code=502)
        if r.status_code >= 400:
            raise AppError("upstream_error", f"Upstream {r.status_code}", status_code=502)
        return cast(dict[str, Any], r.json())

    async def get_forecast(self, location: str, units: str) -> ForecastResponse:
        geo = await self._get(GEOCODE_URL, {"name": location, "count": 1})
        results = geo.get("results") or []
        if not results:
            raise AppError("invalid_location", f"No geocoding match for {location!r}", 400)

        top = results[0]
        lat, lon = top["latitude"], top["longitude"]
        resolved = ", ".join(x for x in [top.get("name"), top.get("country")] if x)

        fx = await self._get(
            FORECAST_URL,
            {
                "latitude": lat,
                "longitude": lon,
                "current_weather": "true",
                "timezone": "auto",
            },
        )

        cw = fx.get("current_weather") or {}
        if not cw:
            raise AppError("upstream_error", "No current_weather in response", 502)

        return ForecastResponse(
            location=resolved or location,
            temperature_c=float(cw["temperature"]),
            condition=_condition(int(cw.get("weathercode", -1))),
            forecast_time_utc=(
                f"{cw['time']}Z" if not cw["time"].endswith("Z") else cw["time"]
            ),
            timezone=fx.get("timezone"),   # e.g. "Asia/Tokyo"
            provider=self.name,
        )