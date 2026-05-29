#!/usr/bin/env bash
#
# dev-up.sh — kanonisches Start-Skript fuer den osim-ui Dev-Stack.
#
# Faehrt den kompletten Stack hoch (postgres + firebase-emulator + minio +
# api + portal), wartet bis alle Services healthy sind und seedet den
# Firebase-Auth-Emulator (Default-User jwfischer69@gmail.com / 123456).
#
# IMMER dieses Skript zum Hochfahren verwenden (User-Direktive 2026-05-29).
#
# Usage:
#   bash scripts/dev-up.sh                 # up + wait + firebase-seed
#   bash scripts/dev-up.sh --build         # erzwingt Image-Rebuild (nach Code-Aenderung an api/portal)
#   bash scripts/dev-up.sh --seed-models   # zusaetzlich Demo-Modelle in admin@osim-dev laden
#   bash scripts/dev-up.sh --timeout 240   # Health-Timeout hochsetzen (Default 180s)
#
# Exit codes:
#   0  Stack oben + healthy + geseedet
#   1  Health-Timeout oder Seed-Fehler (mit Diagnose-Output)
#
# Windows: in Git-Bash / WSL laufen lassen, oder via Claude Bash-Tool.

set -euo pipefail

# --- Skript-Verzeichnis aufloesen, dann in den osim-ui-Root wechseln ---------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

# --- Argumente ---------------------------------------------------------------
DO_BUILD=0
DO_SEED_MODELS=0
TIMEOUT=180

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build)        DO_BUILD=1; shift ;;
    --seed-models)  DO_SEED_MODELS=1; shift ;;
    --timeout)      TIMEOUT="$2"; shift 2 ;;
    *) echo "Unbekanntes Argument: $1" >&2; exit 1 ;;
  esac
done

echo "=============================================="
echo " osim-ui Dev-Stack hochfahren"
echo " Root: ${ROOT_DIR}"
echo "=============================================="

# --- 1. Docker-Daemon erreichbar? -------------------------------------------
if ! docker info >/dev/null 2>&1; then
  echo "FEHLER: Docker-Daemon nicht erreichbar. Docker Desktop starten." >&2
  exit 1
fi

# --- 2. Stack hochfahren + auf Health warten ---------------------------------
# `--wait` blockiert, bis alle Services mit Healthcheck "healthy" sind (oder der
# Timeout greift). Robuster als die externe wait-healthy.sh-Pipeline, die unter
# `set -euo pipefail` faelschlich mit Exit 1 endet, sobald nichts mehr unhealthy
# ist (grep ohne Treffer -> Exit 1).
BUILD_FLAG=""
if [[ "${DO_BUILD}" -eq 1 ]]; then
  BUILD_FLAG="--build"
  echo "[1/3] docker compose up -d --build --wait (Timeout ${TIMEOUT}s)..."
else
  echo "[1/3] docker compose up -d --wait (Timeout ${TIMEOUT}s; firebase-emulator zieht beim 1. Start firebase-tools per npm)..."
fi

if ! docker compose up -d ${BUILD_FLAG} --wait --wait-timeout "${TIMEOUT}"; then
  echo "FEHLER: Nicht alle Services wurden healthy. Status:" >&2
  docker compose ps
  exit 1
fi
echo "[2/3] Alle Services healthy."

# --- 3. Firebase-Auth-Emulator seeden ---------------------------------------
# Seed laeuft IM api-Container: der hat httpx + firebase_admin installiert und
# erreicht den Emulator container-intern unter firebase-emulator:9099 (Env ist
# im compose gesetzt). Der Host-uv-Env ist nach der Monorepo-Migration kaputt
# (editable-Engine-Pfad zeigt auf osim-engine/osim-engine/engine) und daher
# bewusst NICHT der Seed-Pfad.
echo "[3/3] Seede Firebase-Auth-Emulator (Default-User jwfischer69@gmail.com / 123456)..."
docker compose exec -T api python - < scripts/seed_firebase_emulator.py

# --- Optional: Demo-Modelle laden -------------------------------------------
if [[ "${DO_SEED_MODELS}" -eq 1 ]]; then
  echo "Seede Demo-Modelle (admin@osim-dev)..."
  bash scripts/seed_demo_models.sh
fi

echo ""
echo "=============================================="
echo " STACK OBEN"
echo "=============================================="
docker compose ps
echo ""
echo " Portal:    http://localhost:3002"
echo " API:       http://localhost:8000  (Health: /health)"
echo " Login:     jwfischer69@gmail.com / 123456"
echo "=============================================="
