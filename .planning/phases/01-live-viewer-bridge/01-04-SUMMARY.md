---
phase: 01-live-viewer-bridge
plan: 04
subsystem: engine/streaming
tags: [streaming, partial, listener, gantt-einsatz, gantt-schicht, reporting, meta-json, contract]
requires:
  - "01-01: streaming/registry.py:register_listener + SeqCounter/JsonlStreamWriter + run_dir.write_meta(streams=...)"
  - "01-03: kpi_auswertung-Stream (partial-Sub-kinds als Eingabe für den meta.json-Status)"
provides:
  - "streaming/partial.py:build_streams_status — 6-Stream-Status-Block (full/partial + missing_slices + reason) für meta.json (D-2.2)"
  - "streaming/partial.py:is_slice_skeleton — Docstring-Marker-Re-Check + Inventory-Fallback (P5-D/L/M)"
  - "streaming/listeners/einsatz.py:EinsatzListener — gantt_einsatz on/off (partial)"
  - "streaming/listeners/schicht.py:SchichtListener — gantt_schicht period-end-Aggregat (partial)"
  - "streaming/listeners/reporting.py:ReportingListener — reporting_record period-end-Detail (partial)"
  - "streaming/listeners/meta_finalize.py:MetaFinalizeListener — finalisiert meta.json.streams + drop_count am Lauf-Ende"
affects:
  - "01-05 (UI Banner + stream-router): liest meta.json.streams (status/missing_slices/reason) + mappt partial-Frame-Felder"
tech-stack:
  added: []
  patterns:
    - "Statisches Slice→Modul-Mapping + best-effort Docstring-Marker-Re-Check (auto-full bei Slice-Closure ohne Code-Edit)"
    - "Minimal-partial-Frame: nur Pflicht-/ID-Felder + v.partial=True solange Quell-Slice Skelett (D-2.1)"
    - "Period-end-Aggregat (Q-2/§6.3) für schicht/reporting; period-only reset"
    - "meta.json-Finalize rein über Registry-Listener — kein attach.py-Edit (SPEC §5)"
    - "Transitive Listener-Aktivierung: meta_finalize via Import am Ende von reporting.py (kein __init__.py-Edit)"
key-files:
  created:
    - engine/src/osim_engine/streaming/partial.py
    - engine/src/osim_engine/streaming/listeners/einsatz.py
    - engine/src/osim_engine/streaming/listeners/schicht.py
    - engine/src/osim_engine/streaming/listeners/reporting.py
    - engine/src/osim_engine/streaming/listeners/meta_finalize.py
    - engine/tests/integration/test_streaming_partial.py
  modified: []
decisions:
  - "01-04: meta.json-Finalize via MetaFinalizeListener im Registry (idempotent bei period_end/break/reset), nicht via attach.py — Sacred bleibt unangetastet"
  - "01-04: meta_finalize wird transitiv über einen Import am Ende von reporting.py aktiviert (steht nicht in der festen __init__.py-Modul-Liste; kein Edit dort)"
  - "01-04: partial-Klassifikation gegen statisches Inventory-Mapping P5-D/L/M + best-effort Docstring-Re-Check (T-01-09 gepinnt)"
  - "01-04: minimal-partial-Frames tragen v.partial=True; leere Periode → ein sichtbarer partial-Marker (Coverage-Lücke, D-2.4)"
metrics:
  duration: ~5min
  completed: 2026-05-29
  tasks: 2
  files: 6
---

# Phase 01 Plan 04: Restliche Streams (partial) + meta.json-Status Summary

Der 6-Sub-Stream-Vertrag steht ab Phase 01 vollständig: die drei verbleibenden
Streams (`gantt_einsatz`, `gantt_schicht`, `reporting_record`) werden als eigene
`OListenerSimulator`-Subklassen abgebaut. Wo die Quell-Slices heute Skelett sind
(P5-D/L/M), schreiben sie **minimale partial-Frames** statt zu fehlen, und ein
`MetaFinalizeListener` finalisiert `meta.json` mit einem maschinen-lesbaren
6-Stream-Status-Block (`status`/`missing_slices`/`reason`) plus der finalen
Drop-Zählung — alles rein über das Registry-Pattern, ohne `attach.py`,
`listeners/__init__.py` oder `core/simulator.py` zu berühren (SPEC §5).

