# assistant-parser

A small FastAPI + React app that demonstrates LLM tool-calling with a weather
provider, plus a general-purpose travel assistant.

## Features

- **Weather Forecast tab** — current conditions via Open-Meteo, LLM-powered
  insights ("What to wear", "Compare to nearby", etc.), map preview, and
  "Did you mean…?" suggestions for ambiguous / misspelled locations.
- **Travel Assistant tab** — destination-aware prompts (packing list, best
  time to visit, weather-aware itinerary, hidden gems, …). The LLM can call
  `get_forecast` when the answer benefits from live weather data.
- **Cross-tab location copy** — one click to reuse the location entered on
  the other tab.
- **Tool-call trace panel** — every LLM tool invocation is surfaced in the
  UI with args, result, and status, so users can see what data grounded the
  answer.
- **Friendly error messages** — connection, rate-limit, auth, and timeout
  failures are translated into plain English on both tabs.
- **Dark / light theme** toggle.

## Architecture

```
[ React (Vite) ]  ──/api──▶  [ FastAPI ]  ──▶  [ OpenAI Chat Completions ]
       │                          │                     │
       │                          └──▶ get_forecast ──▶ [ Open-Meteo ]
       │
       └──▶ Open-Meteo geocoding (map only)
```

Endpoints (`app/orchestrator.py`):

| Route | Purpose |
| --- | --- |
| `POST /chat` | Weather chat (forces `get_forecast` on turn 1) |
| `POST /travel_chat` | Travel assistant (calls `get_forecast` when relevant) |
| `POST /suggest_location` | Disambiguates / corrects location input |
| `POST /tools/get_forecast` | Direct forecast lookup |

All LLM calls are wrapped in `_safe_llm_call`, which maps
`APIConnectionError`, `APITimeoutError`, `RateLimitError`, and
`AuthenticationError` to `HTTPException` with user-friendly `detail`
strings (503 / 429 / 500).

The frontend's `safeFetch` (`web/src/api.js`) maps status codes and
network failures to plain-English messages shown in the UI.

## Getting started

### Backend

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export OPENAI_API_KEY=sk-...
uvicorn app.main:app --reload
```

### Frontend

```bash
cd web
npm install
npm run dev          # http://localhost:5173
```

## Quality gates

```bash
make lint      # ruff
make type      # mypy
make test      # pytest
cd web && npm run test:e2e   # Playwright
```

## Prompts

System prompts live in `app/orchestrator.py`:

- `SYSTEM_PROMPT` — weather assistant; forces `get_forecast` for any
  location-specific question and forbids inventing numbers.
- `TRAVEL_SYSTEM_PROMPT` — travel assistant; instructs the model to call
  `get_forecast` when weather could improve the answer (packing, clothing,
  itineraries, outdoor plans), and enforces Markdown formatting.
- `SUGGEST_SYSTEM_PROMPT` — returns up to 3 disambiguation candidates as
  strict JSON.

## Error handling

| Failure mode | Backend response | User sees |
| --- | --- | --- |
| LLM unreachable | 503 | *The assistant is temporarily unavailable. Please try again in a moment.* |
| LLM rate-limited | 429 | *The assistant is busy right now. Please try again shortly.* |
| Bad / missing API key | 500 | *The assistant is misconfigured. Please contact support.* |
| Backend down / offline | — | *Cannot reach the server. Please check your connection and try again.* |

## Testing

- **Backend**: `pytest` — mocks OpenAI + Open-Meteo, verifies the two-turn
  tool loop, error paths, and location suggestion parsing.
- **Frontend E2E**: `playwright` — 5 specs covering tab switching,
  forecast rendering with local time, invalid-location suggestion chips,
  Markdown insights, and cross-tab location copy.