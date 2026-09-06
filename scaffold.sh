#!/usr/bin/env bash
# filepath: scaffold.sh
# Creates the assistant-parser project skeleton.
# Run from the repo root:  bash scaffold.sh
set -euo pipefail

ROOT="$(pwd)"
echo "Scaffolding assistant-parser in: $ROOT"

# --- Directories -------------------------------------------------------------
dirs=(
  "app"
  "app/weather"
  "parser"
  "tests"
  "prompts"
)
for d in "${dirs[@]}"; do
  mkdir -p "$d"
done

# --- Python package files ----------------------------------------------------
py_files=(
  "app/__init__.py"
  "app/main.py"
  "app/config.py"
  "app/logging.py"
  "app/schemas.py"
  "app/errors.py"
  "app/openai_client.py"
  "app/orchestrator.py"
  "app/weather/__init__.py"
  "app/weather/base.py"
  "app/weather/router.py"
  "app/weather/openweathermap.py"
  "app/weather/open_meteo.py"
  "parser/__init__.py"
  "parser/models.py"
  "parser/parse.py"
  "tests/__init__.py"
  "tests/conftest.py"
  "tests/test_parser.py"
  "tests/test_weather_openweathermap.py"
  "tests/test_weather_open_meteo.py"
  "tests/test_chat.py"
)
for f in "${py_files[@]}"; do
  [ -f "$f" ] || touch "$f"
done

# --- Root project files ------------------------------------------------------
root_files=(
  ".gitignore"
  ".dockerignore"
  ".env.example"
  "Dockerfile"
  "docker-compose.yml"
  "pyproject.toml"
  "Makefile"
  "README.md"
)
for f in "${root_files[@]}"; do
  [ -f "$f" ] || touch "$f"
done

# --- Minimal .env.example (safe placeholder, no secrets) ---------------------
if [ ! -s ".env.example" ]; then
  cat > .env.example <<'EOF'
# Local OpenAI-compatible server (MLX)
OPENAI_API_KEY=not-needed
OPENAI_BASE_URL=http://localhost:8889/v1
OPENAI_MODEL=mlx-community/Meta-Llama-3.1-8B-Instruct-4bit

# Weather providers
WEATHER_PROVIDER=openweathermap
OPENWEATHER_API_KEY=replace-me
EOF
fi

# --- Minimal .gitignore ------------------------------------------------------
if [ ! -s ".gitignore" ]; then
  cat > .gitignore <<'EOF'
__pycache__/
*.py[cod]
.venv/
.env
.pytest_cache/
.mypy_cache/
.ruff_cache/
dist/
build/
*.egg-info/
.DS_Store
EOF
fi

echo "Done. Tree:"
if command -v tree >/dev/null 2>&1; then
  tree -a -I '.git|__pycache__|.venv' --dirsfirst
else
  find . -path ./.git -prune -o -print | sort
fi