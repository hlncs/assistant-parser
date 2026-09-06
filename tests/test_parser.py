from __future__ import annotations

import pytest

from parser import AssistantMessage, ParserError, ToolCallRequest, parse_chat_completion


def _completion(message: dict) -> dict:
    return {"choices": [{"message": message}]}


def test_plain_assistant_message():
    out = parse_chat_completion(_completion({"role": "assistant", "content": "Hello!"}))
    assert out == [AssistantMessage(content="Hello!")]


def test_empty_content_returns_empty_string():
    out = parse_chat_completion(_completion({"role": "assistant", "content": None}))
    assert out == [AssistantMessage(content="")]


def test_multiple_tool_calls():
    out = parse_chat_completion(
        _completion(
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "call_1",
                        "type": "function",
                        "function": {"name": "get_forecast", "arguments": '{"location":"Sydney"}'},
                    },
                    {
                        "id": "call_2",
                        "type": "function",
                        "function": {"name": "get_forecast", "arguments": '{"location":"Paris"}'},
                    },
                ],
            }
        )
    )
    assert len(out) == 2
    assert all(isinstance(x, ToolCallRequest) for x in out)
    assert out[0].arguments == {"location": "Sydney"}


def test_malformed_arguments_raises():
    with pytest.raises(ParserError):
        parse_chat_completion(
            _completion(
                {
                    "role": "assistant",
                    "tool_calls": [
                        {
                            "id": "call_1",
                            "type": "function",
                            "function": {"name": "get_forecast", "arguments": "{not json"},
                        }
                    ],
                }
            )
        )


def test_no_choices_raises():
    with pytest.raises(ParserError):
        parse_chat_completion({"choices": []})


def test_llama_style_tool_call_in_content():
    out = parse_chat_completion(
        _completion(
            {
                "role": "assistant",
                "content": '{"name":"get_forecast","parameters":{"location":"Sydney, Australia","units":"metric"}}',
            }
        )
    )
    assert len(out) == 1
    tc = out[0]
    assert isinstance(tc, ToolCallRequest)
    assert tc.name == "get_forecast"
    assert tc.arguments == {"location": "Sydney, Australia", "units": "metric"}