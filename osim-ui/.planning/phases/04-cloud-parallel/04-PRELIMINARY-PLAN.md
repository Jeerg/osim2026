# Phase 4 — Parallel-Runs + Cloud-Deployment (eigenes GCP-Projekt)

**Milestone:** v0.1.0  
**Stand:** 2026-05-20 (Entwurf, vor Discussion-Phase)  
**Aufwand-Schätzung:** 2–3 Wochen (1 Dev) inkl. Infra-Aufbau

---

## 1. Ziel der Phase

Aus dem Single-Host-MVP (Phasen 1–3) wird eine **horizontal skalierbare Cloud-Anwendung** mit:
1. Eigenes GCP-Projekt für osim-ui (getrennt von 3fls — Entscheidung 2026-05-20)
2. Worker als **Cloud Run Jobs**, gestartet aus Cloud Tasks
3. Live-Events via **Pub/Sub** (statt In-Process-Queue) — funktioniert über API-Replicas hinweg
4. **Multi-Run-Submit** (N Seeds parallel, Aggregations-Statistik)
5. Per-Tenant-**Quotas** und **Hard-Timeout** pro Run

---

## 2. Architektur-Entscheidung (festgelegt 2026-05-20)

> **Eigenes GCP-Projekt.** Kein geteilter Tenant mit 3fls. Eigene Firebase-Konfig, eigene Cloud-Build-Pipelines, eigenes Logging/Monitoring.

Vorteile:
- Klare IAM-Trennung
- Unabhängiges Quota-Management
- Spätere Integration in 3fls bleibt eine bewusste Operation

Aufwand:
- Eigene Terraform-Module
- Eigene Service-Accounts, Secret-Manager-Einträge
- Eigene Logging-/Monitoring-Pipelines

---

## 3. Akzeptanzkriterien

1. ✅ GCP-Projekt `osim-ui-prod` (und `osim-ui-staging`) existiert mit IAM-Setup, Workload-Identity, Secret-Manager
2. ✅ Cloud Build deployt API auf Cloud Run, Worker als Cloud Run Job
3. ✅ User triggert Sim-Submit mit `repeats=10` → 10 unabhängige Worker-Jobs laufen parallel, Ergebnisse werden korrekt aggregiert
4. ✅ Live-Events einer beliebigen Worker-Instanz kommen über Pub/Sub an einer beliebigen API-Replica an und werden korrekt an den richtigen WebSocket-Client geroutet
5. ✅ Per-Tenant-Quota: max. N gleichzeitige Runs (konfigurierbar, Default 5)
6. ✅ Per-Run-Timeout: nach X Sekunden wird der Worker-Job gekillt, Run als `failed` markiert
7. ✅ Aggregations-Dashboard zeigt für Multi-Run: Mean/Median/Min/Max der wichtigsten KPIs über alle Seeds, mit Konfidenz-Indikator
8. ✅ Container-Image für Worker hat osim-engine + osim-ui-worker-Code, Größe < 500 MB
9. ✅ Cold-Start eines Worker-Jobs < 15 s
10. ✅ Stress-Test: 10 User × je 5 parallele Runs in < 60 min ohne Stau

---

## 4. Task-Wellen

### Welle 1 — GCP-Projekt-Setup (3 Tage)
| ID | Task | Deps |
|---|---|---|
| 1.1 | GCP-Projekte `osim-ui-staging` und `osim-ui-prod` anlegen, Billing | — |
| 1.2 | Firebase aktivieren (Auth + Hosting), App-Konfigs erstellen | 1.1 |
| 1.3 | APIs aktivieren: Cloud Run, Cloud Build, Cloud Tasks, Pub/Sub, GCS, Secret Manager, Cloud SQL | 1.1 |
| 1.4 | Service-Accounts: `osim-api-sa`, `osim-worker-sa`, `osim-build-sa` mit minimal-IAM | 1.3 |
| 1.5 | Secret Manager: DATABASE_URL, FIREBASE_ADMIN_KEY, PUBSUB_TOPIC etc. | 1.4 |
| 1.6 | Terraform-Skelett in `infra/terraform/` mit Modulen pro Service | 1.3 |
| 1.7 | Cloud SQL Postgres-Instance (klein, regional), Cloud SQL Proxy für lokales Dev | 1.3 |
| 1.8 | GCS-Bucket `osim-ui-{env}` mit Lifecycle-Rules (Trace-Files nach 90 Tagen verschieben in Coldline) | 1.3 |

