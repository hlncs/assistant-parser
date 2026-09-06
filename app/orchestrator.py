from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter

from app.config import settings
from app.errors import AppError
from app.openai_client import TOOLS, get_openai_client
from app.schemas import ChatRequest, ChatResponse, ToolCallTrace
from app.weather.router import get_forecast_direct
from parser import AssistantMessage, ToolCallRequest, parse_chat_completion

log = logging.getLogger(__name__)
router = APIRouter(tags=["chat"])

SYSTEM_PROMPT = (
    "You are a helpful assistant with access to tools. "
    "When the user asks about current weather or forecast, you MUST call the "
    "`get_forecast` function with a specific location string (e.g. 'Sydney, Australia'). "
    "Do not answer weather questions from prior knowledge."
)


async def _dispatch_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    if name != "get_forecast":
        raise AppError("unknown_tool", f"No such tool: {name}", 400)
    location = str(arguments.get("location", "")).strip()
    units = str(arguments.get("units", "metric"))
    if not location:
        raise AppError("invalid_request", "Missing 'location' in tool args", 400)
    result = await get_forecast_direct(location, units)
    return result.model_dump()


@router.post("/chat", response_model=ChatResponse)
async def chat(body: ChatRequest) -> ChatResponse:
    client = get_openai_client()
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": body.message},
    ]

    # Turn 1
    first = await client.chat.completions.create(
        model=settings.openai_model, messages=messages, tools=TOOLS, tool_choice="auto"
    )
    parsed = parse_chat_completion(first)
    traces: list[ToolCallTrace] = []

    tool_calls = [p for p in parsed if isinstance(p, ToolCallRequest)]
    if not tool_calls:
        # No tool needed; return assistant content directly.
        msg = next((p for p in parsed if isinstance(p, AssistantMessage)), None)
        return ChatResponse(reply=msg.content if msg else "", tool_calls=[])

    # Append the assistant turn with tool_calls to satisfy the API contract.
    assistant_msg = first.choices[0].message
    messages.append(
        {
            "role": "assistant",
            "content": assistant_msg.content or "",
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.name, "arguments": json.dumps(tc.arguments)},
                }
                for tc in tool_calls
            ],
        }
    )

    for tc in tool_calls:
        trace = ToolCallTrace(id=tc.id, name=tc.name, arguments=tc.arguments)
        try:
            result = await _dispatch_tool(tc.name, tc.arguments)
            trace.result = result
            tool_content = json.dumps(result)
        except AppError as e:
            trace.error = f"{e.code}: {e.message}"
            tool_content = json.dumps({"error": {"code": e.code, "message": e.message}})
        traces.append(trace)
        messages.append(
            {"role": "tool", "tool_call_id": tc.id, "name": tc.name, "content": tool_content}
        )

    # Turn 2
    second = await client.chat.completions.create(
        model=settings.openai_model, messages=messages
    )
    parsed2 = parse_chat_completion(second)
    reply = next((p.content for p in parsed2 if isinstance(p, AssistantMessage)), "")
    return ChatResponse(reply=reply, tool_calls=traces)