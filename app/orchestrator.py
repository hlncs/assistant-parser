from __future__ import annotations

import json
import logging
from typing import Any, Literal, cast

from fastapi import APIRouter
from openai.types.chat import ChatCompletionMessageParam, ChatCompletionToolParam

from app.config import settings
from app.errors import AppError
from app.openai_client import TOOLS, get_openai_client
from app.schemas import (
    ChatRequest,
    ChatResponse,
    SuggestLocationRequest,
    SuggestLocationResponse,
    ToolCallTrace,
)
from app.weather.router import get_forecast_direct
from parser import AssistantMessage, ToolCallRequest, parse_chat_completion

log = logging.getLogger(__name__)
router = APIRouter(tags=["chat"])

ConfidenceT = Literal["high", "medium", "low"]

SYSTEM_PROMPT = (
    "You are a concise, friendly weather assistant.\n"
    "You have ONE tool: `get_forecast(location, units)` that returns CURRENT weather only.\n"
    "\n"
    "Rules:\n"
    "1. For ANY question that references a specific location's weather — including "
    "   'current', 'now', 'today', 'summarise', 'describe', 'compare', 'what should I wear' — "
    "   you MUST call `get_forecast` first with that location.\n"
    "2. After the tool result is available, ALWAYS produce a natural-language answer "
    "   grounded in that result. Never refuse. Never say you cannot answer.\n"
    "3. You have NO historical or forecast-beyond-now data. If asked about the past or "
    "   future, answer qualitatively from general climate knowledge and say so plainly. "
    "   Never invent specific numbers. Never write pseudo-code.\n"
    "4. Keep replies to 1–3 sentences unless the user asks for more."
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

    # Turn 1 — force get_forecast so we always have grounded data
    first = await client.chat.completions.create(
        model=settings.openai_model,
        messages=cast(list[ChatCompletionMessageParam], messages),
        tools=cast(list[ChatCompletionToolParam], TOOLS),
        tool_choice={"type": "function", "function": {"name": "get_forecast"}},
        temperature=0,
        seed=42,
    )
    parsed = parse_chat_completion(first)
    traces: list[ToolCallTrace] = []

    tool_calls = [p for p in parsed if isinstance(p, ToolCallRequest)]
    if not tool_calls:
        log.warning("chat: forced tool_choice but model emitted no tool_calls; content=%r",
                    first.choices[0].message.content)
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
            {"role": "tool", "tool_call_id": tc.id, "content": tool_content}
        )

    # Turn 2
    second = await client.chat.completions.create(
        model=settings.openai_model,
        messages=cast(list[ChatCompletionMessageParam], messages),
        temperature=0,
        seed=42,
    )
    parsed2 = parse_chat_completion(second)
    reply = next((p.content for p in parsed2 if isinstance(p, AssistantMessage)), "")
    return ChatResponse(reply=reply, tool_calls=traces)


SUGGEST_SYSTEM_PROMPT = (
    "You help resolve ambiguous or misspelled place names for a weather app.\n"
    "Given the user's input, return ONLY a JSON object:\n"
    '  {"suggestions": ["City, Region, Country", ...], "confidence": "high"|"medium"|"low"}\n'
    "Rules:\n"
    "- Return up to 3 suggestions, most likely first.\n"
    "- If the input is ambiguous (e.g. 'Stockton, USA' — many US cities share the name), "
    "  disambiguate by adding the state/region (e.g. 'Stockton, California, USA', "
    "  'Stockton, Missouri, USA'). Prefer the largest / most well-known cities first.\n"
    "- If the input is misspelled, correct it (e.g. 'Woollongong' -> 'Wollongong, Australia').\n"
    "- If the input is already unambiguous, return it as the single suggestion "
    "with confidence 'high'.\n"
    "- If you cannot guess, return {\"suggestions\": [], \"confidence\": \"low\"}.\n"
    "- Use full country names (USA, Australia, United Kingdom, etc).\n"
    "- No prose. No code fences. JSON only."
)


@router.post("/suggest_location", response_model=SuggestLocationResponse)
async def suggest_location(body: SuggestLocationRequest) -> SuggestLocationResponse:
    client = get_openai_client()
    resp = await client.chat.completions.create(
        model=settings.openai_model,
        messages=cast(
            list[ChatCompletionMessageParam],
            [
                {"role": "system", "content": SUGGEST_SYSTEM_PROMPT},
                {"role": "user", "content": body.input},
            ],
        ),
        temperature=0,
        seed=42,
    )
    content = (resp.choices[0].message.content or "").strip()
    if content.startswith("```"):
        content = content.strip("`")
        if content.lower().startswith("json"):
            content = content[4:].strip()

    suggestions: list[str] = []
    confidence: ConfidenceT = "low"
    try:
        data = json.loads(content)
        raw = data.get("suggestions") or []
        if isinstance(raw, list):
            suggestions = [str(s).strip() for s in raw if str(s).strip()][:3]
        elif isinstance(data.get("suggestion"), str):  # backward-compat
            s = data["suggestion"].strip()
            if s:
                suggestions = [s]
        c = str(data.get("confidence", "low")).strip().lower()
        if c in ("high", "medium", "low"):
            confidence = cast(ConfidenceT, c)
    except (json.JSONDecodeError, TypeError, AttributeError):
        log.warning("suggest_location: unparseable LLM output=%r", content)

    return SuggestLocationResponse(suggestions=suggestions, confidence=confidence)