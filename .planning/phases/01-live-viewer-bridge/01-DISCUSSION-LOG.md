# Phase 01: live-viewer-bridge - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-28
**Phase:** 01-live-viewer-bridge
**Areas discussed:** Streaming-Stack, Skelett-Slice-Strategie, KPI-Compute-Granularität, osim-ui Integration

---

## Streaming-Stack

### Q1.1 — Stream-Owner-Architektur

| Option | Description | Selected |
|--------|-------------|----------|
| Neues streaming/-Modul, recorder.py bleibt low-level | Klare Trennung: recorder = audit, streaming = UI-Vertrag | ✓ |
| recorder.py erweitern, kein neues Modul | Eine Datei = ein Owner; riskiert Mischverantwortung | |
| Hybrid mit Shared-Base | Beide Writer aus core/jsonl_io.py erben | |

**User's choice:** Neues streaming/-Modul
**Notes:** SPEC-Q-7 damit beantwortet — recorder.py läuft parallel weiter.

### Q1.2 — Subscription-Mechanismus

| Option | Description | Selected |
|--------|-------------|----------|
| Direkte OListenerSimulator-Subklassen | Nutzt existing on_*(deep=True)-Fanout | ✓ |
| Via observability/bus.py EventBus | Lose Kopplung; aber zwei Notification-Pfade | |
| Hybrid (Bus für KPI, Listener für Lifecycle) | Komplexer aber spielt Stärken aus | |

**User's choice:** Direkte OListenerSimulator-Subklassen
**Notes:** EventBus bleibt observability-only.

### Q1.3 — Buffering-Strategie

| Option | Description | Selected |
|--------|-------------|----------|
| Batched: Flush per N Frames + Period-End-Marker | AC-2 erreichbar bei kleinem N, AC-8 durch reduzierte syscalls | ✓ |
| Sync per Frame + fsync | Max Durability, AC-2/AC-8 gefährdet | |
| Async-Background-Thread mit bounded Queue | Beste Engine-Performance, Thread-Safety-Komplexität | |

**User's choice:** Batched
**Notes:** Default N = 100, konfigurierbar.

### Q1.4 — Schema-Validation-Timing

| Option | Description | Selected |
|--------|-------------|----------|
| Nur in Tests + CI, nie zur Laufzeit | Vertraut auf typed Dataclass + Golden-Tests | ✓ |
| Strict per Frame zur Laufzeit | Verhindert kaputte Streams 100%, kostet AC-8 | |
| Dev/CI strict, Production opt-out | Konfigurierbar; mehr Test-Pfade | |

**User's choice:** Test-only Validation

---

## Skelett-Slice-Strategie

### Q2.1 — Phase-Scope angesichts P5-D/L/M-Skelette

| Option | Description | Selected |
|--------|-------------|----------|
| Partial-Streams + meta.json-Flag | Alle 6 Streams scaffolden, partial-Status signalisieren | ✓ |
| Minimum-Subset (lifecycle + gantt_durchlauf + kpi_auswertung) | Sicher, aber schmal | |
| Sequenziell — erst P5-D/L/M schließen, dann Phase 01 | Risiko: Bridge wird nie sichtbar | |

**User's choice:** Partial-Streams

### Q2.2 — Partial-Signal

| Option | Description | Selected |
|--------|-------------|----------|
| meta.json mit per-Stream-Status-Block | Maschinen-lesbar, klar getrennt vom Stream | ✓ |
| Inline-Diagnostik-Frame als erstes Stream-Frame | Stream-spezifisch, aber UI muss erste Frames sniffen | |
| Keine explizite Signalisierung | Simpel, aber UI rät | |

**User's choice:** meta.json-Status-Block

### Q2.3 — Slice-Closure-Priorität

| Option | Description | Selected |
|--------|-------------|----------|
| P5-D Aufgabe-Status zuerst | 27 Stubs, schaltet gantt_durchlauf + reporting_record frei | ✓ |
| P5-L Generator zuerst | 8 Stubs, schaltet Auftrags-Eingang frei | |
| P5-M Arbeitszeit zuerst | Schaltet gantt_schicht + gantt_einsatz frei | |

**User's choice:** P5-D zuerst, dann P5-L, dann P5-M

### Q2.4 — Test-Strategie für partielle Streams

| Option | Description | Selected |
|--------|-------------|----------|
| Golden-Stub-Files mit minimalen partial-Frames | AC-1 läuft gegen alle Streams, Lücken sichtbar als „leere" Records | ✓ |
| pytest.mark.skipif für partial-Streams | Spart Arbeit, Regressions-Risiko | |
| Synthetic-Fixture-Daten in den Stubs | UAT bleibt voll, mehr Test-Infrastruktur | |

**User's choice:** Golden-Stub-Files

---

## KPI-Compute-Granularität

### Q3.1 — Compute-Strategie

| Option | Description | Selected |
|--------|-------------|----------|
| Incremental Counter, Flush bei period-end | SPEC-Default, AC-2/AC-8 erreichbar | ✓ |
| Period-End-Recompute | Einfach, aber Memory-Spike + Period-End-Stall | |
| Hybrid: Counter + Recompute für komplexe Statistiken | Realistisch für Industrie-KPIs | |

