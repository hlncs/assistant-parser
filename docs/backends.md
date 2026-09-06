# LLM backend runbook

Both backends must expose an OpenAI-compatible API at `http://localhost:8889/v1`
and identify the model as `mlx-community/Meta-Llama-3.1-8B-Instruct-4bit`
(matches the default in [`app/config.py`](../app/config.py)).

## mlx_lm.server (Apple Silicon, no admin)

```bash
pip install mlx-lm
mlx_lm.server \
  --model mlx-community/Meta-Llama-3.1-8B-Instruct-4bit \
  --port 8889
```

Tool calls arrive in `content`; the parser's Llama-content fallback handles them.
`tool_calls[].id` will look like `call_<8hex>`.

## llama-server with `--jinja` (native tool_calls)

Requires llama.cpp ≥ **b4599** (b4404 does NOT have `--jinja`).

### Install (no admin)

```bash
mkdir -p ~/llama.cpp && cd ~/llama.cpp
# Download the latest macos-arm64 zip from
#   https://github.com/ggml-org/llama.cpp/releases/latest
curl -LO https://github.com/ggml-org/llama.cpp/releases/download/b6300/llama-b6300-bin-macos-arm64.zip
unzip -o llama-*-bin-macos-arm64.zip
xattr -dr com.apple.quarantine .
./build/bin/llama-server --version
```

### Get a GGUF

```bash
hf download bartowski/Meta-Llama-3.1-8B-Instruct-GGUF \
  Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf \
  --local-dir ~/models
```

### Run

```bash
~/llama.cpp/build/bin/llama-server \
  -m ~/models/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf \
  --alias mlx-community/Meta-Llama-3.1-8B-Instruct-4bit \
  --host 127.0.0.1 --port 8889 \
  --jinja \
  -c 8192 \
  -ngl 999
```

Verify:
```bash
curl -s localhost:8889/v1/models | jq '.data[].id'
# → "mlx-community/Meta-Llama-3.1-8B-Instruct-4bit"
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/chat` returns `{"error":{"code":"upstream_llm_error", ...}}` with a message from the backend | LLM server rejected the request (bad tool schema, alias mismatch, etc.) | Read the message; check `llama-server` logs |
| `/chat` reply is raw JSON `{"name":"get_forecast",...}` and `tool_calls: []` | You're on `mlx_lm.server` **and** the parser fallback isn't firing | Confirm `parser/parse.py` has `_try_extract_llama_tool_call` |
| `tool_calls[0].id` starts with `call_<8hex>` | Fallback fired (expected on mlx_lm.server) | Switch to `llama-server --jinja` if you want native ids |
| llama-server: `error: invalid argument: --jinja` | Build is older than b4599 | Download a newer release zip |