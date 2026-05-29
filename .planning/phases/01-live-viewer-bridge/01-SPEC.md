# Phase 01 — Live-Viewer-Bridge: JSONL-Stream-Ausgabe der Simulation für osim-ui

**Status:** SPEC — vor Discuss/Plan/Execute
**Milestone:** Live-UI-Bridge (M1) — erste Erweiterung nach Headless-Portierung
**Vorgänger:** P5-Slices (Skeleton-Inventory siehe `docs/skeleton-inventory.md`)
**Erstellt:** 2026-05-28
**Autor:** Jörg Werner Fischer (Discuss mit Claude Opus 4.7 + graphify-basierter C++-Quell-Analyse)

---

## 1 — Ziel (eine Zeile)

osim-engine emittiert während der Simulation einen **Live-JSONL-Stream** an einen lokalen Pfad; osim-ui (TS-App) tail-liest den Stream und rendert daraus die Echtzeit-Äquivalente der OSim2004 **Gfx-Viewer + ISimulatorViewerAusw*-Reporting-Sichten**.

## 2 — Geschäftliche Motivation

OSim2004 hatte ~95 MFC-Viewer, die während der Simulation den Bildschirm gefüllt haben (Gantt-Charts für Durchlaufpläne, Auswertungs-Tiles für Aufträge/Betriebsmittel/Personal/Schichten). Der Headless-Port (osim-engine) hat diese Schicht **bewusst weggelassen** (vgl. `insights/classes.py` Docstring: *"Echte Reporting-Pipelines sind UI-Komponenten und außerhalb des headless-Portierungsziels"*) — was korrekt war, jetzt aber den UAT- und Demo-Pfad bricht: ein Sim-Lauf hat heute keine sichtbaren Ergebnisse außer JSONL-Event-Trace (`engine/recorder.py`).

Die Lücke schließen, ohne den Engine-Kern wieder MFC-abhängig zu machen: **Engine schreibt, UI rendert**. Vertrag = JSONL.

## 3 — Outcomes (testbar)

1. **O-1:** Sim-Lauf erzeugt **eine** append-only Datei `runs/<run-id>/stream.jsonl` mit allen Viewer-relevanten Daten als typisierte Sub-Streams.
2. **O-2:** Stream deckt **6 Sub-Stream-Typen** ab — Lifecycle + 5 Viewer-Domänen (siehe §6).
3. **O-3:** `osim-ui` hat ein `live-stream/`-Feature-Modul mit Tail-Reader und 3 Render-Komponenten (GanttRow, KpiTile, RecordTable), die per Stream-Tag aktiviert werden.
4. **O-4:** End-to-End-Demo: 1000-Event-Sim auf `osim-engine` schreibt Stream → `osim-ui` zeigt Gantt + KPI live (Latenz < 1s).
5. **O-5:** Stream-Format ist **versioniert** und JSON-Schema-validiert; Schema-Tests sind Teil der Engine-Test-Suite.

## 4 — Scope

### In-Scope (diese Phase)

| Sub-Stream | C++-Viewer-Quelle | Daten |
|---|---|---|
| `lifecycle` | OSimulator-Listener | sim/period begin/end/break/reset, Status, sim_time, period_num |
| `gantt_durchlauf` | `PDlplViewerStd.cpp` (10.425 LoC), `PDurchlaufplanViewerDesign.cpp` | Aufträge, Prozesse, Start/Ende/Dauer, Status, zugeordnete Betriebsmittel |
| `gantt_einsatz` | `PEinsatzzeitViewer.cpp`, `PEinsatzViewer.cpp`, `PEinsatzzeitViewerOGCtrl.cpp` | Ressourcen-Einsatz-Balken pro Person/Betriebsmittel |
| `gantt_schicht` | `ISimulatorViewerSchicht.cpp`, `FSAMSimulatorViewerSchicht.cpp` | Schicht-Pläne (Person × Schichttyp × Zeitfenster) |
| `kpi_auswertung` | `ISimulatorViewerAusw*.cpp` (11 Klassen) | Period-Aggregate: ProdAuftr, BestAuftr, Pers, Betr, Schicht, Kalkulation, WSchlange, NBearbeit, Kauf, Eigen, Gesamt |
| `reporting_record` | `ISimulatorViewerBestAuftr/ProdAuftr/Pers/Betr/Relationen.cpp` | Detail-Listen einzelner Auftrags-/Person-/Betr-Records |

### Out-of-Scope (Folgephasen)

