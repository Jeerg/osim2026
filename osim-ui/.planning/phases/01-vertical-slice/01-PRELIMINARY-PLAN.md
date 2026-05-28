# Phase 1 — Vertikale MVP-Slice  ⚠️ DEPRECATED

> **Diese Datei beschreibt den ALTEN Phase-1-Scope ("Login → Upload → Sim → Trace") und ist nach dem Reframe vom 2026-05-21 nicht mehr maßgeblich.**
>
> **Aktuelle Quelle der Wahrheit für Phase 1:** [`01-CONTEXT.md`](./01-CONTEXT.md) — OViewer-Framework + OTX-im-Browser-Modellierung.
>
> Der Sim-Lauf, der hier beschrieben ist, wurde zur neuen [Phase 2](../02-sim-lauf/02-PRELIMINARY-PLAN.md) verschoben. Diese Datei bleibt als Historie / Audit-Trail erhalten.

**Milestone:** v0.1.0
**Stand:** 2026-05-20 (DEPRECATED 2026-05-21)
**Aufwand-Schätzung:** 2–3 Wochen (1 Dev) — bezieht sich auf den abgelösten Scope

---

## 1. Ziel der Phase

Ein angemeldeter User durchläuft End-to-End:
**Login** → **`.otx`-Upload** → **Sim-Konfiguration (Seed, Perioden)** → **Sim-Start** → **Status-Polling** → **JSONL-Trace-Download**.

Alles lokal mit `docker compose up`. Cloud-Deployment ist NOCH NICHT in Phase 1.

---

## 2. Akzeptanzkriterien (verbindlich)

1. ✅ `docker compose up` startet alle Dev-Services (Postgres, Firebase-Emulator, Minio, optional API+Portal).
2. ✅ User kann sich mit E-Mail-Pass via Firebase-Emulator registrieren und einloggen.
3. ✅ Eingeloggter User sieht eine leere Modell-Liste.
4. ✅ User kann `Vorstellung04/Dummy.otx` hochladen → erscheint in Liste mit Coverage-Report (geladen/skipped/unsupported).
5. ✅ User kann ein Modell auswählen → Sim-Konfig-Form (Seed, Perioden) → "Start" klicken.
6. ✅ UI zeigt Status "queued" → "running" → "succeeded" via 2-Sekunden-Polling.
7. ✅ Nach Abschluss: Summary (Counter, Dauer) wird angezeigt + Button "Trace herunterladen" funktioniert (Signed URL).
8. ✅ Smoke-Test (Playwright) durchläuft den ganzen Flow.
9. ✅ Unit-Tests für Orchestrator-Service (`uv run pytest`) sind grün.
10. ✅ Multi-Tenant-Schemas sind angelegt; alle Queries laufen im richtigen Schema.

---

## 3. Architektur-Recap (siehe `docs/ARCHITECTURE.md`)

- **Frontend:** React 19 + TanStack Router + TanStack Query, Firebase Auth Client, einfaches CSS (kein Live-Chart in Phase 1)
- **Backend:** FastAPI, TenantAuthMiddleware, SQLAlchemy 2 async, Alembic
- **Orchestrator:** in-Process `multiprocessing.Pool` mit max. 4 Workern (Phase-1-Kompromiss)
- **Worker:** Subprocess-Aufruf von `python -m app.worker run --model ... --seed ... --out ...`
- **Storage:** Minio (lokal) als GCS-Stand-in
- **DB:** Postgres 17, Schema-per-Tenant (auch wenn nur ein Default-Tenant in Phase 1)

---

## 4. Task-Wellen (parallelisierbar)

### Welle 0 — Vorarbeit (1 Tag)
| ID | Task | Owner | Deps |
|---|---|---|---|
| 0.1 | `uv sync` läuft, Engine als editable-install verlinkt | dev | — |
| 0.2 | `docker compose up postgres firebase-emulator minio` erreichbar | dev | — |
| 0.3 | Health-Endpoint (`/health`) auf API via `uv run uvicorn app.main:app` erreichbar | dev | — |

