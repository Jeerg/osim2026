# Phase 2 — Sim-Lauf + Trace + Status-Polling

**Milestone:** v0.1.0
**Stand:** 2026-05-21 (Entwurf, vor Discussion-Phase)
**Aufwand-Schätzung:** 1.5–2 Wochen (1 Dev)
**Depends on:** Phase 1 (OViewer-Framework, Backend-Foundation, Multi-Tenancy, OTX-Persistenz)

---

## 1. Ziel der Phase

Ein angemeldeter User kann ein in Phase 1 modelliertes Modell aus dem Browser heraus **simulieren**, den Lauf-Status verfolgen (Polling) und die fertige **JSONL-Trace herunterladen**. Alles lokal mit `docker compose up`. Live-Visualisierung kommt erst in Phase 4 (Live-Viz + GraphObject-Vollausbau).

---

## 2. Akzeptanzkriterien

1. ✅ User klickt im Modell-Viewer (Phase 1) auf "Sim starten" → Konfigurations-Dialog (Seed, Start-/End-Datum, Perioden-Länge).
2. ✅ Submit erzeugt `runs`-Row mit `status='queued'`; Worker-Subprocess wird gestartet.
3. ✅ UI zeigt Status-Übergang `queued → running → succeeded|failed` via 2-Sekunden-Polling.
4. ✅ Nach Erfolg: Summary-Panel (Dauer, abgeschlossene Pläne, Counter) + Button "Trace herunterladen" (Signed URL).
5. ✅ Cancel-Button bricht laufenden Worker sauber ab (`runs.status='cancelled'`).
6. ✅ Worker-Isolation: EIN Worker = EIN OS-Prozess = EIN `s_verteil`-Singleton — strikt, keine Threads.
7. ✅ Per-Run Hard-Timeout (Default 10 min, konfigurierbar) markiert hängende Läufe als `failed`.
8. ✅ Identischer Seed + identisches Modell ⇒ bit-identische Trace (Reproduzierbarkeitsvertrag).
9. ✅ Modell-Ladequelle: das in Phase 1 versionierte OTX aus Storage (Original-Upload oder letzter Save-back).
10. ✅ Pytest: Submit→Polling→Trace-Download für `Dummy.otx` grün.

---

## 3. Architektur-Recap

- **Orchestrator (in-API Service):** `submit(model_id, config) -> run_id`, intern `multiprocessing.Pool` mit konfigurierbarer Worker-Anzahl (Default 4). Pool im Lifespan-Hook, nicht modul-global (Uvicorn-Reload-Sicherheit).
- **Worker:** CLI-Entrypoint `python -m app.worker.run_sim --model-uri <storage> --seed N --start <ISO> --end <ISO> --period-len <int> --out-uri <storage>`. Lädt OTX über Storage-Abstraktion, baut `PSimulator`, ruft `.start()`, schreibt JSONL nach Storage.
- **Storage:** identisch zu Phase 1 (Storage-Abstraktion mit Local-FS-Backend für Dev, GCS-Skelett für später).
- **DB:** Phase-1-Schema wird erweitert um `runs` und `run_artifacts` (Migration `002_runs.py`).

---

## 4. Task-Wellen (parallelisierbar)

### Welle 1 — DB + Worker-Skeleton (2 Tage)
| ID | Task | Deps |
|---|---|---|
| 1.1 | Alembic-Migration `002_runs.py`: `runs(id, model_id, config JSONB, status, started_at, ended_at, owner_user_id, summary JSONB)` + `run_artifacts(run_id, kind, uri, bytes, created_at)` | Phase-1-DB |
| 1.2 | SQLAlchemy-Modelle `app/models/run.py`, `app/models/run_artifact.py` | 1.1 |
| 1.3 | `app/worker/run_sim.py` CLI-Entry mit argparse (`--model-uri`, `--seed`, `--start`, `--end`, `--period-len`, `--out-uri`) | Phase-1-Storage |
| 1.4 | Pytest: Worker-CLI lädt `Dummy.otx`, simuliert minimal, schreibt Trace-Datei | 1.3 |

