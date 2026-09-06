from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any

from .models import AssistantMessage, ParsedItem, ParserError, ToolCallRequest

log = logging.getLogger(__name__)


def _to_dict(obj: Any) -> dict[str, Any]:
    if isinstance(obj, dict):
        return obj
    dump = getattr(obj, "model_dump", None)
    if callable(dump):
        return dump()  # type: ignore[no-any-return]
    raise ParserError("Unsupported ChatCompletion type; expected dict or pydantic model.")


_LLAMA_TOOL_RE = re.compile(r"\{.*\}", re.DOTALL)
_LLAMA_TAG = "<|python_tag|>"


def _try_extract_llama_tool_call(content: str) -> ToolCallRequest | None:
    """Llama 3.1 emits tool calls as JSON in `content` like:
        {"name": "get_forecast", "parameters": {...}}
    or  {"name": "get_forecast", "arguments": {...}}
    Optionally wrapped in <|python_tag|> ... <|eom_id|> markers.
    """
    if not content:
        return None
    stripped = content.strip()
    if stripped.startswith(_LLAMA_TAG):
        stripped = stripped[len(_LLAMA_TAG):].strip()
    match = _LLAMA_TOOL_RE.search(stripped)
    if not match:
        return None
    try:
        obj = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    if not isinstance(obj, dict):
        return None
    name = obj.get("name")
    args = obj.get("arguments") or obj.get("parameters")
    if not isinstance(name, str) or not isinstance(args, dict):
        return None
    return ToolCallRequest(id=f"call_{uuid.uuid4().hex[:8]}", name=name, arguments=args)


def parse_chat_completion(completion: Any) -> list[ParsedItem]:
    """Parse an OpenAI ChatCompletion into a list of AssistantMessage/ToolCallRequest items.

    Rules:
      - If the message has tool_calls, emit one ToolCallRequest per call.
      - Otherwise emit a single AssistantMessage (content may be empty string).
      - Malformed tool-call JSON arguments raise ParserError.
    """
    data = _to_dict(completion)
    choices = data.get("choices") or []
    if not choices:
        raise ParserError("ChatCompletion has no choices.")

    message = choices[0].get("message") or {}
    tool_calls = message.get("tool_calls") or []

    if tool_calls:
        log.debug("parser: native tool_calls path (%d calls)", len(tool_calls))
        items: list[ParsedItem] = []
        for tc in tool_calls:
            fn = tc.get("function") or {}
            name = fn.get("name")
            raw_args = fn.get("arguments", "")
            call_id = tc.get("id")
            if not name or not call_id:
                raise ParserError("Tool call missing id or function.name.")
            try:
                args = json.loads(raw_args) if isinstance(raw_args, str) else dict(raw_args)
            except json.JSONDecodeError as e:
                raise ParserError(f"Malformed tool_call arguments JSON: {e}") from e
            if not isinstance(args, dict):
                raise ParserError("Tool call arguments must decode to a JSON object.")
            items.append(ToolCallRequest(id=call_id, name=name, arguments=args))
        return items

    content = message.get("content") or ""
    if not isinstance(content, str):
        raise ParserError("Assistant message content must be a string.")

    # Fallback: Llama-style tool call embedded in content.
    fallback = _try_extract_llama_tool_call(content)
    if fallback is not None:
        log.info("parser: llama-content fallback fired")
        return [fallback]

    return [AssistantMessage(content=content)]