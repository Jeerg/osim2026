# Multi-Stage Build für das osim-ui Backend (FastAPI + uv + osim-engine editable).
#
# Build-Context-Konvention (WICHTIG):
#   Damit das Image die Engine als editable-install bekommt, MUSS der Build mit
#   `context: ..` ausgeführt werden — dem parent-Verzeichnis von osim-ui. Seit der
#   Monorepo-Migration (2026-05-28) ist das die Repo-Wurzel
#   `C:\Users\JörgWFischer\PycharmProjects\osim-engine\`. Von dort liegt
#   `engine/` neben `osim-ui/`.
#
#   docker-compose nutzt:
#       build:
#         context: ..
#         dockerfile: osim-ui/Dockerfile
#
#   Lokaler Standalone-Build (zum Debuggen):
#       docker build -t osim-ui-api:latest -f osim-ui/Dockerfile ..
#
# Pattern: 1:1 aus tbx_stzrim/Dockerfile (Stage-Trennung builder + runtime),
# erweitert um den Engine-Layer und um den copy-aus-parent-Trick.

# ---------- Stage 1: Builder ----------
FROM python:3.13-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

# Build-Toolchain für native Wheels (z. B. orjson, psycopg-binary baut zwar
# wheels, aber pyproject-toml-Plugins brauchen ggf. gcc). Im Runtime-Image
# entfällt das wieder.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

# Engine zuerst kopieren, damit der editable-install (pyproject.toml verweist
# via [tool.uv.sources] osim-engine = { path = "../osim-engine/engine" }) das
# Source-Tree findet. Build-Context ist `..` = Repo-Wurzel (siehe Header). Die
# Engine-Quelle liegt dort unter `engine/`; im Image bleibt sie unter
# `/workspace/osim-engine/engine`, damit die venv-/pyproject-Pfade matchen.
WORKDIR /workspace
COPY engine /workspace/osim-engine/engine

WORKDIR /workspace/osim-ui
# pyproject.toml referenziert README.md im Project-Block — also mit kopieren,
# sonst failt hatchling beim Lesen der Metadaten. uv.lock optional (Glob mit *).
COPY osim-ui/pyproject.toml osim-ui/README.md ./
COPY osim-ui/uv.lock* ./

# `app/` ist das hatchling-target (siehe pyproject.toml
# `[tool.hatch.build.targets.wheel] packages = ["app"]`). Muss vor `uv sync`
# vorhanden sein, weil uv das Projekt selbst (editable) installiert.
COPY osim-ui/app /workspace/osim-ui/app

# uv sync — wenn uv.lock vorhanden, --frozen; sonst (lokaler Dev-Build) ohne.
# --no-dev: Test-/Lint-Tools nicht ins Runtime-Image.
RUN uv sync --no-dev --frozen 2>/dev/null || uv sync --no-dev

# ---------- Stage 2: Runtime ----------
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# venv aus dem Builder übernehmen.
COPY --from=builder /workspace/osim-ui/.venv /app/.venv

# Engine ebenfalls ins Runtime-Image kopieren — editable-installs verweisen
# auf den Source-Pfad, also muss der Pfad zur Laufzeit existieren. Wir legen
# die Engine unter /workspace/osim-engine/engine ab (gleiche Struktur wie
# zur Build-Zeit), damit die venv-Pfade matchen.
COPY --from=builder /workspace/osim-engine/engine /workspace/osim-engine/engine

# Applikations-Code (relativ zum Build-Context = parent-Verzeichnis).
COPY osim-ui/app /app/app
COPY osim-ui/db /app/db
COPY osim-ui/pyproject.toml /app/pyproject.toml

EXPOSE 8080

# Health-Probe (3fls-Pattern: urllib statt curl, weil curl nicht im slim-Image).
HEALTHCHECK --interval=10s --timeout=5s --retries=10 --start-period=30s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health').read()" || exit 1

# `python -m uvicorn` statt `uvicorn`, weil der venv-Shebang noch auf den
# Builder-Pfad `/workspace/osim-ui/.venv/bin/python` zeigt (uv stellt das
# beim Stage-Copy nicht relativ um). Der `python`-Symlink in /app/.venv/bin
# zeigt korrekt auf /usr/local/bin/python3.
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