### Welle 2 — Orchestrator + API (2 Tage)
| ID | Task | Deps |
|---|---|---|
| 2.1 | `app/services/orchestrator.py`: `submit(model_id, config) -> run_id` mit `multiprocessing.Pool` im Lifespan-Hook | 1.3 |
| 2.2 | Cancel-Pfad: Process-Group-Kill + DB-Update `status='cancelled'` | 2.1 |
| 2.3 | Timeout-Handling: Watchdog-Coroutine markiert hängende Runs als `failed` | 2.1 |
| 2.4 | `POST /api/v1/runs` mit Pydantic-Body `{model_id, seed, start, end, period_len}` | 2.1 |
| 2.5 | `GET /api/v1/runs/{id}` Status + Summary | 1.2 |
| 2.6 | `GET /api/v1/runs` Liste pro Tenant | 1.2 |
| 2.7 | `POST /api/v1/runs/{id}/cancel` | 2.2 |
| 2.8 | `GET /api/v1/runs/{id}/trace` → Signed URL (Storage-Abstraktion) | 1.2 |

### Welle 3 — Frontend Sim-Flow (3 Tage)
| ID | Task | Deps |
|---|---|---|
| 3.1 | Sim-Konfig-Dialog `<SimConfigDialog />` (Seed, Start-/End-Datum, Period-Len) im PSimulatorViewer integriert | Phase-1-Viewer |
| 3.2 | TanStack-Query-Mutation `useStartRun()` | 2.4 |
| 3.3 | Route `/runs/{id}` mit 2-s-Polling via `useRunStatus()` | 2.5 |
| 3.4 | Status-Indikator + Summary-Panel + Trace-Download-Button | 2.8 |
| 3.5 | Cancel-Button mit Confirm-Dialog | 2.7 |
| 3.6 | Route `/runs` Historie pro Tenant | 2.6 |

### Welle 4 — Verifikation (1–2 Tage)
| ID | Task | Deps |
|---|---|---|
| 4.1 | Playwright-E2E: Modell aus Phase 1 laden → Sim starten → bis "succeeded" warten → Trace downloaden | 3.4 |
| 4.2 | Reproduzierbarkeits-Test: zweimal mit identischem Seed → Traces bit-identisch | 4.1 |
| 4.3 | Stress-Test mit `Fertigungsstruktur1_mit_AslFj.otx` (272 KB Modell) | 4.1 |
| 4.4 | Ruff + mypy clean | alle |
| 4.5 | `docs/PHASE-2-SIM-LAUF.md` mit Screenshot des Flows | alle |

---

## 5. Risiken & Unknowns

| Risiko | Mitigation |
|---|---|
| `multiprocessing.Pool` macht Probleme im Reload-Mode von Uvicorn | Pool im Lifespan-Hook initialisieren, nicht modul-global |
| Engine-Run-Time bei großen Modellen sprengt Worker-Timeout | Default-Timeout 10 min, konfigurierbar; Größenlimit für Modell-Upload (30 MB) in Phase 1 |
| Bit-Reproduzierbarkeit bricht durch unbeabsichtigte Side-Effects | PAWLICEK-LCG-Singleton-Vertrag strikt: Worker-Prozess ist Single-Use; nach Run beenden, nie wiederverwenden |
| Cancel verlässt Zombie-Prozesse | Process-Group-Kill (`os.killpg`) + Cleanup-Watchdog |
| Polling-Last bei vielen Tabs | Polling-Interval konfigurierbar; WebSocket-Upgrade als Backlog-Idee für Phase 4 |

---

## 6. Was Phase 2 NICHT liefert

- Live-Visualisierung des Sim-Laufs (Knoten färben sich live) → Phase 4
- WebSocket-Streaming → Phase 4
- Multi-Run-Aggregation (mehrere Seeds parallel) → Phase 5 (Cloud Parallel)
- Reports / PDF-Export → Phase 6
- JSON-Modell-Editor → Phase 3

---

## 7. Definition-of-Done

1. Alle 10 Akzeptanzkriterien grün
2. Playwright-E2E grün
3. Reproduzierbarkeits-Test grün (Akzeptanzkriterium 8)
4. `uv run pytest` grün, `uv run ruff check .` clean
5. `docs/PHASE-2-SIM-LAUF.md` enthält Flow-Screenshots

---

## 8. Diskuss-Punkte für `/gsd-discuss-phase`

1. **Cancel-Granularität:** sofortiger Kill vs. graceful Shutdown (Engine-API muss Stop-Hook anbieten)?
2. **Default-Timeout:** 10 min für lokal — passt das für Beratungskunden mit großen Modellen, oder konfigurierbar pro Modell-Klasse?
3. **Trace-Größe:** bei großen Sims kann JSONL-Trace mehrere GB werden — Streaming-Download oder Chunked?
4. **Run-Auto-Cleanup:** abgelaufene Runs/Artefakte nach X Tagen automatisch löschen, oder manuelle Cleanup-UI?
5. **Status-Polling-Replacement:** schon hier WebSocket einbauen oder bewusst auf Phase 4 verschieben?