## Was gebaut wurde

| Task | Inhalt | Commit |
|------|--------|--------|
| RED | Failing-Specs: build_streams_status + 4 Listener + End-to-End-meta.json + Sacred-Guards | 801186e |
| 1 | `partial.py`: is_slice_skeleton + build_streams_status (6-Stream-Block) | 9dd1ac1 |
| 2 | Einsatz/Schicht/Reporting + MetaFinalize Listener (partial + meta.json) | e473657 |

## Der finale meta.json.streams-Block (für 01-05 Banner + stream-router)

`meta.json` trägt nach jedem Lauf (finalisiert bei period_end/break/reset):

```json
"streams": {
  "<tag>": { "status": "full"|"partial", "missing_slices": ["P5-X", ...], "reason": "<de>" }
}
```

| Stream-Tag | status | missing_slices | Kurz-Begründung |
|------------|--------|----------------|-----------------|
| `lifecycle` | **full** | [] | sim/period-Lifecycle vollständig (01-01) |
| `gantt_durchlauf` | **full** | [] | Frame-Vertrag voll; `v.status="unbekannt"` bis P5-D |
| `gantt_einsatz` | partial | P5-D, P5-L | Belegung best-effort aus Bearbeitungs-Event; Einsatz-/Rüst-/Stillstand-Differenzierung fehlt |
| `gantt_schicht` | partial | P5-M | azeit/-Arbeitszeit-Modell Skelett; Soll-/Iststunden=0 |
| `kpi_auswertung` | partial | P5-D, P5-M | 11 kinds verdrahtet, aber best/pers/schicht/kalk/wschlange/nbearbeit/kauf Null-Default + ruest/stillstand/verspaetet (01-03) |
| `reporting_record` | partial | P5-D | Detail-Records ohne ende_ist/ende_soll/verspaetung (Auftrag-Status-State-Machine) |

`drop_count` (int) ist ebenfalls im finalisierten `meta.json` (aus `writer.drop_count`).

## Partial-Frame-Minimalfelder je Stream (für den 01-05 stream-router)

Solange die Quell-Slice Skelett ist, tragen die Frames `"partial": true` und nur:

- **`gantt_einsatz`** `kind="on"`: `ressource_id`, `ressource_typ="betriebsmittel"`, `start_time`.
  `kind="off"`: `ressource_id`, `start_time`, `end_time`.
  (full-Pfad ergänzt `einsatz_typ`, `kontext`.)
- **`gantt_schicht`** (period-end): `period_num`, `person_id=null`, `schicht=null`,
  `von=null`, `bis=null`, `sollstunden=0.0`, `iststunden=0.0`.
- **`reporting_record`** `kind="auftrag"` (period-end): `period_num`, `auftrag_id`,
  `art="fertigung"`, `start`. Leere Periode → ein Marker mit `auftrag_id=null`.
  (full-Pfad ergänzt `menge`, `ende_ist`, `ende_soll`, `verspaetung`, `prozesse[]`.)

`is_slice_skeleton(slice_id)` macht einen best-effort Docstring-Marker-Re-Check
(`"Skelett"` in der Modul-Docstring der gemappten P5-Module) und fällt auf das
statische Inventory-Set (`docs/skeleton-inventory.md`: P5-D/L/M) zurück. Schließt
eine Slice, schaltet der zugehörige Stream automatisch auf den full-Pfad — ohne
Edit an `partial.py`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `meta_finalize` transitiv über `reporting.py` aktiviert**
- **Found during:** Task 2
- **Issue:** `meta_finalize` steht NICHT in der festen Modul-Liste
  `_LISTENER_MODULES` von `listeners/__init__.py`. Der Plan verbietet explizit ein
  Edit an `attach.py`/`__init__.py` — so würde die Factory aber nie importiert und
  damit nie registriert (End-to-End-Test rot).
