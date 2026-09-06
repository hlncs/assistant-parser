# API

All responses use JSON. Errors follow:

```json
{ "error": { "code": "invalid_location", "message": "..." } }
```

## POST /chat

Weather-focused chat. Always calls `get_forecast` for the referenced location.

Request: `{ "message": "What should I wear in Tokyo?" }`
Response: `{ "reply": "...", "tool_calls": [ { "id": "...", "name": "get_forecast", "arguments": {...}, "result": {...} } ] }`

## POST /travel_chat

General travel assistant. Uses `tool_choice="auto"` — may or may not call `get_forecast`.

Same request/response shape as `/chat`. `tool_calls` may be empty.

## POST /suggest_location

Request: `{ "input": "Brissy, Australia" }`
Response: `{ "suggestions": ["Brisbane, Australia"], "confidence": "high" }`

## GET /forecast

Query params: `city` (required), `country`, `units` (`metric`|`imperial`).

Response includes `location`, `temperature_c`, `condition`, `forecast_time_utc`,
`timezone` (IANA), `provider`.