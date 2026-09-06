from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch


def _fake_completion(*, content: str | None = None, tool_calls: list | None = None):
    def dump():
        return {
            "choices": [
                {
                    "message": {
                        "content": content,
                        "tool_calls": [
                            {
                                "id": tc["id"],
                                "type": "function",
                                "function": {
                                    "name": tc["name"],
                                    "arguments": json.dumps(tc["arguments"]),
                                },
                            }
                            for tc in (tool_calls or [])
                        ],
                    }
                }
            ]
        }

    completion = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(content=content, tool_calls=tool_calls or [])
            )
        ]
    )
    completion.model_dump = dump  # type: ignore[attr-defined]
    return completion


def test_chat_two_turn_tool_loop(client):
    turn1 = _fake_completion(
        tool_calls=[
            {
                "id": "call_1",
                "name": "get_forecast",
                "arguments": {"location": "Sydney", "units": "metric"},
            }
        ]
    )
    turn2 = _fake_completion(content="It's 21.4°C and partly cloudy in Sydney.")

    fake_client = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(create=AsyncMock(side_effect=[turn1, turn2]))
        )
    )

    async def fake_forecast(location: str, units: str = "metric"):
        from app.schemas import ForecastResponse

        return ForecastResponse(
            location=location,
            temperature_c=21.4,
            condition="Partly Cloudy",
            forecast_time_utc="2026-09-06T04:00:00Z",
            provider="open-meteo",
        )

    with (
        patch("app.orchestrator.get_openai_client", return_value=fake_client),
        patch("app.orchestrator.get_forecast_direct", side_effect=fake_forecast),
    ):
        r = client.post("/chat", json={"message": "What's the forecast in Sydney?"})

    assert r.status_code == 200, r.text
    body = r.json()
    assert "Sydney" in body["reply"]
    assert len(body["tool_calls"]) == 1
    assert body["tool_calls"][0]["name"] == "get_forecast"
    assert body["tool_calls"][0]["result"]["temperature_c"] == 21.4