- **Fix:** Ein Import von `meta_finalize` am Ende von `reporting.py` (das in der
  festen Liste steht) löst dessen Self-Registrierung transitiv mit aus, sobald das
  Paket geladen wird. Kein `__init__.py`-/`attach.py`-Edit.
- **Files:** engine/src/osim_engine/streaming/listeners/reporting.py
- **Commit:** e473657

Sonst: Plan wie geschrieben ausgeführt. Die C++-Viewer-Referenzen
(`PEinsatzViewer.cpp`, `ISimulatorViewerSchicht.cpp` etc.) liegen nicht im lokalen
Repo-Workspace; die Feldsemantik folgt SPEC §6.3 (maßgeblich), die partial-Frames
tragen exakt die dort gelisteten Pflichtfelder.

## Sacred Constraint (SPEC §5)

`git diff --stat HEAD -- engine/src/osim_engine/streaming/attach.py` leer,
`git diff --stat HEAD -- engine/src/osim_engine/core/simulator.py` leer (beide als
Tests gepinnt: `test_attach_py_unchanged_since_01_01`,
`test_core_simulator_unchanged_partial`). `listeners/__init__.py` ebenfalls
unverändert. Der meta.json-Finalize läuft rein listener-only über das Registry.

## Known Stubs

| Stub | Datei:Zeile | Grund / Auflösung |
|------|-------------|-------------------|
| `gantt_einsatz` partial-Frames (kein einsatz_typ/kontext, kein Rüst/Stillstand) | streaming/listeners/einsatz.py | P5-D (Einsatz-Dauer-Arithmetik) + P5-L (Generator/Auftrags-Eingang) Skelett. In meta.json `partial`. Frame-Vertrag vollständig. |
| `gantt_schicht` partial-Frame (Soll-/Iststunden=0, keine Person×Schicht-Quelle) | streaming/listeners/schicht.py | P5-M azeit/-Modell Skelett. In meta.json `partial`. |
| `reporting_record` partial-Records (kein ende_ist/ende_soll/verspaetung/prozesse) | streaming/listeners/reporting.py | P5-D Aufgabe-Status-State-Machine (Priorität-1-Closure, D-2.3). In meta.json `partial`. |

Diese Stubs sind D-2.1-konform intentional: Coverage wächst mit der jeweiligen
P5-Slice-Closure, ohne den Stream-Vertrag zu brechen. 01-05 baut darauf das
UI-Banner.

## Verification

- `cd engine && uv run pytest tests/integration/test_streaming_partial.py -q` → **13 passed**.
- Regression `test_streaming.py` + `test_streaming_kpi.py` + `test_v1_smoke.py` → **38 passed, 1 xpassed** (gantt-partial-Safety-Net aus 01-01, unverändert).
- Demo-Lauf: `meta.json.streams` trägt alle 6 Tags; gantt_einsatz/gantt_schicht/reporting_record/kpi_auswertung = `partial` mit missing_slices; lifecycle/gantt_durchlauf = `full`. `drop_count` = 0 (int).
- O-2 (alle 6 Sub-Streams als Vertrag), O-5 (versioniert via meta.json), AC-1/D-2.4 (Schema-Tests gegen full UND partial), T-01-09 (partial-Klassifikation erzwungen) verifiziert.

## Self-Check: PASSED

- partial.py, einsatz.py, schicht.py, reporting.py, meta_finalize.py, test_streaming_partial.py existieren (Write erfolgreich, 13 Tests grün).
- Commits 801186e, 9dd1ac1, e473657 vorhanden (git log).
- attach.py + core/simulator.py + __init__.py-Diff leer (Sacred-Guard-Tests grün).
