from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ForecastRequest(BaseModel):
    location: str = Field(min_length=1)
    units: Literal["metric", "imperial"] = "metric"


class ForecastResponse(BaseModel):
    location: str
    temperature_c: float
    condition: str
    forecast_time_utc: str
    provider: str
    timezone: str | None = None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)


class ToolCallTrace(BaseModel):
    id: str
    name: str
    arguments: dict[str, Any]
    result: dict[str, Any] | None = None
    error: str | None = None


class ChatResponse(BaseModel):
    reply: str
    tool_calls: list[ToolCallTrace] = Field(default_factory=list)


class SuggestLocationRequest(BaseModel):
    input: str = Field(min_length=1, max_length=200)


class SuggestLocationResponse(BaseModel):
    suggestions: list[str] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] = "low"

    # Back-compat: some older clients may still read `.suggestion`.
    @property
    def suggestion(self) -> str:
        return self.suggestions[0] if self.suggestions else ""