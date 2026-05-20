# MORGEN-BRIEFING — osim-ui

**Datum:** 2026-05-21 (für Sie zum Aufwachen)  
**Vorlauf:** Nacht-Session am 2026-05-20, in zwei Wellen (5-Min-Frühschicht, dann 5-Min-Spätschicht mit Phasen-2–6-Vertiefung)

---

## 0. TL;DR

In der Nacht ist ein vollständiges Projekt-Setup **inklusive aller sechs Phasen** entstanden:
- Drei verwandte Codebasen (osim-engine, OSim2004, tbx_stzrim) parallel exploriert
- Engine-API verifiziert (echte Modul-Pfade gegen Code geprüft)
- `GraphObj.h` (1997 ff., 2914 Zeilen) als Foundation-Konzept aufgenommen — laut Ihrer Anweisung Basis für ALLE graphischen Viewer
- **Sechs detaillierte PLAN.mds** für Phasen 1 bis 6 — jede mit Wellen, Tasks, Akzeptanzkriterien, Risiken, Diskuss-Punkten
- Architektur + Roadmap mit allen 10 verbindlichen Entscheidungen
- Repo-Skeleton anlegungsbereit (FastAPI + React + Postgres + Docker-Compose)
- 4 Memory-Notizen + 1 Memory zur Autoren-Attribution + 1 Memory zur GraphObject-Foundation

**Empfohlener nächster Befehl:** `/gsd-discuss-phase phase-1-vertical-slice` — die 6 Phase-1-Diskuss-Punkte mit Ihnen durchgehen.

Falls Sie LIEBER ALLE PHASEN auf einmal in der Discuss-Tiefe ansehen wollen: `/gsd-progress --next` listet alle Phasen-Diskuss-Punkte zusammen (5+5+9+6+6+6 = 37 offene Punkte).

---

## 1. Was in der Nacht entstanden ist

### Forschung (.planning/research/)
| Datei | Inhalt |
|---|---|
| `osim-engine-api.md` | Engine-API-Referenz, gegen Code verifiziert (PSimulator, EventBus, load_otx_file, LCG-Singleton, …) |
| `osim2004-ui-analysis.md` | UI-Konzept des Originals: 3 Perspektiven (Prozess/Ressource/Material), Menüs, Workflows, Reports, 48+ Viewer-Klassen |
| `3fls-patterns.md` | Stack-Cookbook: React 19 + Vite + TanStack + Tailwind + FastAPI + SQLAlchemy + Firebase + GCS |
| `copy-paste-guide.md` | Konkrete Dateien aus tbx_stzrim, die 1:1 übernommen werden können |
| `SUMMARY.md`, `README.md`, `architecture-decisions.md` | Bonus-Artefakte vom Pattern-Agent |

### Planung
| Datei | Inhalt |
|---|---|
| `.planning/PROJECT.md` | Vision, Zielgruppen, sechs Architektur-Eckpfeiler, Erfolgskriterien |
| `.planning/ROADMAP.md` | 6 Phasen mit Querschnitts-Foundations (GraphObject, Reflection-Schema, 3fls-Konformität) |
| `.planning/milestones/v0.1.0/phase-1-vertical-slice/PLAN.md` | Login → OTX-Upload → Run → Trace-Download |
| `.planning/milestones/v0.1.0/phase-2-json-editor/PLAN.md` | JSON-Schema via Engine-Reflection + Form-Editor — **6 Engine-Tasks als Voraussetzung** (E2.1–E2.6) |
| `.planning/milestones/v0.1.0/phase-3-live-viz/PLAN.md` | GraphObject-Schicht als Foundation, React-Flow-Adapter, WebSocket-Live-Channel, KPI-Dashboard — **inkl. konkreter TypeScript-Klassen-Skizze** |
| `.planning/milestones/v0.1.0/phase-4-cloud-parallel/PLAN.md` | Eigenes GCP-Projekt, Cloud Run Jobs, Cloud Tasks, Pub/Sub, Multi-Run-Aggregation |
| `.planning/milestones/v0.1.0/phase-5-reports/PLAN.md` | PDF (WeasyPrint/Playwright), Excel, CSV, JSON-Bundle, HKA- + Steinbeis-Templates |
| `.planning/milestones/v0.1.0/phase-6-3fls-iframe/PLAN.md` | Iframe-Embedding mit PostMessage-Bridge + On-Behalf-Token-Exchange |
| `docs/ARCHITECTURE.md` | Systemarchitektur mit allen drei Foundations, GCP-Trennung, Iframe-Mode |

