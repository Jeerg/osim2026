---
phase: 01-live-viewer-bridge
plan: 11
subsystem: engine/insights + engine/streaming
tags: [gap_closure, osim-fidelity, kpi, sub-streams, insights, listener-only]
requires:
  - "01-01: streaming-Framework (Frame/SeqCounter/registry/attach)"
  - "01-03: AuswertungListener + 11-kind-Stream-Vertrag (wird ersetzt)"
  - "01-04: meta.json partial-Status-Block (streams_status)"
  - "01-06: 6 JSON-Schemas + Golden-Record-Validierung"
provides:
  - "OSim2004-treue Feldsätze für alle 11 kpi_auswertung-kinds + gantt_schicht"
  - "now-buildable records (prod_auftrag/nbearbeit/wschlange) aus dem Engine-State"
  - "slice-gated Felder mit null + missing_slice (keine erfundenen Zahlen)"
affects:
  - "01-12 (UI-Analysen-Renderer) bekommt die wahre OSim-Struktur statt Erfindung"
tech-stack:
  added: []
  patterns:
    - "Aggregator-Record-Sammler (add_*) statt O(1)-Counter für now-buildable kinds"
    - "gated-Snapshot = echte Feldnamen mit null + missing_slice-Marker"
    - "read-only on_period_end-Scan aus sim.m_lAusl / sim.m_oWarteSchl (SPEC §5)"
key-files:
  created: []
  modified:
    - "engine/src/osim_engine/insights/classes.py"
    - "engine/src/osim_engine/insights/__init__.py"
    - "engine/src/osim_engine/streaming/listeners/auswertung.py"
    - "engine/src/osim_engine/streaming/listeners/schicht.py"
    - "engine/src/osim_engine/streaming/schemas/kpi_auswertung.json"
    - "engine/src/osim_engine/streaming/schemas/gantt_schicht.json"
    - "engine/src/osim_engine/streaming/partial.py"
    - "engine/tests/integration/test_streaming_kpi.py"
    - "engine/tests/integration/test_streaming_schema.py"
    - "engine/tests/integration/golden/kpi_auswertung.full.jsonl"
    - "engine/tests/integration/golden/kpi_auswertung.partial.jsonl"
    - "engine/tests/integration/golden/gantt_schicht.full.jsonl"
    - "engine/tests/integration/golden/gantt_schicht.partial.jsonl"
decisions:
  - "01-11: Analyse-Feldsätze 1:1 gegen ../OSim2004 ISimulatorViewerAusw*.cpp gepinnt (keine erfundene Generik)"
  - "01-11: best_auftrag ist im headless-Port quellenlos (kein m_bestell-Modell) → gated (leere records + missing_slice), nicht erfunden"
  - "01-11: now-buildable prod_auftrag/nbearbeit aus sim.m_lAusl (Auslöser = Fertigungsauftrag im Port), wschlange aus sim.m_oWarteSchl"
  - "01-11: gantt_schicht trägt person/schichten/ueberstunden/einheiten (ISimulatorViewerSchicht FillList) statt der erfundenen soll-/iststunden"
metrics:
  duration: "~30 min"
  completed: "2026-05-29"
  tasks: 2
  files: 13
---

# Phase 01 Plan 11: OSim2004-treue Analysen Summary

Die 11 OSimINSIGHTS-Auswertungen und der Schicht-Stream wurden auf die EXAKTEN
OSim2004-Feldsätze umgestellt — 1:1 gepinnt gegen die `ISimulatorViewerAusw*.cpp`
und `ISimulatorViewerSchicht.cpp`. Die vorherige (01-03) Generik (count_gesamt /
durchlaufzeit_avg / auslastung_pct für alle kinds, sollstunden/iststunden für
schicht) wurde durch die echten deutschen OSim-Spalten ersetzt; now-buildable
Analysen liefern echte Werte, slice-gated tragen echte Feldnamen + null +
missing_slice (keine erfundenen Zahlen).

## Was gebaut wurde

### Task 1 — Insights-Aggregatoren (commit a41b2da)

`insights/classes.py` komplett auf OSim-Feldtreue umgestellt:

- **NOW-BUILDABLE Record-Sammler** (`add_*`-Methoden, `snapshot()` →
  `{period_num, records}`):
  - `IFertigungsauftrag` (prod_auftrag): `teil/menge/soll_beginn_tag/beschreibung`
    (ISimulatorViewerAuswProdAuftr: m_durch->m_name / m_auftr_meng / m_beg_termin
    / Tochter-Lager m_beschr).
  - `IBestellauftrag` (best_auftrag): `teil/menge/best_termin_tag/auftrags_typ/
    beschreibung`; auftrags_typ ∈ {normal, eil} (m_best_typ btNormal).
  - `INBearbeit` (nbearbeit, neue Klasse, IFertigungsauftrag-Subtyp):
    `teil/menge/beginntermin` (Filter fsEinlast).
  - `IProzess` (wschlange): `bm_name/teil/restmenge/wartestatus[/op/material]`;
    wartestatus ∈ {wartet_vor_bm, unterbrochen, wartet_material, wartet_personal}.
