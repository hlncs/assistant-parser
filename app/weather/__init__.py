from __future__ import annotations

import httpx

from app.config import settings
from app.errors import AppError

from .base import WeatherProvider
from .open_meteo import OpenMeteoProvider
from .openweathermap import OpenWeatherMapProvider


def build_provider(client: httpx.AsyncClient) -> WeatherProvider:
    if settings.weather_provider == "open-meteo":
        return OpenMeteoProvider(client)
    if settings.weather_provider == "openweathermap":
        if not settings.openweather_api_key:
            raise AppError("misconfigured", "OPENWEATHER_API_KEY not set", 500)
        return OpenWeatherMapProvider(client, settings.openweather_api_key)
    raise AppError("misconfigured", f"Unknown provider: {settings.weather_provider}", 500)


__all__ = ["WeatherProvider", "build_provider"]