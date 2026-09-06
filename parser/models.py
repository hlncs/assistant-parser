from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field


class ParserError(ValueError):
    """Raised when a ChatCompletion cannot be parsed into our domain model."""


class AssistantMessage(BaseModel):
    type: Literal["assistant_message"] = "assistant_message"
    content: str


class ToolCallRequest(BaseModel):
    type: Literal["tool_call"] = "tool_call"
    id: str
    name: str
    arguments: dict[str, Any]


ParsedItem = Annotated[
    AssistantMessage | ToolCallRequest,
    Field(discriminator="type"),
]