### Skeleton (anlegungsbereit, noch nicht installiert)
- `pyproject.toml`, `app/` mit `main.py` (Health-Endpoint), `app/{api,auth,core,models,services,worker}/`
- `portal/` mit React 19 + Vite + TanStack + Tailwind-Stack
- `Dockerfile` (Multi-Stage), `docker-compose.yml` (Postgres + Firebase-Emulator + Minio)
- `.env.example`, `.gitignore`, `README.md`, `CLAUDE.md`
- 1 Smoke-Test in `tests/app/test_health.py`

### Memory (`~/.claude/projects/.../memory/`)
- `project-identity.md` — drei Codebasen, Rollen HKA + STZ-RIM
- `arch-decisions-2026-05-20.md` — sechs Phase-1-Leitplanken
- `arch-decisions-phases-2-6.md` — vier zusätzliche Festlegungen für Phasen 2-6
- `osim-domain-glossary.md` — PPS-Begriffe und Reproduzierbarkeitsvertrag
- `feedback-author-attribution.md` — J.W. Fischer als Autor des Originals (nur osim-ui-Scope)
- `graphobject-is-viewer-foundation.md` — GraphObject ist Basis ALLER graphischen Viewer

---

## 2. Zehn verbindliche Festlegungen aus Ihren Vor-Schlaf-Antworten

| # | Frage | Ihre Antwort |
|---|---|---|
| 1 | 3fls-Integration | Standalone, später integrieren |
| 2 | UI-Treue zum Original | Nur Datenmodell-/Konzept-treu, UI darf modern |
| 3 | Skalierung | Beides skaliert: viele User × viele Läufe |
| 4 | Live-Update | Live-Visualisierung wie Original (WebSocket) |
| 5 | Auth | Firebase Auth (wie 3fls) |
| 6 | Storage | Postgres + Object Storage (wie 3fls) |
| 7 | Phase 2 JSON-Schema | Aus Engine-Klassen ableiten (Reflection) |
| 8 | Phase 3 Graph-Lib | React Flow + eigene GraphObject-Schicht über GraphObj.h |
| 9 | Phase 4 Cloud | Eigenes GCP-Projekt |
| 10 | Phase 6 Integration | Iframe-Embedding |

**Plus die nach Schlaf-Beginn ergänzte Klarstellung:** GraphObject ist **Foundation für ALLE graphischen Viewer**, nicht nur Phase 3. (Memory `graphobject-is-viewer-foundation.md`.)

Falls eine dieser Festlegungen heute Morgen anders aussieht, sagen Sie es vor dem `/gsd-discuss-phase`-Start.

---

## 3. Engine-Roadmap-Voraussetzungen

**Phase 2 startet nicht** ohne diese 6 Arbeiten im `osim-engine`-Repo (Details in `phase-2-json-editor/PLAN.md` §4):

| Engine-Task | Beschreibung |
|---|---|
| E2.1 | Class-Registry `osim_engine.schema.registry` |
| E2.2 | `__sim_fields__`-Spec oder Pydantic-Mirror-Modelle |
| E2.3 | `python -m osim_engine.schema dump` CLI |
| E2.4 | `io.json_loader.load_model_from_json` produktiv ausbauen |
| E2.5 | `io.json_loader.dump_simulator_to_json` |
| E2.6 | Round-Trip-Test: `otx → dump → load → run` == `otx → run` bit-genau |

Für Phase 3 wünschenswert (aber nicht blockierend):
- `bus.attach_recorder(path)` Convenience am EventBus
- `python -m osim_engine.cli run --model ... --seed ... --out ...` Entry-Point
- Reichhaltigere Live-Events (besonders Ressourcen-Status)

→ Empfehlung: bevor Phase 2 startet, einen kurzen Engine-Sprint für E2.1–E2.6 einlegen.

---

## 4. Offene Diskuss-Punkte (Gesamt 37 — pro Phase 6 ± 3)

Jeder PLAN.md hat einen § 9 "Diskuss-Punkte für `/gsd-discuss-phase`". Hier die Gesamtsicht:

### Phase 1 (6 Punkte) — bevor Execute
1. JSON-Format jetzt vorziehen?
2. Multi-Tenant von Tag 1?
3. Storage: Minio vs. GCS-Dev?
4. Firebase-Emulator vs. Dev-Projekt?
5. Demo-Modell `Vorstellung04/Dummy.otx` ins Repo?
6. Tenant-Bootstrap: Cloud-Function vs. lazy `/auth/me`?

### Phase 2 (5 Punkte)
1. `@rjsf/core` vs. eigener Form-Generator?
2. Schema-Refresh in CI oder manuell?
3. Welche Felder brauchen Custom-Widgets?
4. Soft- oder Hard-Delete bei Modell-Löschen?
5. Original-Modelle aus `Vorstellung04/` als Templates vorbereiten?

