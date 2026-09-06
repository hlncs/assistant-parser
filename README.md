# assistant-parser

A small FastAPI service that demonstrates the full OpenAI tool-calling loop against a **local** LLM:

1. **Parser** — turns a `ChatCompletion` into typed `AssistantMessage` / `ToolCallRequest` objects,
   with a fallback for Llama-3.1's content-embedded tool-call format.
2. **Tool endpoint** — `POST /tools/get_forecast`, backed by Open-Meteo (no API key) or OpenWeatherMap.
3. **Chat orchestrator** — `POST /chat` runs a two-turn loop: LLM → tool → LLM → grounded reply.

## Architecture

```
                        ┌─────────────────────────────┐
POST /chat  ─────────►  │  app/orchestrator.py        │
                        │   turn 1: chat.completions  │◄────────── OpenAI SDK
                        │            + tools=[...]    │            │
                        │   parse_chat_completion() ──┼─► parser/  │
                        │   dispatch in-process ──────┼─► /tools/get_forecast
                        │   turn 2: chat.completions  │            │
                        └─────────────────────────────┘            ▼
                                                        localhost:8889/v1
                                                        (mlx_lm.server  OR
                                                         llama-server --jinja)
```

## LLM backends

Both are OpenAI-compatible on `http://localhost:8889/v1`; the app is agnostic.

| Backend | Native `tool_calls`? | Parser path |
|---|---|---|
| `mlx_lm.server` | ❌ (emits JSON in `content`) | Llama-content **fallback** in [`parser/parse.py`](parser/parse.py ) |
| `llama-server --jinja` (llama.cpp ≥ b4599) | ✅ | Primary path |

### Option A — mlx_lm.server (simplest on Apple Silicon)

```bash
mlx_lm.server \
  --model mlx-community/Meta-Llama-3.1-8B-Instruct-4bit \
  --port 8889
```

### Option B — llama-server with native tool-call parsing

```bash
~/llama.cpp/build/bin/llama-server \
  -m ~/models/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf \
  --alias mlx-community/Meta-Llama-3.1-8B-Instruct-4bit \
  --host 127.0.0.1 --port 8889 \
  --jinja -c 8192 -ngl 999
```

The `--alias` flag keeps [`app/config.py`](app/config.py ) unchanged when swapping backends.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
cp .env.example .env
make install
make test        # 10 offline tests
make run         # uvicorn on :8000
```

## Endpoints

### `GET /health`
```json
{"status": "ok"}
```

### `POST /tools/get_forecast`
```bash
curl -s localhost:8000/tools/get_forecast \
  -H 'content-type: application/json' \
  -d '{"location":"Sydney, Australia","units":"metric"}' | jq
```
```json
{
  "location": "Sydney, Australia",
  "temperature_c": 22.0,
  "condition": "Mainly Clear",
  "forecast_time_utc": "2026-09-06T02:45Z",
  "provider": "open-meteo"
}
```

### `POST /chat`
```bash
curl -s localhost:8000/chat \
  -H 'content-type: application/json' \
  -d '{"message":"What is the current forecast in Sydney, Australia?"}' | jq
```
```json
{
  "reply": "The current forecast in Sydney, Australia is mostly clear with a temperature of 22°C ...",
  "tool_calls": [
    {
      "id": "4vcCHNA3eDYEdALCkMyE83kev33patL9",
      "name": "get_forecast",
      "arguments": {"location": "Sydney, Australia", "units": "metric"},
      "result": {
        "location": "Sydney, Australia",
        "temperature_c": 22.0,
        "condition": "Mainly Clear",
        "forecast_time_utc": "2026-09-06T02:45Z",
        "provider": "open-meteo"
      },
      "error": null
    }
  ]
}
```

**Tip**: inspect `tool_calls[0].id`.
- `call_<8hex>` → parser's Llama-content fallback fired (you're on `mlx_lm.server`).
- Any other id → native `tool_calls` from the backend (you're on `llama-server --jinja`).

## Configuration

All settings live in `.env` (see [`.env.example`](.env.example )):

| Var | Default | Notes |
|---|---|---|
| `OPENAI_API_KEY` | `not-needed` | local server ignores it |
| `OPENAI_BASE_URL` | `http://localhost:8889/v1` | |
| `OPENAI_MODEL` | `mlx-community/Meta-Llama-3.1-8B-Instruct-4bit` | match the alias your backend exposes |
| `WEATHER_PROVIDER` | `open-meteo` | or `openweathermap` |
| `OPENWEATHER_API_KEY` | _(unset)_ | required only for OWM |
| `REQUEST_TIMEOUT_S` | `15.0` | upstream HTTP timeout |

## Errors

Structured envelope everywhere:
```json
{"error": {"code": "invalid_location", "message": "No geocoding match for 'Nowheresville'"}}
```

| Code | Status | When |
|---|---|---|
| `invalid_location` | 400 | Geocoding returned no results |
| `invalid_request` | 422 | Request body failed validation |
| `unknown_tool` | 400 | LLM asked for a tool we don't expose |
| `upstream_rate_limited` | 502 | Weather provider returned 429 |
| `upstream_error` / `upstream_unreachable` | 502 | Weather provider failure |
| `upstream_llm_error` | 502 | LLM backend returned 4xx/5xx (body included, truncated) |
| `internal_error` | 500 | Unhandled exception |

Every response echoes `x-correlation-id` (auto-generated if the client didn't send one) and logs are JSON.

## Development

```bash
make test    # pytest -q  (offline; uses httpx MockTransport and mocked OpenAI client)
make lint    # ruff check
make fmt     # ruff format
make type    # mypy --strict
make run     # uvicorn --reload
```

Tests do **not** require the LLM server or network access.

## Project layout

```
app/
  main.py              # FastAPI app + lifespan httpx client
  config.py            # Settings (pydantic-settings)
  errors.py            # AppError + handlers (incl. openai.APIStatusError)
  logging.py           # JSON logs + correlation-id middleware
  openai_client.py     # AsyncOpenAI factory + TOOLS schema
  orchestrator.py      # POST /chat two-turn loop
  schemas.py           # Request/response Pydantic models
  weather/
    base.py            # WeatherProvider protocol
    open_meteo.py      # Open-Meteo provider (geocode + forecast + WMO map)
    openweathermap.py  # OWM provider
    router.py          # POST /tools/get_forecast + in-process helper
parser/
  models.py            # AssistantMessage, ToolCallRequest, ParserError
  parse.py             # parse_chat_completion (+ Llama-content fallback)
tests/                 # 10 offline tests
```

## Why the Llama-content fallback exists

Llama-3.1-Instruct emits tool calls as JSON *inside* the assistant message content:

```
{"name": "get_forecast", "parameters": {"location": "Sydney, Australia"}}
```

- `llama-server --jinja` parses this server-side and returns proper OpenAI `tool_calls`.
- `mlx_lm.server` (as of writing) forwards it verbatim in `content`.

The fallback in [`parser/parse.py`](parser/parse.py ) detects that shape and normalises it into a
`ToolCallRequest` with a synthetic `call_<8hex>` id, so the orchestrator is backend-agnostic.

## Roadmap

- [ ] Streaming `/chat` (SSE)
- [ ] Multi-hop tool loop (capped)
- [ ] Second tool (e.g. `get_time_in_timezone`)
- [ ] OpenTelemetry spans around LLM + provider calls
- [ ] CI (GitHub Actions running `make lint type test`)