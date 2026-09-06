from __future__ import annotations

import json
import logging
from collections.abc import Awaitable
from typing import Any, Literal, cast

import httpx
from fastapi import APIRouter, HTTPException
from openai import APIConnectionError, APITimeoutError, AuthenticationError, RateLimitError
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


async def _safe_llm_call[T](coro: Awaitable[T]) -> T:
    try:
        return await coro
    except (APIConnectionError, APITimeoutError) as err:
        raise HTTPException(
            status_code=503,
            detail="The assistant is temporarily unavailable. Please try again in a moment.",
        ) from err
    except RateLimitError as err:
        raise HTTPException(
            status_code=429,
            detail="The assistant is busy right now. Please try again shortly.",
        ) from err
    except AuthenticationError as err:
        raise HTTPException(
            status_code=500,
            detail="The assistant is misconfigured. Please contact support.",
        ) from err


@router.post("/chat", response_model=ChatResponse)
async def chat(body: ChatRequest) -> ChatResponse:
    client = get_openai_client()
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": body.message},
    ]

    # Turn 1 — force get_forecast so we always have grounded data
    first = await _safe_llm_call(client.chat.completions.create(
        model=settings.openai_model,
        messages=cast(list[ChatCompletionMessageParam], messages),
        tools=cast(list[ChatCompletionToolParam], TOOLS),
        tool_choice={"type": "function", "function": {"name": "get_forecast"}},
        temperature=0,
        seed=42,
    ))
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
    second = await _safe_llm_call(client.chat.completions.create(
        model=settings.openai_model,
        messages=cast(list[ChatCompletionMessageParam], messages),
        temperature=0,
        seed=42,
    ))
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


GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"


async def _geocode_search(http: httpx.AsyncClient, name: str) -> list[dict[str, Any]]:
    try:
        r = await http.get(GEOCODE_URL, params={"name": name, "count": 5, "language": "en"})
        return (r.json() or {}).get("results", []) if r.is_success else []
    except httpx.HTTPError:
        return []


def _label(hit: dict[str, Any]) -> str:
    parts = [hit.get("name"), hit.get("admin1"), hit.get("country")]
    return ", ".join(p for p in parts if p)


async def _llm_spelling_candidates(query: str) -> list[str]:
    """Ask the LLM for plausible spelling corrections. Bare place names only —
    the geocoder will fill in admin/country when validating."""
    client = get_openai_client()
    prompt = (
        "The user searched for a place but the geocoder found no match, "
        "likely due to a typo. Suggest up to 3 correctly-spelled place names "
        "that are close spelling/phonetic matches to the input.\n"
        'Return ONLY JSON: {"candidates": ["Townsville", ...]}\n'
        "Rules:\n"
        "- Each candidate must be a REAL place you are confident exists.\n"
        "- Only include candidates that share most letters or sound like the input. "
        "  If nothing is close, return fewer candidates or an empty list.\n"
        "- If a region/country hint is included (e.g. 'Tonsville, Australia'), "
        "  candidates MUST be in that region.\n"
        "- Do NOT pad with unrelated well-known places.\n"
        "- No prose. No code fences. JSON only.\n"
        f"User input: {query!r}"
    )
    try:
        resp = await _safe_llm_call(client.chat.completions.create(
            model=settings.openai_model,
            messages=cast(list[ChatCompletionMessageParam],
                          [{"role": "user", "content": prompt}]),
            response_format={"type": "json_object"},
            temperature=0,
            seed=42,
        ))
        content = resp.choices[0].message.content or "{}"
        data = json.loads(content)
        cands = data.get("candidates", [])
        return [str(c).strip() for c in cands if isinstance(c, str) and c.strip()][:3]
    except (json.JSONDecodeError, HTTPException) as err:
        log.warning("suggest_location: LLM candidate step failed: %s", err)
        return []


