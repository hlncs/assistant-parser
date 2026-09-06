.PHONY: install run test lint type fmt web-install web-dev web-build check dev web-e2e web-e2e-ui

install:
	python3 -m pip install -e '.[dev]'

run: dev

dev:
	uvicorn app.main:app --reload --port 8000

test:
	pytest -q

lint:
	ruff check .

fmt:
	ruff format .

type:
	mypy

web-install:
	cd web && npm install

web-dev:
	cd web && npm run dev

web-build:
	cd web && npm run build

check: lint type test web-e2e
	@echo "✅ all checks passed"

web-e2e:
	cd web && npm run test:e2e

web-e2e-ui:
	cd web && npm run test:e2e:ui