**User's choice:** Incremental Counter

### Q3.2 — Counter-Location

| Option | Description | Selected |
|--------|-------------|----------|
| In insights/classes.py (Insights-Klassen) | Schließt P5-N Skelett zugleich | ✓ |
| Separate KpiCollector-Klassen in streaming/ | Saubere Trennung, mehr Code | |
| Side-Dict im Simulator | Minimal, aber typunsicher | |

**User's choice:** Insights-Klassen

### Q3.3 — KPI-Coverage (SPEC Q-1)

| Option | Description | Selected |
|--------|-------------|----------|
| Top-5: ProdAuftr, BestAuftr, Betr, Pers, Schicht | Wichtigste Sichten, weniger Aufwand | |
| Alle 11 von Anfang an | Vollständige Coverage, mehr Implementation | ✓ |
| Minimum: nur ProdAuftr + Betr | Quick-UAT | |

**User's choice (freeform):** „baller alles durch kann jetzt nicht testen"
**Notes:** Interpretiert als „alle 11" + Direktive zur Beschleunigung der restlichen Discussion. Engineering-Defaults für Folge-Fragen gewählt, eine echte UI-Layout-Frage zurückgespielt.

### Q3.4 — Aggregation-Window

| Option | Description | Selected |
|--------|-------------|----------|
| Period-only | Standard, Sliding kommt mit Phase 6 | ✓ |
| Sliding-Window (rolling) | Mehr Reporting-Tiefe, komplexer State | |

**Selected by Claude's discretion** per Direktive „baller alles durch".

---

## osim-ui Integration

### Q4.1 — Layout-Anker

| Option | Description | Selected |
|--------|-------------|----------|
| Neue Top-Level-Route /live | Discoverability, eigener Mental-Mode | ✓ |
| Side-Panel über bestehende Pages | User bleibt im Kontext, weniger Platz für Gantt | |
| Dashboard-Mosaik auf Home-Page | Sehr sichtbar, ändert Home-Page-Identität | |

**User's choice:** Neue Top-Level-Route /live

### Q4.2 — State-Management (Claude's Discretion)

Eigener `live-stream/store.ts` parallel zu `useNavigatorStore`. Andere Lifecycle (Tail-Reader, Frame-Buffer, Filter).

### Q4.3 — Render-Library (Claude's Discretion)

Reuse GObject/cpoint/GObjLink für Gantt; neue KpiTile.tsx + RecordTable.tsx (virtualisiert via @tanstack/react-table).

### Q4.4 — Update-Cadence (Claude's Discretion)

Tail-Polling alle 200ms, UI-Render gethrottled auf max 30 Hz, Frame-Coalescing bei Backpressure-Spitzen.

---

## Operative Defaults (SPEC §11 Q-3 bis Q-8)

### Q-6 — Schema-Version-Mismatch (User-Entscheidung explizit)

| Option | Description | Selected |
|--------|-------------|----------|
| Hard-Block (SPEC-Default) | Klare Fehlermeldung, verhindert Daten-Misrepresentation | |
| Best-Effort + Warning | UI rendert was sie versteht, gelbes Banner | ✓ |
| Minor-tolerant, Major-Hard-Block | SemVer-Standard | |

**User's choice:** Best-Effort + Warning
**Notes:** **Abweichung vom SPEC-Default** — User-Override 2026-05-28 für Demo-Flow-Kontinuität. Hard-Block-Mode in „Deferred Ideas" als spätere Option (`OSIM_SCHEMA_STRICT=1`) notiert.

### Q-3, Q-4, Q-5, Q-7, Q-8

Operative Defaults aus SPEC §11 übernommen, in CONTEXT.md D-OP-1 bis D-OP-6 fixiert. Keine separate User-Entscheidung — auf User-Direktive „baller alles durch".

---

## Claude's Discretion

Areas mit Engineering-Default per User-Direktive „baller alles durch":
- D-3.4 (Aggregation-Window: period-only)
- D-4.2 (State-Mgmt: eigener Store)
- D-4.3 (Render-Library: GObject reuse + neue Tile/Table)
- D-4.4 (Update-Cadence: 200ms / 30Hz)
- D-OP-1 bis D-OP-3, D-OP-5, D-OP-6 (operative Defaults aus SPEC §11)

## Deferred Ideas

- Sliding-Window-Aggregate → Phase 6 Replay-Mode oder eigene Phase
- HTTP/WebSocket-Transport → SPEC §4 Out-of-Scope (Phase 7)
- Bidirektionale UI→Engine → Phase 5
- Matrix-/Trace-/Connection-Viewer → Phasen 2-4
- C++/Python-Parity-Automatisierung → M3-Forschungsphase
- Hard-Block-Schema-Mismatch-Mode als config-opt-in → späterer `OSIM_SCHEMA_STRICT=1`
- P5-D/L/M-Slice-Closure-Phasen-Nummern → via eigene `/gsd:phase`-Calls