- **Phase 2:** Matrix-Viewer (`PRessBelegMatrixViewer`, `PSpeicherProzMatrixViewer`, `EPEntFeldMatrixViewer` etc.) — 2D-Heatmaps, brauchen anderes Datenmodell
- **Phase 3:** Trace-Viewer (`PDlplProzTraceViewer`, `PRessBelegProzTraceViewer`) — Chronological-Event-Inspector
- **Phase 4:** Connection-Diagramme (`PDlplConnKnotenViewer`, `PRessVerknuepfungViewer`) — Netz-Visualisierungen
- **Phase 5:** Bidirektionale UI-Eingriffe (User klickt → Engine reagiert)
- **Phase 6:** Replay-Mode (post-mortem Browser für gespeicherte Runs)
- **Nicht in dieser Milestone:** Live-Streaming über Netzwerk (HTTP/WebSocket) — Phase 1 ist file-basiert; HTTP-Broker als M2

## 5 — Hartes Nicht-Ziel

Das Live-Schreiben darf den **Sim-Kern nicht verlangsamen oder semantisch verändern**. Der JSONL-Emitter ist **Listener nur** (Read-Side), kein Hook in den Event-Loop. Wenn der Schreib-Throughput unzureichend ist, geht der **Stream verloren, nicht die Simulation**.

## 6 — Stream-Architektur

### 6.1 Datei-Layout

```
runs/<run-id>/
├── stream.jsonl          # Hauptstream — append-only, alle Sub-Streams
├── meta.json             # Sim-Konfig snapshot + Schema-Version
├── schema/               # Embedded JSON-Schemas pro Sub-Stream (für UI)
│   ├── lifecycle.json
│   ├── gantt_durchlauf.json
│   ├── gantt_einsatz.json
│   ├── gantt_schicht.json
│   ├── kpi_auswertung.json
│   └── reporting_record.json
└── (optional) recorder.jsonl  # bestehender engine/recorder.py-Output, unverändert
```

**run-id:** ISO-Timestamp-Slug + 4-stellige Sequence (z.B. `2026-05-28T14-33-12-0001`), default `./runs/`, überschreibbar per `OSIM_RUN_DIR` env oder `--run-dir` CLI.

### 6.2 Frame-Format

Jede Zeile ist eine eigenständige JSON-Objekt mit fixen Pflichtfeldern:

```json
{"t": 12345, "stream": "gantt_durchlauf", "seq": 4711, "v": { ... }}
```

| Feld | Typ | Bedeutung |
|---|---|---|
| `t` | int | Sim-Zeit in Sekunden seit `m_periodBegin=0` (entspricht C++ `EvtCurrTime()`) |
| `stream` | string | Sub-Stream-Tag, einer aus: `lifecycle\|gantt_durchlauf\|gantt_einsatz\|gantt_schicht\|kpi_auswertung\|reporting_record` |
| `seq` | int | Monoton steigende globale Sequenznummer, UI nutzt sie zur Lücken-Erkennung |
| `v` | object | Stream-spezifischer Payload, validiert gegen `schema/<stream>.json` |

Optionale Felder:
- `wall_t` (string, ISO-8601) — Wall-Clock-Zeit der Engine, für Latenz-Debug
- `meta_event` (string) — wenn der Frame von einem konkreten OMetaEvent ausgelöst wurde

### 6.3 Beispiel-Frames

**Lifecycle:**
```json
{"t":0,"stream":"lifecycle","seq":1,"v":{"kind":"sim_begin","period_num":0,"period_begin":0,"period_len":86400,"sim_start_date":"01.12.2003"}}
{"t":86400,"stream":"lifecycle","seq":287,"v":{"kind":"period_end","period_num":0,"end_time":86400}}
{"t":86400,"stream":"lifecycle","seq":288,"v":{"kind":"period_begin","period_num":1,"period_begin":86400,"period_len":86400}}
```

**Gantt Durchlauf (ein Prozess startet):**
```json
{"t":3600,"stream":"gantt_durchlauf","seq":42,"v":{"kind":"start","auftrag_id":"FA-001","prozess_id":"P1.OP10","start_time":3600,"betriebsmittel_id":"BM-Drehe-01","dauer_geplant":7200}}
{"t":10800,"stream":"gantt_durchlauf","seq":78,"v":{"kind":"ende","auftrag_id":"FA-001","prozess_id":"P1.OP10","start_time":3600,"end_time":10800,"dauer_ist":7200,"status":"abgeschlossen"}}
```

