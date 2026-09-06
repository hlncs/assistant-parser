from __future__ import annotations

from openai import AsyncOpenAI

from app.config import settings

_client: AsyncOpenAI | None = None


def get_openai_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url)
    return _client


TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "get_forecast",
            "description": "Get the current weather forecast for a location.",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": (
                            "City name, optionally with country. "
                            "e.g. 'Sydney, Australia'."
                        ),
                    },
                    "units": {
                        "type": "string",
                        "enum": ["metric", "imperial"],
                        "default": "metric",
                    },
                },
                "required": ["location"],
            },
        },
    }
]