- **SLICE-GATED Snapshots** (echte Feldnamen, null + `missing_slice`):
  - `IPerson` (pers, 8 Spalten), `IBetriebsmittel` (betr, 5 Spalten),
    `ILagerKauf` (kauf, 10 Spalten), `ILagerEigen` (eigen, 11 Spalten),
    `IGonzo` (kalkulation: Kostenkalkulation- + Lagerkalkulation-Block K/E/P),
    `ISimulator` (gesamt: Verkaufserlös + Verkaufsergebnisse 1-3 + Kennzahlen,
    plus now-buildable count_auftraege_* als Zusatz), `IArbeitszeit` (schicht:
    person/schichten/ueberstunden/einheiten).

Klassen-Identität/Vererbung erhalten (IFertigungsauftrag/IBestellauftrag bleiben
IAuftrag-Subklassen) → `test_p5n_insights.py` unverändert grün.

### Task 2 — Listener + Schemas + Golden (commit dd8aa43)

- `AuswertungListener.on_period_end` sammelt now-buildable Records read-only:
  prod_auftrag/nbearbeit aus `sim.m_lAusl` (jeder Auslöser = Fertigungsauftrag
  im headless-Port), wschlange aus `sim.m_oWarteSchl`. best_auftrag bleibt gated
  (Port hat kein m_bestell/Lager-Modell), mit explizitem
  `missing_slice="Bestell-/Lager-Slice"`.
- `SchichtListener` trägt jetzt person/schichten/ueberstunden/einheiten; im
  P5-M-Skelett-Pfad null + missing_slice="P5-M" + partial=true.
- `kpi_auswertung.json` + `gantt_schicht.json` spiegeln die echten OSim-Felder
  per kind (records-Arrays für now-buildable, nullable + missing_slice für
  gated). Golden-Records (full + partial) neu geschrieben; Schema-Tests +
  Regression-Pin gegen erfundene Generik ergänzt.

Verifiziert per realem Lauf: 11 KPI-Frames + 1 Schicht-Frame, **0 Schema-Fehler**,
prod_auftrag mit echtem Record `{teil: Erzeugnis-1, menge: 1, soll_beginn_tag:
100, beschreibung: Bearbeitung}`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical functionality] best_auftrag als gated statt erfunden**
- **Found during:** Task 2
- **Issue:** Der Plan listet best_auftrag unter NOW-BUILDABLE; der headless-Port
  hat aber kein Bestellauftrags-/Lager-Modell (`m_bestell` existiert nicht).
- **Fix:** best_auftrag emittiert leere `records` + `missing_slice=
  "Bestell-/Lager-Slice"` — die im Plan ausdrücklich erlaubte Honest-Fallback-
  Regel ("wo das Port-Attribut fehlt, behandle die Analyse als gated, statt zu
  erfinden"). Keine erfundenen Zahlen.
- **Files modified:** auswertung.py, kpi_auswertung.json, golden-Files
- **Commit:** dd8aa43

**2. [Rule 2] partial.py meta-reason auf die echten Felder aktualisiert**
- **Found during:** Task 2
- **Issue:** Der streams_status-Reason-Text (UI-facing meta.json) nannte noch die
  alten Generik-Feldnamen — Fehlinformation für das UI-Banner.
- **Fix:** Reason-Text für kpi_auswertung + gantt_schicht auf die echten
  OSim-Felder + Slice-Auflösung umgeschrieben.
- **Commit:** dd8aa43

## Deferred Issues (out-of-scope)

Beim vollständigen `tests/integration/`-Lauf (782s) failen 3 PRE-EXISTING Tests,
ALLE außerhalb des 01-11-Scopes (insights/streaming): `test_python_vs_cpp::
test_python_run_matches_cpp_run_on_embb` (m_dPtkEinsatzzeit-Parity-Diffs) +
2× `test_azeitsim_runner` (OTX-Roundtrip / P5-M). Die 01-11-Commits berühren
keine core/pps/azeit-Datei; die Streaming-/Insights-Suiten sind 65/65 grün.
Dokumentiert in `deferred-items.md` (Scope-Boundary, P5-M/C++-Parity-Slice).

## SACRED-Constraint (SPEC §5) gewahrt

`core/simulator.py`, `streaming/attach.py`, `core/recorder.py`,
`observability/bus.py`, `streaming/listeners/__init__.py` — alle unverändert
(per `git diff --stat HEAD~2 HEAD` verifiziert). Listener self-registrieren via
`register_listener`. Reproduzierbarkeitsvertrag (PAWLICEK-LCG) unangetastet —
nur read-only getattr-Zugriffe.

## Verification

- `uv run pytest tests/integration/test_streaming_kpi.py tests/integration/test_streaming_schema.py -q` → **44 passed**
- `test_p5n_insights.py + test_streaming.py + test_streaming_kpi + test_streaming_schema` → **65 passed, 1 xpassed**
- Realer Engine-Lauf gegen die neuen Schemas → **0 Schema-Fehler**, echte
  prod_auftrag-Records, gated kinds mit missing_slice.

## Self-Check: PASSED

- Dateien vorhanden: 01-11-SUMMARY.md, insights/classes.py, listeners/auswertung.py, schemas/kpi_auswertung.json (+ alle modified-Files committed).
- Commits vorhanden: a41b2da (Task 1), dd8aa43 (Task 2).