### Phase 3 (6 Punkte)
1. Canvas oder DOM für Node-Rendering bei großen Graphen?
2. Sub-Flow-Tiefe: Inline vs. Tab/Modal?
3. Wegpunkt-Editor mit Snap-to-Grid?
4. Worker-Stirbt-Verhalten: Einfrieren vs. Reconnect?
5. Animation-Geschwindigkeits-Slider wie OSim2004 oder 1:1?
6. Engine-Coordination: welche zusätzlichen Topics nötig?

### Phase 4 (6 Punkte)
1. GCP-Region (europe-west3 vs. west1)?
2. Cloud SQL Standard vs. Enterprise Plus?
3. osim-engine als pip-Dependency vs. Submodule?
4. Pub/Sub-Quotas — Sampling bei vielen Events?
5. Backup-Strategie?
6. Monitoring-Stack (Cloud Monitoring vs. Grafana)?

### Phase 5 (6 Punkte)
1. WeasyPrint vs. Playwright für PDF?
2. HKA-Klausur-Template-Vorlage existiert?
3. Tenant-Templates wer editiert?
4. MUST-HAVE-KPIs in erster PDF?
5. Report-Sprache Deutsch fest?
6. DSGVO-Anonymisierung für Klausur-Reports?

### Phase 6 (6 Punkte)
1. Token-Exchange-Variante A vs. B (Empfehlung B)?
2. Tenant-Mapping 1:1 oder Mapping-Tabelle?
3. Welche User dürfen Token-Exchange triggern?
4. Hostname-Strategie?
5. tbx_stzrim-PR-Review-Prozess?
6. 3fls-Branding via URL-Param im Iframe?

---

## 5. Wichtige Annahmen, die ich getroffen habe

| Bereich | Annahme | Bei Widerspruch ändern |
|---|---|---|
| Python-Version | 3.13 (3fls-konform, Engine ≥3.12 OK) | `pyproject.toml`, `Dockerfile`, `tool.ruff.target-version` |
| Frontend-Port | 3000 (3fls nutzt 3002) | `portal/vite.config.ts`, `.env.example` |
| Worker-Pool-Default Phase 1 | 4 parallele Subprocesses lokal | `.env.example` (`WORKER_MAX_PARALLEL`) |
| Storage-Pfad in Bucket | `tenants/{tenant_id}/models/...` und `.../runs/...` | `app/services/storage.py` (Phase 1 Welle 2) |
| Run-Timeout | 10 min Default | `.env.example` (`WORKER_TIMEOUT_SECONDS`) |
| Reproduzierbarkeit | `(seed, start_date, end_date, period_len)` als Lauf-ID | Bei Bedarf erweitern |
| Phase 6 Auth-Variante | B (On-Behalf-Exchange), nicht A (geteiltes Firebase) | Diskuss-Punkt #1 |
| Phase 5 PDF-Tool | Tendenz Playwright wegen Tailwind-Fidelity, finaler Entscheid in Discuss | Discuss-Punkt #1 |

---

## 6. Wichtige Engine-Constraints (Vergessen Sie diese nie)

1. **PAWLICEK-LCG ist Modul-Singleton** in `osim_engine.core.distribution.s_verteil`.  
   → Sim-Läufe NUR in **separaten OS-Prozessen**, niemals Threads. Phase 4 nutzt Cloud Run Jobs (= separate Container = separate Prozesse) — OK.
2. **OTX-Loader-Funktion** heißt `load_otx_file()` (nicht `load_simulator_from_otx`, wie ein Agent fälschlich behauptete). Rückgabe ist `LoadResult` mit `.simulator`, `.loaded`, `.unsupported`, `.coverage_ratio`.
3. **Engine-API heute:** `PSimulator` → `bus.subscribe(pattern, sink)` → `start()` × Perioden.
4. **JSON-Loader ist Skelett**, nicht produktiv. Phase 2 baut ihn gemeinsam mit der Engine aus (E2.4).
5. **Engine-Reflection (Phase 2)** erfordert Engine-Erweiterung E2.1+E2.2 — die Engine-Klassen sind heute keine Pydantic-Modelle.

---

## 7. Empfohlene Lese-Reihenfolge (25–30 min)

1. **Dieses Briefing** (Sie lesen es gerade)
2. **`.planning/PROJECT.md`** — 5 min — Was wollen wir bauen, für wen, mit welchen Eckpfeilern
3. **`docs/ARCHITECTURE.md`** §1–§2.9, §6.1, §7 — 12 min — System mit allen Foundations und finalen Entscheidungen
4. **`.planning/ROADMAP.md`** — 3 min — Phasen + Querschnitts-Foundations
5. **`.planning/milestones/v0.1.0/phase-1-vertical-slice/PLAN.md`** — 5 min — was zuerst gebaut wird
6. **`.planning/milestones/v0.1.0/phase-3-live-viz/PLAN.md` §2 + §4** — 5 min — die GraphObject-Schicht und warum sie so wichtig ist