**Gantt Einsatz (Person/Betr-Auslastung):**
```json
{"t":3600,"stream":"gantt_einsatz","seq":43,"v":{"kind":"on","ressource_id":"BM-Drehe-01","ressource_typ":"betriebsmittel","start_time":3600,"einsatz_typ":"bearbeitung","kontext":"FA-001/P1.OP10"}}
{"t":10800,"stream":"gantt_einsatz","seq":79,"v":{"kind":"off","ressource_id":"BM-Drehe-01","start_time":3600,"end_time":10800}}
```

**Gantt Schicht (period-aggregiert):**
```json
{"t":86400,"stream":"gantt_schicht","seq":290,"v":{"period_num":0,"person_id":"PERS-001","schicht":"S1","von":0,"bis":28800,"sollstunden":8.0,"iststunden":7.5}}
```

**KPI Auswertung (period-end-aggregat):**
```json
{"t":86400,"stream":"kpi_auswertung","seq":291,"v":{"kind":"prod_auftrag","period_num":0,"count_gesamt":12,"count_abgeschlossen":8,"count_laufend":3,"count_verspaetet":1,"durchlaufzeit_avg":7200,"durchlaufzeit_max":18000,"durchlaufzeit_min":3600}}
{"t":86400,"stream":"kpi_auswertung","seq":292,"v":{"kind":"betriebsmittel","period_num":0,"id":"BM-Drehe-01","auslastung_pct":78.4,"haupt_nutzungsart":"bearbeitung","stillstand_pct":12.0,"ruest_pct":9.6}}
```

**Reporting Record (Detail-Zeile, periodisch):**
```json
{"t":86400,"stream":"reporting_record","seq":293,"v":{"kind":"auftrag","period_num":0,"auftrag_id":"FA-001","art":"fertigung","menge":100,"start":3600,"ende_ist":10800,"ende_soll":7200,"verspaetung":3600,"prozesse":[{"id":"P1.OP10","betr":"BM-Drehe-01","dauer":7200}]}}
```

### 6.4 Schema-Versionierung

`meta.json` enthält:
```json
{
  "run_id": "2026-05-28T14-33-12-0001",
  "engine_version": "0.x.y",
  "schema_version": "1.0",
  "sim_config": { ... echo aus OTX-Loader ... },
  "started_at": "2026-05-28T14:33:12+02:00"
}
```

Schema-Version-Bump bei Breaking Changes (neue Pflichtfelder, geänderte Typen). UI prüft `schema_version` bei Start, lehnt unbekannte Major-Versionen ab.

## 7 — Engine-Implementation (Python)

### 7.1 Neue Module

```
engine/src/osim_engine/streaming/
├── __init__.py
├── jsonl_writer.py          # buffered append-only writer, fsync nach jedem N
├── frame.py                 # Frame-Dataclass + serialize()
├── schemas/                 # JSON-Schemas pro Sub-Stream
└── listeners/
    ├── lifecycle.py         # hookt on_sim_begin/period_*/sim_reset
    ├── gantt.py             # hookt on_sim_ereig für Prozess-Start/Ende
    ├── einsatz.py           # hookt Ressourcen-Belegungs-Events
    ├── schicht.py           # period-end-Aggregator für Schicht-Plan
    ├── auswertung.py        # period-end-Aggregator für KPIs
    └── reporting.py         # period-end Detail-Listen
```

### 7.2 Hook-Pattern (kein Engine-Kern-Eingriff!)

Listener werden im `OSimulator.__init__` per Optional-Argument oder via `attach_streaming_listeners(sim, run_dir)` Helper hinzugefügt. Engine bleibt darunter unverändert. Existierender `engine/recorder.py` läuft optional parallel.

### 7.3 KPI-Aggregat-Strategie

Per-Event-Update der inneren Counter (incremental), Flush in `on_period_end(deep=True)` via Listener. Vermeidet O(events) Pass am Period-Ende.

### 7.4 Backpressure

- Writer schreibt in Bounded-Buffer (default 10.000 Frames)
- Bei Buffer-Full: **Drop ältester Frame mit Warn-Log**, Sim läuft weiter
- Drop-Counter in `meta.json` aktualisiert, UI zeigt Warnung
- **Nie** den Sim blockieren — siehe §5

## 8 — UI-Implementation (osim-ui / portal/)

### 8.1 Neue Struktur

```
portal/src/features/live-stream/
├── tail-reader.ts           # File-Watcher + IncrementalJSONL-Parser
├── store.ts                 # Stream-State (Zustand) per Stream-Tag
├── components/
│   ├── GanttRow.tsx         # wiederverwendet GObject/cpoint
│   ├── KpiTile.tsx
│   └── RecordTable.tsx
├── stream-router.tsx        # multiplext stream-tag → Component
└── schemas/                 # imported JSON-Schemas für Type-Safety
```

