# Multi-Stage Build für API + Worker (gleicher Image, andere CMD)
# Analog zum 3fls-Pattern (tbx_stzrim/Dockerfile)

# ---------- Stage 1: Builder ----------
FROM python:3.13-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

WORKDIR /build
COPY pyproject.toml ./
# uv.lock ist erst nach erstem `uv sync` vorhanden — Build dann mit Lock optimieren
COPY uv.lock* ./

# Engine wird im finalen Image über editable-install verlinkt (siehe README);
# in Cloud-Build wird sie als Layer kopiert (siehe cloudbuild-api.yaml, später).
RUN uv sync --no-dev --frozen 2>/dev/null || uv sync --no-dev

# ---------- Stage 2: Runtime ----------
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

COPY --from=builder /build/.venv /app/.venv
COPY app /app/app
COPY db /app/db

EXPOSE 8080

# Standard: API. Worker-Image überschreibt CMD.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
