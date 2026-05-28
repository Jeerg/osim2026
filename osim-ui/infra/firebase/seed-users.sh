#!/usr/bin/env bash
#
# Convenience-Wrapper: seedet den Firebase-Emulator vom infra/firebase/-
# Verzeichnis aus. Eigentliche Logik in scripts/seed_firebase_emulator.py.

set -euo pipefail

cd "$(dirname "$0")/../.."
exec uv run python scripts/seed_firebase_emulator.py
