.PHONY: install run test lint type fmt

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