### Welle 2 — Pub/Sub-basiertes Live-Streaming (3 Tage)
| ID | Task | Deps |
|---|---|---|
| 2.1 | Pub/Sub-Topic-Schema: `runs.{run_id}.events`, `runs.{run_id}.complete` | 1.3 |
| 2.2 | Worker: Sink-Implementation, die EventBus-Events nach Pub/Sub publisht (anstelle von In-Process-Queue) | 2.1 |
| 2.3 | API: Pub/Sub-Subscriber pro WebSocket-Client; Subscriber dynamisch aufsetzen bei WS-Connect | 2.1 |
| 2.4 | Backpressure-Handling: WS-Client langsam → Events ggf. samplen | 2.3 |
| 2.5 | Reconnect-Resync: bei WS-Reconnect die letzten N Events nachliefern (aus Pub/Sub Retention oder GCS) | 2.3 |

### Welle 3 — Worker als Cloud Run Job (3 Tage)
| ID | Task | Deps |
|---|---|---|
| 3.1 | Dockerfile.worker (eigenes Image oder gleiches mit anderem CMD) — enthält osim-engine | 1.3 |
| 3.2 | Cloud Run Job `osim-worker` Definition mit env-Vars und Secrets | 1.4, 3.1 |
| 3.3 | Worker liest Argumente aus Cloud Tasks Payload (model_uri, seed, periods, run_id) | 3.2 |
| 3.4 | Worker schreibt Trace nach GCS via `app/services/storage.py` (GCS-Backend) | 1.8 |
| 3.5 | Worker schickt Status-Updates ("running", "succeeded", "failed") über separates Pub/Sub-Topic an die API | 2.1 |
| 3.6 | Image-Size optimieren (slim Python, multi-stage, `.dockerignore`) | 3.1 |

### Welle 4 — Cloud-Tasks-Queue (2 Tage)
| ID | Task | Deps |
|---|---|---|
| 4.1 | Cloud Tasks Queue `osim-runs-{env}` mit Konkurrenz-Limit und Rate-Limit | 1.3 |
| 4.2 | `app/services/orchestrator.py` ablösen: `submit(...)` legt Task an statt lokalem Subprocess | 4.1, 3.2 |
| 4.3 | Task triggert Cloud Run Job via Service-Account-Identity | 3.2, 4.2 |
| 4.4 | Per-Tenant-Quota: vor Task-Enqueue prüfen, ob Tenant-Limit erreicht; bei Erreichen 429 zurück | 4.2 |
| 4.5 | Per-Run-Timeout: Cloud Run Job hat Max-Duration = WORKER_TIMEOUT_SECONDS | 3.2 |

### Welle 5 — Multi-Run (2 Tage)
| ID | Task | Deps |
|---|---|---|
| 5.1 | `POST /api/v1/runs` akzeptiert `repeats: int` (1..N) und ggf. `seed_strategy: 'sequential'|'random'` | 4.2 |
| 5.2 | Orchestrator enqueued N Cloud Tasks unter gemeinsamer `multi_run_id` | 5.1 |
| 5.3 | DB-Schema-Erweiterung: `runs.multi_run_id`, `runs.seed_index` | 5.2 |
| 5.4 | Aggregations-API `GET /api/v1/multi-runs/{id}` liefert Stats über alle Sub-Runs | 5.3 |
| 5.5 | Frontend: Multi-Run-Submit-Form + Aggregations-Dashboard mit Recharts (Histogramme, Mean+CI) | 5.4 |

### Welle 6 — Cloud Build Pipeline (2 Tage)
| ID | Task | Deps |
|---|---|---|
| 6.1 | `cloudbuild-api.yaml`: test → build → push → migrate → deploy auf Cloud Run | 1.6, 3.1 |
| 6.2 | `cloudbuild-worker.yaml`: test → build → push → deploy als Cloud Run Job | 1.6, 3.1 |
| 6.3 | `cloudbuild-portal.yaml`: build → deploy auf Firebase Hosting | 1.2 |
| 6.4 | Trigger: main-Branch → staging; tag `v*` → prod | 6.1, 6.2, 6.3 |
| 6.5 | Migration via Alembic in Cloud Build mit Cloud SQL Proxy | 1.7 |

