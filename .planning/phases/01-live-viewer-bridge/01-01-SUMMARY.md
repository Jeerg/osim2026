---
phase: 01-live-viewer-bridge
plan: 01
subsystem: engine/streaming
tags: [streaming, jsonl, listener, gantt, lifecycle, contract]
requires: []
provides:
  - "streaming/frame.py:Frame + STREAM_TAGS — Engine↔UI-Frame-Vertrag (SPEC §6.2)"
  - "streaming/jsonl_writer.py:JsonlStreamWriter — append-only, batched-flush, drop-oldest"
  - "streaming/run_dir.py:make_run_id/resolve_run_dir/write_meta — run-Layout + meta.json"
  - "streaming/seq.py:SeqCounter — geteilter monotoner seq über alle Streams"
  - "streaming/registry.py:LISTENER_FACTORIES/register_listener — Wave-2-Erweiterungspunkt"
  - "streaming/listeners/lifecycle.py:LifecycleListener"
  - "streaming/listeners/gantt.py:GanttListener"
  - "streaming/attach.py:attach_streaming_listeners — einziger Einhäng-Punkt"
affects:
  - "01-02 (UI-Tail-Reader): konsumiert stream.jsonl-Frame-Format"
  - "01-03/01-04 (Wave-2-Listener): registrieren Factory via register_listener, ohne attach.py/__init__.py zu editieren"
tech-stack:
  added: []
  patterns:
    - "OListenerSimulator-Subklasse + sim.attach() (listener-only, D-1.2)"
    - "AbstractContextManager-Buffering (von recorder.py kopiert, nicht erweitert, D-1.1)"
    - "collections.deque(maxlen) als drop-oldest Bounded-Buffer (D-OP-3)"
    - "Self-Registrierung beim Modul-Import via register_listener (Wave-2-Erweiterung ohne Shared-Write)"
key-files:
  created:
    - engine/src/osim_engine/streaming/__init__.py
    - engine/src/osim_engine/streaming/frame.py
    - engine/src/osim_engine/streaming/jsonl_writer.py
    - engine/src/osim_engine/streaming/run_dir.py
    - engine/src/osim_engine/streaming/seq.py
    - engine/src/osim_engine/streaming/registry.py
    - engine/src/osim_engine/streaming/listeners/__init__.py
    - engine/src/osim_engine/streaming/listeners/lifecycle.py
    - engine/src/osim_engine/streaming/listeners/gantt.py
    - engine/src/osim_engine/streaming/attach.py
    - engine/tests/integration/test_streaming.py
  modified:
    - .gitignore
decisions:
  - "Frame als @dataclass(slots=True) statt Pydantic (D-1.4 Discretion): leichtgewichtig, kein Runtime-Overhead"
  - "Geteilter SeqCounter-Objekt (eigenes Modul streaming/seq.py) statt mutable list — sauberere Factory-Signatur"
  - "GanttListener liest read-only sim._evt_pool.get_curr() in on_sim_ereig; kein Kernel-Eingriff"
  - "gantt_durchlauf-status = 'unbekannt' solange P5-D Skelett (partial-Stream, D-2.1)"
metrics:
  duration: ~25min
  completed: 2026-05-29
  tasks: 2
  files: 12
---

# Phase 01 Plan 01: Streaming-Foundation Summary

Walking-Skeleton der Engine-Seite: osim-engine emittiert während eines Sim-Laufs einen Live-JSONL-Stream nach `runs/<run-id>/stream.jsonl` über reine `OListenerSimulator`-Subklassen — der Engine-Kern (`core/simulator.py`) bleibt unangetastet. Der Engine↔UI-Frame-Vertrag (SPEC §6.2) ist damit end-to-end gepinnt; Wave-2-Streams hängen sich kontraktstabil über das Registry-Pattern ein.

## Was gebaut wurde

| Task | Inhalt | Commit |
|------|--------|--------|
| RED | Failing-Specs für Frame/Writer/run_dir/Registry/Listener/attach + Sacred-Guard | af1cf74 |
| 1 | Frame + JsonlStreamWriter + run-dir/meta.json + `.gitignore: runs/` | a12f82a |
| 2 | Registry + SeqCounter + Lifecycle/Gantt-Listener + attach-Helper | d31882a |

## Der finale Frame-Vertrag (für 01-02 und Wave-2)

### Pflichtfelder (jede stream.jsonl-Zeile)

```json
{"t": 0, "stream": "lifecycle", "seq": 1, "v": {"kind": "sim_begin", ...}}
```

| Feld | Typ | Bedeutung |
|------|-----|-----------|
| `t` | int | Sim-Zeit in Sekunden (`sim.evt_curr_time()`) |
| `stream` | str | Sub-Stream-Tag, einer aus `STREAM_TAGS` |
| `seq` | int | global monoton steigend über ALLE Streams |
| `v` | dict | Stream-spezifischer Payload |