### Welle 1 — Backend-Grundgerüst (3 Tage)
| ID | Task | Owner | Deps |
|---|---|---|---|
| 1.1 | `app/core/config.py` mit pydantic-settings (DATABASE_URL, FIREBASE_*, STORAGE_*) | dev | 0.1 |
| 1.2 | `app/core/database.py` mit async SQLAlchemy-Engine + `get_db`-Dependency + `set search_path` | dev | 1.1 |
| 1.3 | `app/auth/firebase.py`: `initialize_firebase()`, `verify_token()` (1:1 aus 3fls) | dev | 1.1 |
| 1.4 | `app/auth/middleware.py`: `TenantAuthMiddleware` (1:1 aus 3fls) mit Whitelist `/health`, `/docs` | dev | 1.3 |
| 1.5 | Alembic initialisieren + erste Migration: `tenants`, `users`, `models`, `runs`, `run_artifacts` | dev | 1.2 |
| 1.6 | `app/models/*.py` SQLAlchemy-Modelle für die fünf Tabellen | dev | 1.5 |
| 1.7 | `POST /api/v1/auth/me` Endpoint (User-/Tenant-Bootstrap nach Firebase-Login) | dev | 1.4, 1.6 |

### Welle 2 — Storage-Abstraktion (1 Tag)
| ID | Task | Owner | Deps |
|---|---|---|---|
| 2.1 | `app/services/storage.py`: einheitliche `put_object()`/`get_signed_url()`-API, Backend-Switch `local|gcs` via Config | dev | 1.1 |
| 2.2 | Lokales Filesystem-Backend (für Dev) | dev | 2.1 |
| 2.3 | GCS-Backend-Skelett (nur Init, nicht produktiv testen) | dev | 2.1 |

### Welle 3 — Modell-Upload (2 Tage)
| ID | Task | Owner | Deps |
|---|---|---|---|
| 3.1 | `app/services/model_service.py`: `parse_and_register_otx(file_bytes, user)` — ruft `load_otx_file()`, schreibt nach Storage, legt `models`-Row an | dev | 2.1, 1.6 |
| 3.2 | `POST /api/v1/models/upload-otx` (multipart) | dev | 3.1 |
| 3.3 | `GET /api/v1/models` (Liste pro Tenant) | dev | 3.1 |
| 3.4 | `GET /api/v1/models/{id}` (Detail + Vorschau) | dev | 3.1 |
| 3.5 | Pytest: Upload eines bekannten OTX-Files, Coverage > 0 | dev | 3.2 |

### Welle 4 — Sim-Orchestrator (3 Tage)
| ID | Task | Owner | Deps |
|---|---|---|---|
| 4.1 | `app/worker/run_sim.py`: CLI-Entrypoint `python -m app.worker.run_sim --model <uri> --seed N --periods K --out <uri>` | dev | 2.2 |
| 4.2 | `app/services/orchestrator.py`: `submit(model_id, config) -> run_id`, intern `multiprocessing.Pool` | dev | 4.1, 1.6 |
| 4.3 | `POST /api/v1/runs` mit `{model_id, seed, periods}` | dev | 4.2 |
| 4.4 | `GET /api/v1/runs/{id}` Status + Summary | dev | 4.2 |
| 4.5 | `GET /api/v1/runs/{id}/trace` → Signed URL für JSONL | dev | 2.1, 4.2 |
| 4.6 | Per-Run Timeout-Handling (Default 10 min) | dev | 4.2 |
| 4.7 | Pytest: Submit + Polling bis "succeeded" für Minimal-Modell | dev | 4.3 |

### Welle 5 — Frontend-Grundgerüst (2 Tage)
| ID | Task | Owner | Deps |
|---|---|---|---|
| 5.1 | `npm install` + Vite-Dev-Server zeigt App-Skelett | dev | — |
| 5.2 | `portal/src/auth/*` aus 3fls 1:1 copy-paste, Env-Config | dev | 5.1 |
| 5.3 | `portal/src/api/fetch.ts` (apiFetch mit JWT) aus 3fls | dev | 5.2 |
| 5.4 | Login-Page + Auth-Provider, Redirect bei !auth | dev | 5.2 |
| 5.5 | TanStack-Router `__root.tsx` + `_authenticated.tsx`-Wrapper | dev | 5.4 |

### Welle 6 — Frontend-Flow (3 Tage)
| ID | Task | Owner | Deps |
|---|---|---|---|
| 6.1 | `/models` Liste (TanStack-Query gegen `GET /models`) | dev | 5.5, 3.3 |
| 6.2 | `/models/upload` Drag-and-Drop für `.otx` | dev | 6.1, 3.2 |
| 6.3 | `/models/{id}` Modell-Detail + Sim-Config-Form | dev | 6.1, 3.4 |
| 6.4 | Sim-Start-Button → `POST /runs` → Redirect auf `/runs/{id}` | dev | 6.3, 4.3 |
| 6.5 | `/runs/{id}` Status-Polling (2 s) + Summary + Download-Button | dev | 6.4, 4.4, 4.5 |
| 6.6 | `/runs` Historie | dev | 4.4 |

