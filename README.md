# assistant-parser

A small FastAPI + React app that demonstrates LLM tool-calling with a weather
provider, plus a general-purpose travel assistant.

## Features

- **Weather Forecast tab** — city/country → current conditions via
  [Open-Meteo](https://open-meteo.com/). Local time (with UTC in brackets),
  interactive map, and an LLM-powered *Insights* pane with canned prompts.
- **Travel Assistant tab** — free-form travel Q&A (attractions, packing,
  culture, itineraries). Uses the same `get_forecast` tool automatically when
  weather is materially relevant (e.g. packing lists, weather-aware itineraries).
- **"Did you mean…?"** — on `invalid_location`, the app asks the LLM for
  alternative spellings and offers them as one-click chips.
- Markdown-rendered assistant responses (headings, lists, bold).
- Structured error envelope, correlation IDs, JSON logging.
- Full quality gate: `ruff`, `mypy`, `pytest` (`make check`).

## Endpoints

| Method | Path                | Purpose                                            |
| ------ | ------------------- | -------------------------------------------------- |
| GET    | `/health`           | Liveness probe                                     |
| GET    | `/forecast`         | Direct forecast (city, country, units)             |
| POST   | `/chat`             | Weather-focused chat; forces `get_forecast`        |
| POST   | `/travel_chat`      | Travel assistant; `tool_choice="auto"`             |
| POST   | `/suggest_location` | LLM-suggested location spellings (top 3)           |

## Quickstart

```bash
# Backend
cp .env.example .env    # set OPENAI_API_KEY
make dev                # or: uvicorn app.main:app --reload

# Frontend
make web-install
make web-dev            # http://localhost:5173
```

## Quality gate

```bash
make check              # ruff + mypy + pytest
```

## Project layout

```
app/
  main.py               FastAPI app + lifespan + CORS + middleware
  orchestrator.py       /chat, /travel_chat, /suggest_location
  openai_client.py      OpenAI client + tool schema
  weather/
    router.py           /forecast direct endpoint
    open_meteo.py       Open-Meteo provider (geocode + current weather)
  schemas.py            Pydantic request/response models
  errors.py             AppError + FastAPI exception handlers
  logging.py            JSON logging + correlation IDs
parser/                 Standalone LLM-response parser package
web/                    Vite + React UI
  src/
    App.jsx             Tab shell
    WeatherTab.jsx      Weather Forecast tab
    TravelTab.jsx       Travel Assistant tab
    InsightsPane.jsx    LLM insights (Weather tab, right column)
    MapView.jsx         Leaflet map
    api.js              Fetch helpers
tests/                  pytest suite
```

## Notes

- The Travel tab uses `tool_choice="auto"` — the model calls `get_forecast`
  only when weather is relevant. General knowledge questions (visas, best time
  to visit) answer directly without a tool call.
- Assistant replies are Markdown; the UI renders them with `react-markdown`
  + `remark-gfm`.
- Forecast timestamps show the *location's* local time (via IANA `timezone`
  returned by Open-Meteo) followed by the raw UTC ISO in brackets.

## Getting started

### Prerequisites

- Python 3.11+
- Node.js 20+ / npm 10+
- An OpenAI API key

### 1. Scaffolding (first-time setup)

```bash
# Clone
git clone <repo-url> assistant-parser
cd assistant-parser

# Backend: virtualenv + deps
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'

# Secrets
cp .env.example .env
# then edit .env and set OPENAI_API_KEY=sk-...

# Frontend: node deps
make web-install       # == cd web && npm install
```

### 2. Run the backend (FastAPI)

```bash
make dev               # uvicorn app.main:app --reload --port 8000
# → http://localhost:8000
# → http://localhost:8000/docs   (OpenAPI UI)
# → http://localhost:8000/health
```

### 3. Run the frontend (Vite + React)

```bash
make web-dev           # cd web && npm run dev
# → http://localhost:5173
```

The frontend expects the backend on `http://localhost:8000` (configurable via
`web/.env` → `VITE_API_BASE`).

### 4. Exercise the LLM endpoints

```bash
# Weather-focused chat (forces get_forecast)
curl -s http://localhost:8000/chat \
  -H 'content-type: application/json' \
  -d '{"message":"What should I wear in Tokyo?"}' | jq

# Travel assistant (tool_choice=auto)
curl -s http://localhost:8000/travel_chat \
  -H 'content-type: application/json' \
  -d '{"message":"Top 3 attractions in Kyoto?"}' | jq

# Location disambiguation
curl -s http://localhost:8000/suggest_location \
  -H 'content-type: application/json' \
  -d '{"input":"Brissy, Australia"}' | jq

# Direct forecast (no LLM)
curl -s 'http://localhost:8000/forecast?city=Tokyo&country=Japan&units=metric' | jq
```

### 5. Quality gate

```bash
make check             # ruff + mypy + pytest
# individual:
make lint
make type
make test
```

### 6. Production build (frontend)

```bash
make web-build         # cd web && npm run build → web/dist/
```

### Frontend end-to-end tests (Playwright)

```bash
make web-e2e         # headless
make web-e2e-ui      # interactive UI mode
cd web && npm run test:e2e:report   # last HTML report
```

The E2E tests **mock all backend routes** (`/forecast`, `/suggest_location`,
`/travel_chat`), so they don't require the FastAPI server or an OpenAI key.