### 8.2 Tail-Reader-Strategie

- Watch via Polling (200ms default — File-System-Events sind unzuverlässig in Electron-Sandboxes)
- Buffer-Seek: speichert letzten gelesenen Byte-Offset; Restart-fest
- Parse-Fehler → Skip + Log, nicht abbruch
- Gap-Detection via `seq`-Lücken

### 8.3 Render-Komponenten

- **GanttRow:** Bestehende GObject/cpoint-Pipeline ist Geometrie-tauglich. Stream-Frame → GObject-Update. Re-Render-Frequenz throttled (max 30Hz)
- **KpiTile:** Card mit Zahl + Trend (period-N gegen period-N-1)
- **RecordTable:** Virtualisierte Tabelle mit Filter/Sort

## 9 — Verifikation / Akzeptanz-Kriterien

| AC | Beschreibung | Test |
|---|---|---|
| AC-1 | Stream-Schema-Tests gegen `golden/` JSONL | pytest in `engine/tests/integration/test_streaming.py` |
| AC-2 | Latenz Engine-Event → JSONL-Line < 50ms p95 | Benchmark-Test mit 100k Events |
| AC-3 | UI tail picks up new lines innerhalb < 1s | E2E in `portal/tests/live-stream.spec.ts` |
| AC-4 | Stream-Tagged Filter: UI kann einen Stream isolieren | Component-Test |
| AC-5 | Robust gegen UI-Crash: Engine schreibt weiter, UI restartet vom Offset | Manual UAT |
| AC-6 | Demo-Run mit 1000 Events ergibt vollständigen Gantt + KPI in UI | UAT-Skript |
| AC-7 | Schema-Version-Mismatch → UI zeigt Warnung, nicht Crash | Negative-Test |
| AC-8 | Engine-Kern-Performance: < 5% Overhead mit aktivem Streaming gegen Baseline | Benchmark Vergleich |
| AC-9 | C++-vs-Python Stream-Parity-Spot-Check für 1 Demo-Sim: gleiche KPI-Werte (±1) | Manual Cross-Check gegen OSim2004-Lauf |

## 10 — Risiken & Annahmen

### Annahmen

1. **A-1:** `osim-ui` benutzt heute Zustand-Store + React; die Erweiterung passt in den bestehenden Stack ohne Library-Wechsel.
2. **A-2:** Sim-Läufe laufen lokal (kein verteiltes Setup); File-basiertes Streaming reicht für M1.
3. **A-3:** Die in §4 In-Scope gelisteten C++-Viewer-Daten lassen sich aus dem aktuellen osim-engine-State ableiten (Voraussetzung: Domain-Slices liefern was nötig ist — **siehe Risiko R-1**).
4. **A-4:** Sim-Zeit-Sekunde ist die natürliche Stream-Achse; tatsächliche Wall-Clock-Wiedergabe-Kontrolle übernimmt UI.

### Risiken

1. **R-1 (HOCH):** Mehrere benötigte Datenquellen sind heute Skelett/Stub (siehe `docs/skeleton-inventory.md`):
   - `decisions/aufgabe.py` (27 Stubs, P5-D Status-State-Machine) → fehlt für Gantt-Status
   - `azeit/` (alle 6 Klassen Skelett, P5-M) → fehlt für `gantt_schicht`
   - `generator/generator.py` (8 Stubs P5-L) → fehlt für Auftrags-Eingang
   - **Mitigation:** Phase 1 streamt nur was AKTUELL da ist, markiert in `meta.json` welche Streams "partial" sind. Skelett-Slices als Folgephase-Voraussetzung dokumentieren.
2. **R-2 (MITTEL):** Schreib-Throughput auf langsamen Disks oder im Anti-Virus-Pfad → Backpressure-Strategie (§7.4) muss greifen, sonst UAT-Wahrnehmung verzerrt.
3. **R-3 (MITTEL):** Schema-Drift zwischen Engine + UI bei Iteration → Schema-Versioning + Schema-Tests in CI Pflicht.
4. **R-4 (NIEDRIG):** osim-ui-Komponenten-Bibliothek möglicherweise nicht für Real-Time-Updates ausgelegt → Throttling-Strategie (§8.3).

## 11 — Offene Fragen für /gsd-discuss-phase