### Welle 7 — Verifikation (2 Tage)
| ID | Task | Deps |
|---|---|---|
| 7.1 | Smoke-Test deployt auf staging: Submit + Live-View + Aggregation | alle |
| 7.2 | Stress-Test: 10 User × 5 Runs gleichzeitig | alle |
| 7.3 | Failure-Modes: Worker-OOM, Worker-Timeout, Pub/Sub-Backpressure — alle führen zu klarem User-Feedback | alle |
| 7.4 | Cost-Monitoring-Alert eingerichtet (Budget-Alert pro Projekt) | 1.1 |
| 7.5 | Doku in `docs/PHASE-4-CLOUD.md` + Runbook in `docs/RUNBOOK.md` | alle |

---

## 5. Risiken & Unknowns

| Risiko | Mitigation |
|---|---|
| GCP-Setup-Aufwand höher als geschätzt (insb. Workload-Identity, Cloud SQL Connectivity) | Terraform-Templates aus 3fls (`tbx_stzrim/infra`) als Vorlage; früh in Welle 1 deployen, nicht am Ende |
| Cold-Start von Cloud Run Job > 15 s sprengt UX | Min-Instances=1 für Worker bei hohem Volumen (Trade-off Kosten); Image-Optimization |
| Pub/Sub-Latency > 1 s bei Cold-Start des Subscribers | API verwendet langlebige Subscriber pro WS-Client; Pre-warm-Pattern |
| Multi-Run-Aggregation: was wenn 1 Sub-Run failt? | Aggregation läuft auch mit n-1 Runs, Failure wird im Dashboard markiert; User entscheidet ob Re-Run |
| Kostenkontrolle durch Quota: User-Frust bei niedrigen Limits | Konfigurierbar pro Tenant; im UI klare Anzeige "X/Y Quota verbraucht" |
| Reconnect-Resync via Pub/Sub Retention reicht nicht (Standard 7 d, aber Topic-Volume) | Bei langen Runs: Snapshot des Event-Streams alle 60 s nach GCS, daraus rekonstruieren |
| Worker-Image enthält osim-engine — Versions-Drift | Engine als pinned Dependency in pyproject.toml (mit version-tag oder commit-hash) |

---

## 6. Was Phase 4 NICHT liefert

- Multi-Region-Hochverfügbarkeit (→ Backlog)
- Auto-Scaling-Policies basierend auf Custom-Metriken (→ Backlog)
- Cost-Optimizations wie Spot-Instances/Preemptible (→ Backlog)
- Worker-Caching von Modellen (Re-Runs könnten schneller starten) — Backlog
- 3fls-Integration (→ Phase 6, eigene Phase)

---

## 7. Definition-of-Done

1. Alle 10 Akzeptanzkriterien grün
2. Cost-Monitoring aktiv, Alert konfiguriert
3. Runbook für häufige Failure-Modes
4. Staging vollständig funktional, Prod-Setup bereit
5. `docs/PHASE-4-CLOUD.md` enthält System-Diagramm + Deploy-Workflow

---

## 8. Diskuss-Punkte für `/gsd-discuss-phase`

1. **GCP-Region:** europe-west3 (Frankfurt) für Datenschutz oder europe-west1 (Belgien) für günstiger?
2. **Cloud SQL vs. Cloud SQL für PostgreSQL Enterprise Plus?** Letzteres hat Multi-AZ-HA built-in. Erst Standard, später Upgrade.
3. **Worker-Image-Strategy:** osim-engine als pip-Dependency vs. als Git-Submodule eingebunden?
4. **Pub/Sub-Quotas vs. Cloud Tasks-Quotas:** wenn 10000 Events pro Run, ist Pub/Sub kostenpflichtig — Sampling sinnvoll?
5. **Backup/Restore-Strategie:** PIT-Recovery von Cloud SQL? Wie weit zurück?
6. **Monitoring-Stack:** Cloud Monitoring Stock oder Grafana Cloud zusätzlich?