@router.post("/suggest_location", response_model=SuggestLocationResponse)
async def suggest_location(body: SuggestLocationRequest) -> SuggestLocationResponse:
    """
    Two-stage lookup:
      1. Direct geocode (handles correctly-spelled places).
      2. If nothing found, ask the LLM for spelling candidates and validate
         each against the geocoder. Only real, verified places are returned.
    """
    query = body.input.strip()
    if not query:
        return SuggestLocationResponse(suggestions=[], confidence="none")

    async with httpx.AsyncClient(timeout=10) as http:
        # Stage 1: direct search — full query, then first token
        results = await _geocode_search(http, query)
        if not results and "," in query:
            results = await _geocode_search(http, query.split(",", 1)[0].strip())

        # Extract region hint from the tail of the query, e.g. "Tonsville, Australia" → "australia"
        region_hint = query.rsplit(",", 1)[1].strip().lower() if "," in query else ""

        # Stage 2: LLM candidates, each verified by the geocoder
        if not results:
            for cand in await _llm_spelling_candidates(query):
                hits = await _geocode_search(http, cand)
                for hit in hits:
                    if region_hint and region_hint not in (
                        (hit.get("country") or "").lower(),
                        (hit.get("admin1") or "").lower(),
                    ):
                        continue
                    results.append(hit)
                    break  # keep just the best hit per candidate

    suggestions = [_label(h) for h in results if h.get("name")]

    seen: set[str] = set()
    deduped: list[str] = []
    for s in suggestions:
        if s not in seen:
            seen.add(s)
            deduped.append(s)

    confidence: Literal["high", "none"] = "high" if deduped else "none"
    return SuggestLocationResponse(suggestions=deduped[:5], confidence=confidence)


TRAVEL_SYSTEM_PROMPT = """You are a helpful travel assistant.

Rules:
- Only call `get_forecast` when the user's message names a specific location.
  NEVER invent, guess, or default to a city (e.g. do not call get_forecast
  with 'Sydney' just because no location was given).
- If the user asks about a place, activity, event, venue, or detail you are
  not confident about, say: "I don't have reliable information about that."
  Do NOT fabricate names, prices, addresses, or timetables.
- Prefer concise, well-structured Markdown.
"""


@router.post("/travel_chat", response_model=ChatResponse)
async def travel_chat(body: ChatRequest) -> ChatResponse:
    client = get_openai_client()
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": TRAVEL_SYSTEM_PROMPT},
        {"role": "user", "content": body.message},
    ]

    first = await _safe_llm_call(client.chat.completions.create(
        model=settings.openai_model,
        messages=cast(list[ChatCompletionMessageParam], messages),
        tools=cast(list[ChatCompletionToolParam], TOOLS),
        tool_choice="auto",
        temperature=0.2,
        seed=42,
    ))
    parsed = parse_chat_completion(first)
    traces: list[ToolCallTrace] = []
    tool_calls = [p for p in parsed if isinstance(p, ToolCallRequest)]

    if not tool_calls:
        msg = next((p for p in parsed if isinstance(p, AssistantMessage)), None)
        return ChatResponse(reply=(msg.content if msg else ""), tool_calls=[])

    # Append the raw assistant message (with tool_calls) then each tool result.
    messages.append(first.choices[0].message.model_dump())
    for tc in tool_calls:
        trace = ToolCallTrace(id=tc.id, name=tc.name, arguments=tc.arguments)
        try:
            result = await _dispatch_tool(tc.name, tc.arguments)
            trace.result = result
            tool_content = json.dumps(result)
        except AppError as e:
            trace.error = f"{e.code}: {e.message}"
            tool_content = json.dumps({"error": {"code": e.code, "message": e.message}})
        except Exception as e:  # last-resort safety net
            log.exception("travel_chat: tool %s crashed", tc.name)
            trace.error = f"internal: {e}"
            tool_content = json.dumps({"error": {"code": "internal", "message": str(e)}})
        traces.append(trace)
        messages.append(
            {"role": "tool", "tool_call_id": tc.id, "content": tool_content}
        )

    second = await _safe_llm_call(client.chat.completions.create(
        model=settings.openai_model,
        messages=cast(list[ChatCompletionMessageParam], messages),
        temperature=0.2,
        seed=42,
    ))
    reply = (second.choices[0].message.content or "").strip()
    return ChatResponse(reply=reply, tool_calls=traces)