| # | Frage | Default-Annahme falls offen |
|---|---|---|
| Q-1 | Welche der 11 `ISimulatorViewerAusw*`-Varianten sind Priorität 1? | Alle 11 — gebündelt in einem `kpi_auswertung`-Stream über `kind`-Diskriminator. |
| Q-2 | Schreib-Frequenz für Detail-Records: per Event oder period-end? | Period-End-Aggregat, plus per-Event-Lifecycle-Events für Live-Gantt. |
| Q-3 | run-id Schema (timestamp+seq vs uuid)? | ISO-timestamp + 4-stellig seq. |
| Q-4 | Run-Verzeichnis-Default | `./runs/`, override via `OSIM_RUN_DIR` env oder `--run-dir` CLI |
| Q-5 | Buffer-Größe + Drop-Policy konfigurierbar? | Defaults im SPEC, override via CLI/env. |
| Q-6 | Wie reagiert die UI auf `schema_version`-Mismatch? Hard-Block oder Best-Effort? | Hard-Block bei Major-Mismatch, Warning bei Minor. |
| Q-7 | Wird der bestehende `engine/recorder.py` ersetzt oder läuft er parallel? | Parallel — recorder.jsonl ist Low-Level-Debug-Trace, stream.jsonl ist Viewer-Vertrag. |
| Q-8 | Soll C++/Python-Parity (AC-9) automatisiert sein? | Nein — manueller Spot-Check für M1; Automatisierung als M3-Forschungsphase. |

## 12 — Dependencies (Voraussetzungen für Execute)

| Dep | Status | Wirkung wenn nicht erfüllt |
|---|---|---|
| Skelett-Slices P5-D, P5-L, P5-M | OFFEN — siehe `docs/skeleton-inventory.md` | `gantt_durchlauf`/`gantt_schicht`/`gantt_einsatz` Streams sind „partial" |
| osim-ui hat react-virtualized o.ä. | UNGEPRÜFT | Bei großen Record-Listen evtl. Performance-Problem |
| OTX-Loader expose sim_config in meta.json | TEILWEISE — schon m_sStartDate/m_sEndDate vorhanden | Schema-Anker stimmt sonst nicht |

## 13 — Nachgelagerte Phasen (Milestone-Roadmap-Skizze)

| Phase | Name | Kerninhalt |
|---|---|---|
| **01 (diese)** | Live-Viewer-Bridge | Gfx + Insights-Auswertungen als JSONL-Stream |
| 02 | Matrix-Viewer | RessBeleg-, Speicher-, EntFeld-Matrizen als 2D-Stream |
| 03 | Trace-Viewer | Chronological-Event-Inspector |
| 04 | Connection-Diagramme | Netz-Visualisierungen (Knoten/Material/Verknüpfung) |
| 05 | Bidirektionale Eingriffe | UI-Click → Engine-Steuerung |
| 06 | Replay-Mode | Post-mortem-Browser über gespeicherte Runs |
| 07 | HTTP/WS-Transport | File-Stream durch Netzwerk-Stream ersetzen |
| (parallel) | P5-Slice-Schließung | Skelett-Stubs aus Skeleton-Inventory implementieren |

---

## Anhang A — graphify-basierte Quell-Befunde (Reproduzierbar)

Diese SPEC wurde gestützt auf graphify-Inventare beider Codebases erstellt:

```bash
# OSim2004 Gfx-Viewer-Landschaft:
cd OSim2004
graphify query "viewer gfx graphics chart axis row column tab" --budget 2500

# osim-engine Insights-Stub-Status:
cd osim-engine
python graphify-out/.tmp_skeletons.py   # siehe docs/skeleton-inventory.md

# OSimulator-Funktions-Inventar:
graphify explain "EvtCurrTime"
graphify explain "OSimEreig"
```

Schlüssel-Findings:
- **95+ Viewer-Klassen** in OSim2004, davon **~30 fallen in den Phase-1-Scope** (Gfx + Insights-Ausw*).
- **OSimINSIGHTS-Klassen** im Python-Port sind heute alle leere Marker (P5-N), Docstring sagt explizit „Reporting-Pipelines außerhalb des headless-Portierungsziels" — diese Phase füllt das.
- **OListenerSimulator** + die `on_*(deep=True)`-Idiom-Pipeline sind der **korrekte Hook-Punkt** ohne Engine-Kern-Eingriff (siehe Sub-Stream-Mapping in §4).
- **GFX()-Call aus OSimulator.cpp L36** (Cross-Cutting-Coupling aus der Architektur-Analyse) ist im Port bereits aufgelöst — bedeutet, Engine ist heute schon Rendering-frei. Neuer Streaming-Layer darf das nicht rückgängig machen.
