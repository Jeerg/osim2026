#!/usr/bin/env bash
#
# wait-healthy.sh — blockiert, bis alle docker-compose-Services healthy sind.
#
# Usage:
#   bash scripts/wait-healthy.sh           # 60s default timeout
#   bash scripts/wait-healthy.sh 90        # 90s timeout
#
# Exit codes:
#   0  alle Services healthy
#   1  Timeout abgelaufen (mit `docker compose ps`-Output zur Diagnose)
#
# Hinweis Windows: laeuft direkt in Git-Bash / WSL. CMD/PowerShell-Nutzer
# muessen explizit `bash scripts/wait-healthy.sh` aufrufen.

set -euo pipefail

TIMEOUT="${1:-60}"
START=$SECONDS

echo "Warte bis zu ${TIMEOUT}s auf docker-compose-Services..."

while [[ $((SECONDS - START)) -lt $TIMEOUT ]]; do
    # `docker compose ps` mit JSON-Format gibt eine Zeile pro Service.
    # `.Health` ist "healthy" / "unhealthy" / "starting" / "" (kein
    # Healthcheck konfiguriert). Wir wollen, dass alle Services
    # entweder "healthy" sind ODER keinen Healthcheck haben.
    UNHEALTHY=$(docker compose ps --format json 2>/dev/null \
        | (command -v jq >/dev/null && jq -r 'select(.Health != "healthy" and .Health != "") | .Name' \
           || grep -oE '"Health":"[^"]+"' | grep -v '"Health":"healthy"' | grep -v '"Health":""') \
        | wc -l)

    if [[ "$UNHEALTHY" -eq 0 ]]; then
        ELAPSED=$((SECONDS - START))
        echo "Alle Services healthy nach ${ELAPSED}s."
        docker compose ps
        exit 0
    fi

    sleep 2
done

echo "TIMEOUT nach ${TIMEOUT}s — Services NICHT alle healthy:"
docker compose ps
exit 1
