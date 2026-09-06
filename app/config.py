from __future__ import annotations

from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openai_api_key: str = Field(default="not-needed")
    openai_base_url: str = Field(default="http://localhost:8889/v1")
    openai_model: str = Field(default="mlx-community/Meta-Llama-3.1-8B-Instruct-4bit")

    weather_provider: Literal["open-meteo", "openweathermap"] = "open-meteo"
    openweather_api_key: str | None = None

    request_timeout_s: float = 15.0


settings = Settings()