### Welle 7 — Verifikation (1–2 Tage)
| ID | Task | Owner | Deps |
|---|---|---|---|
| 7.1 | Playwright-E2E: Register → Login → Upload Dummy.otx → Start → Wait → Download | dev | 6.5 |
| 7.2 | Manueller Test mit `Fertigungsstruktur1_mit_AslFj.otx` (größeres Modell) | dev | 7.1 |
| 7.3 | Ruff + mypy clean | dev | alle |
| 7.4 | README ergänzen mit "How to run Phase 1" | dev | 7.2 |
| 7.5 | Demo-Video / Screenshot-Doku für `docs/PHASE-1-DEMO.md` | dev | 7.2 |

---

## 5. Risiken & Unknowns

| Risiko | Mitigation |
|---|---|
| `osim-engine` JSON-Loader-Skelett reicht nicht für eigene Modelle | Phase 1 nutzt **nur OTX-Upload**; JSON-Editor erst Phase 2 |
| Firebase-Emulator-Setup ist fummelig | docker-compose-Service vorgeben, Anleitung in README |
| Engine-Run-Time bei großen Modellen sprengt Worker-Timeout | Default-Timeout 10 min, konfigurierbar; Größenlimit für Upload (30 MB) |
| TenantAuthMiddleware aus 3fls macht Annahmen, die nicht passen | 1:1 erst, dann minimal anpassen; Tests katchten Diff |
| `multiprocessing.Pool` macht Probleme im Reload-Mode von Uvicorn | Pool im Lifespan-Hook initialisieren, nicht modul-global |
| Engine ist nicht installierbar (kein pyproject-Setup mit `src/`-Layout für editable) | Verifiziert: pyproject.toml mit `[tool.hatch.build.targets.wheel] packages = ["src/osim_engine"]` → `pip install -e ../osim-engine` sollte funktionieren |
| Latein-1-Encoding der OTX-Dateien führt zu Upload-Problemen via multipart | OTX wird als bytes hochgeladen, Parser kümmert sich um Encoding |
| Signed-URL-Pattern für Minio anders als GCS | Storage-Abstraktion (Task 2.1) maskiert das |

---

## 6. Was Phase 1 NICHT liefert

- WebSocket-Streaming → Phase 3
- Live-Charts → Phase 3
- Parallel-Runs (N Seeds) → Phase 4
- Cloud-Deploy → Phase 4
- JSON-Modell-Editor → Phase 2
- Reports/PDF → Phase 5
- 3fls-Integration → Phase 6

---

## 7. Definition-of-Done

Phase 1 ist DONE, wenn:
1. Alle 10 Akzeptanzkriterien grün
2. Playwright-E2E grün in CI (oder lokal mit `npx playwright test`)
3. `uv run pytest` grün (Coverage > 50 %)
4. `uv run ruff check .` clean
5. README "Quickstart" funktioniert auf einer frischen Maschine
6. `docs/PHASE-1-DEMO.md` enthält Screenshots oder Recording

---

## 8. Nächste Schritte für die Discuss-Phase

Vor dem Execute-Start sollte `/gsd-discuss-phase` folgende Punkte mit Jörg klären:

1. **JSON-Modell-Format vorziehen?** Falls JSON-Editor in Phase 1 nötig wäre, müsste die Engine-API parallel ausgebaut werden — Aufwand verdoppelt sich.
2. **Multi-Tenant-Schema von Anfang an oder erst später?** Hier: ja, von Anfang an (Empfehlung), da später teurer.
3. **Storage in Phase 1: Minio reicht?** Oder direkt GCS gegen ein Dev-Projekt?
4. **Firebase-Emulator oder echtes Firebase-Dev-Projekt?** Emulator ist offline-fähig, aber weicht in Custom-Claims-Handling minimal ab.
5. **Demo-Modell:** `Vorstellung04/Dummy.otx` als Smoke-Test-Fixture im Repo committen oder per Skript holen?
6. **Authoring-Flow neuer User:** Per Cloud Function nach Firebase-Trigger oder lazy beim ersten `/auth/me`-Call?