Optional (nur wenn gesetzt): `wall_t` (ISO-8601), `meta_event` (OMetaEvent-Name).
`STREAM_TAGS = ("lifecycle", "gantt_durchlauf", "gantt_einsatz", "gantt_schicht", "kpi_auswertung", "reporting_record")`.

### lifecycle-`v`-Felder

`kind ∈ {sim_begin, period_begin, period_end, period_break, sim_reset}`, jeweils mit `period_num`, `period_begin`, `period_len`; `period_begin/period_end/period_break` zusätzlich `end_time`. `period_end` und `period_break` rufen `writer.flush()` (D-1.3).

### gantt_durchlauf-`v`-Felder

- `kind="start"`: `auftrag_id`, `prozess_id`, `start_time`, `betriebsmittel_id`, `dauer_geplant`
- `kind="ende"`: `auftrag_id`, `prozess_id`, `start_time`, `end_time`, `dauer_ist`, `status`

`status` ist heute konstant `"unbekannt"` (P5-D-Skelett, siehe Known Stubs).

## Erweiterungs-Vertrag für Wave-2 (01-03/01-04)

Ein neues Listener-Modul `streaming/listeners/<name>.py`:

1. erbt von `OListenerSimulator`, Konstruktor-Signatur `(seq_counter: SeqCounter, writer: JsonlStreamWriter)`,
2. ruft am Modul-Ende `register_listener(factory)` mit einer Factory `Callable[[SeqCounter, JsonlStreamWriter], OListenerSimulator]` (Idempotenz über `factory.__name__`),
3. wird durch bloßes Vorhandensein aktiv — `listeners/__init__.py` importiert die feste Namensliste (`lifecycle, gantt, auswertung, einsatz, schicht, reporting`) defensiv.

**Kein Edit an `attach.py` oder `listeners/__init__.py` nötig** (kein Shared-Write). `seq` holt man per `seq_counter.next()` (liefert 1, 2, 3, …).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `streaming/seq.py` als eigenes Modul ergänzt**
- **Found during:** Task 2
- **Issue:** Der Plan spricht vom „geteilten `seq_counter` (mutable Zähler)", lässt die konkrete Form (raw list vs. Objekt) offen (Claude's Discretion: Frame-Field-Namen / Strukturen).
- **Fix:** Kleine `SeqCounter`-Klasse statt roher mutable list — saubere `next()`-API + typstabile Factory-Signatur. Im Frame-Vertrag oben dokumentiert.
- **Files:** `engine/src/osim_engine/streaming/seq.py`
- **Commit:** d31882a

Sonst: Plan exakt wie geschrieben ausgeführt.

## Sacred Constraint (SPEC §5)

`git diff --stat HEAD -- engine/src/osim_engine/core/simulator.py` ist leer. `recorder.py` und `observability/bus.py` ebenfalls unverändert. Streaming hängt ausschließlich listener-only via `sim.attach()` ein.

## Known Stubs

| Stub | Datei:Zeile | Grund / Auflösung |
|------|-------------|-------------------|
| `gantt_durchlauf` `v.status = "unbekannt"` | streaming/listeners/gantt.py (`on_sim_ereig`, ende-Frame) | P5-D (Aufgabe-Status-State-Machine) noch Skelett. Stream ist per D-2.1 `partial`; Status wird mit P5-D-Slice-Closure (Priorität-1, D-2.3) freigeschaltet. Frame-Vertrag steht bereits vollständig. |
| `meta.json:streams` leer | streaming/run_dir.py:write_meta / attach.py | Status-Block wird laut Plan in 01-04 gefüllt (D-2.2). Intentional. |

## Verification

- `cd engine && uv run pytest tests/integration/test_streaming.py -q` → **17 passed, 1 xpassed** (gantt-Slice fährt im v1-Szenario Prozesse, daher xpass bei `strict=False` — Safety-Net für künftige Status-Genauigkeit).
- Regression: `test_v1_smoke.py` + `test_p5n_insights.py` → 12 passed.
- O-1 (eine append-only stream.jsonl), O-5 (`meta.json.schema_version`), AC-1 (Frame-Pflichtfelder + monotone seq) verifiziert.
- `runs/` in `.gitignore` (genau 1 Eintrag).

## Self-Check: PASSED

- Alle 11 erstellten/modifizierten Dateien existieren (Edit/Write erfolgreich, Tests grün).
- Commits af1cf74, a12f82a, d31882a vorhanden (siehe `git log`).
- core/simulator.py-Diff leer (Sacred-Guard-Test grün).