Optional:
- **Phasen 2/4/5/6 PLAN.md** überfliegen, wenn Sie Details zu einer bestimmten Folge-Phase brauchen
- **`.planning/research/osim2004-ui-analysis.md`** — wenn Sie die Original-UI-Konzepte reflektieren wollen
- **`.planning/research/copy-paste-guide.md`** — wenn Sie wissen wollen, welche 3fls-Files wir spiegeln

---

## 8. Empfohlener nächster Schritt

**Wenn Sie mit der Richtung einverstanden sind:**

```bash
/gsd-discuss-phase phase-1-vertical-slice
```

Das geht die 6 Diskuss-Punkte für Phase 1 mit Ihnen durch und bringt den Phase-1-PLAN in den Execute-fertigen Zustand.

**Danach:**

```bash
/gsd-execute-phase phase-1-vertical-slice
```

Wellen-basierte Abarbeitung, parallelisiert wo möglich, atomic commits pro Task.

**Wenn Sie zuerst eine Phase wechseln wollen** (z. B. Phase 3 GraphObject vorziehen, weil Engine-Voraussetzungen für Phase 2 erst geklärt werden müssen):

```bash
/gsd-discuss-phase phase-3-live-viz
```

oder einfach den Phase-Ordner umbenennen — Phase-Reihenfolge ist nicht in Stein gemeißelt, sondern in ROADMAP.md änderbar.

---

## 9. Wenn Sie etwas grundsätzlich ändern wollen

| Wenn Sie sagen | dann ändert sich |
|---|---|
| "Doch erst standalone, ohne Auth — sehe wenigstens was läuft" | Phase 1 wird kleiner: Firebase + Multi-Tenant raus, lokales User-Stub rein |
| "Doch direkt in 3fls integrieren" | Phase 6 wird Phase 1; Frontend in `tbx_stzrim/portal` statt eigenem Repo |
| "Doch Skeuomorphes Original-Look" | UI-Designsprache komplett neu, Tailwind ggf. mit eigenem Theme |
| "Doch nur Polling, kein WebSocket" | Phase 3 vereinfacht sich massiv, Pub/Sub fällt weg, Live-Viz wird schlanker |
| "Phase 2 ohne Engine-Reflection, hand-geschriebenes Schema" | Schneller Start für Phase 2, Drift-Risiko akzeptiert |
| "Phase 6 doch Module Federation statt Iframe" | Phase 6 wird 3× größer, gleicher Stack-Twin in beiden Repos |
| "Phase 3 ohne eigene GraphObject-Schicht, nur React-Flow" | Phase 3 schneller fertig, ABER spätere Viewer-Phasen verlieren Wiederverwendung |

Sagen Sie's, dann passe ich vor Discuss-Start die betroffenen PLAN.mds an.

---

## 10. Bekannte Schwachstellen des Nacht-Setups

- **Skeleton ist nur Datei-Anlegung**, kein `uv sync`/`npm install` ausgeführt. Erster Schritt von Welle 0 in Phase 1.
- **Engine-Voraussetzungen E2.1–E2.6** sind NICHT erledigt — Phase 2 ist davon strikt abhängig.
- **GraphObject-Klassen-Skizze in Phase 3** ist konzeptionell richtig, aber Detail-Implementierungen (insb. `CheckNeighbourhood` aus C++) müssen während der Execute-Phase entstehen.
- **Kein CI** angelegt — kommt in Phase 4 Welle 6, vorher reicht `uv run pytest` lokal.
- **Engine-Spezial-Topics für Live-Viz** (Phase 3 Diskuss-Punkt #6) müssen vor Phase 3 mit Engine-Team abgestimmt werden.
- **Mockup/Sketch des Frontends fehlt** — wir haben Stack-Festlegung, aber kein visuelles Design. Falls Sie das wollen: `/gsd-sketch` als optionaler Schritt vor Phase 1 Welle 5.
- **HKA-Klausur-Template-Vorlage** (Phase 5) unbekannt — abgleichen vor Phase 5 Welle 2.

---

## 11. Kontakt-Punkte zur Engine-Entwicklung

Drei konkrete Wünsche an `osim-engine` (Tickets ggf. dort anlegen):

1. **JSON-Schema-Generator + Loader (E2.1–E2.6)** — Phase-2-blockierend
2. **`bus.attach_recorder(path)`** Convenience am EventBus — würde Phase 1 + Phase 3 vereinfachen
3. **CLI-Entry-Point** `python -m osim_engine.cli run --model ... --seed ... --out ...` — würde Phase 1 Welle 4 Task 4.1 trivial machen (statt eigenen Worker-Wrapper bauen)

---

**Gute Arbeit nachher. Ich warte mit `/gsd-discuss-phase phase-1-vertical-slice` oder Ihrer Korrektur.**
