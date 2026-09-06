.PHONY: install run test lint type fmt web-install web-dev web-build

install:
	python3 -m pip install -e '.[dev]'

run:
	uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

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
