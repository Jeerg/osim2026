---
phase: 01-live-viewer-bridge
plan: 03
subsystem: engine/streaming + engine/insights
tags: [streaming, kpi, auswertung, insights, aggregator, period-end, p5n]
requires:
  - "01-01: streaming/frame.py:Frame + streaming/registry.py:register_listener + SeqCounter/JsonlStreamWriter"
provides:
  - "insights/classes.py: 14 Insights-Klassen als echte Period-Aggregatoren (snapshot/reset_period/update_*) — P5-N geschlossen"
  - "streaming/listeners/auswertung.py:AuswertungListener — kpi_auswertung-Stream mit allen 11 kind-Diskriminatoren (D-3.3)"
affects:
  - "01-04 (meta.json): muss die partial-kinds (pers/schicht/kalkulation/wschlange/nbearbeit + Teilfelder von prod/best/betr) im streams-Status-Block markieren"
  - "01-05 (UI KpiTile/stream-router): mappt die 11 kinds + ihre v-Felder (siehe Tabelle unten)"
tech-stack:
  added: []
  patterns:
    - "Insights-Klasse als incremental Period-Aggregator (O(1)-update + snapshot(period_num) + reset_period) — D-3.1/D-3.4"
    - "Listener hält je kind einen Aggregator; period_num = m_periodNum-1 (Kern hat bei Listener-Call bereits vorgerueckt)"
    - "Self-Registrierung via register_listener beim Import (kein attach.py/__init__.py-Edit) — Wave-2-Vertrag aus 01-01"
key-files:
  created:
    - engine/src/osim_engine/streaming/listeners/auswertung.py
    - engine/tests/integration/test_streaming_kpi.py
  modified:
    - engine/src/osim_engine/insights/classes.py
decisions:
  - "kauf/eigen sind IAuftrag-Subkinds (IBestellauftrag/IFertigungsauftrag-Mechanik); gesamt ist der ISimulator-Roll-up (D-3.3-Mapping)"
  - "period_num im KPI-Frame = sim.m_periodNum - 1 (Kern incrementet vor dem Listener-Fanout, simulator.py Z.129/140) → erste Flush traegt 0"
  - "verspaetet-Flag konservativ False solange P5-D Skelett (Auftrag-Status-State-Machine fehlt); Snapshot-Arithmetik trotzdem gepinnt"
  - "Snapshot-Arithmetik gegen handgerechnete Werte gepinnt statt gegen C++-Quelle: OSim2004/ISimulatorViewerAusw*.cpp liegt nicht im Repo-Workspace; SPEC §6.3 ist die maßgebliche Feldsemantik (AC-9 manueller Spot-Check, D-OP-6)"
metrics:
  duration: ~20min
  completed: 2026-05-29
  tasks: 2
  files: 3
---

# Phase 01 Plan 03: KPI-Aggregation Summary

Der `kpi_auswertung`-Stream ist vollständig: ein `AuswertungListener` emittiert
period-end je genau einen kind-diskriminierten Frame für ALLE 11
`ISimulatorViewerAusw*`-Varianten (D-3.3). Die 14 Insights-Marker-Klassen aus
`insights/classes.py` (P5-N) sind dabei von leeren Stubs zu echten
Period-Aggregatoren geworden — incremental O(1)-Counter pro Event, Flush
ausschließlich bei `on_period_end` (D-3.1/§7.3, kein O(events)-Re-Scan). Der
Listener hängt sich rein über `register_listener` ein; `attach.py`,
`listeners/__init__.py` und `core/simulator.py` bleiben unangetastet (SPEC §5).

## Was gebaut wurde

| Task | Inhalt | Commit |
|------|--------|--------|
| RED | Failing-Specs: Aggregator-Arithmetik + 11-kind-Coverage + Sacred-Guards | e0076ae |
| 1 | Insights-Klassen → Counter-Hoster (snapshot/reset_period/update_*) | c95117e |
| 2 | AuswertungListener: incremental Counter + period-end-Flush aller 11 kinds | cce12fa |

## Die 11 kind-Diskriminatoren des kpi_auswertung-Streams (für 01-04 / 01-05)

Jeder Frame: `{"t":<period-end-t>,"stream":"kpi_auswertung","seq":<n>,"v":{"kind":<k>,"period_num":<p>,...}}`.

| kind | Aggregator (insights/classes.py) | v-Felder (zusätzlich zu kind/period_num) | Status |
|------|----------------------------------|------------------------------------------|--------|
| `prod_auftrag` | IFertigungsauftrag | count_gesamt, count_abgeschlossen, count_laufend, count_verspaetet, durchlaufzeit_avg, durchlaufzeit_max, durchlaufzeit_min | **wired** (verspaetet partial, P5-D) |
| `best_auftrag` | IBestellauftrag | (gleiche count_*/durchlaufzeit_*-Felder) | partial (keine Bestell-Quelle in v1) |
| `betr` | IBetriebsmittel | auslastung_pct, ruest_pct, stillstand_pct, haupt_nutzungsart | **wired** (bearbeitung; ruest/stillstand partial) |
| `pers` | IPerson | einsatz_zeit, auslastung_pct | partial (P5-M Arbeitszeit) |
| `schicht` | IArbeitszeit | sollstunden, iststunden | partial (P5-M) |
| `kalkulation` | IGonzo | kosten_sum | partial (Kosten-Slice) |
| `wschlange` | IProzess | warte_aktuell, warte_max, nbearbeit_zeit | partial |
| `nbearbeit` | IProzess | warte_aktuell, warte_max, nbearbeit_zeit | partial |
| `kauf` | IBestellauftrag | count_*/durchlaufzeit_* | partial |
| `eigen` | IFertigungsauftrag | count_*/durchlaufzeit_* | **wired** (Eigenfertigung == prod-Quelle in v1) |
| `gesamt` | ISimulator (Roll-up) | count_auftraege_gesamt, count_auftraege_fertig, count_auftraege_offen | **wired** |

Felder-Arithmetik (gepinnt): `durchlaufzeit_avg = durchlaufzeit_sum // count_abgeschlossen`,
`auslastung_pct = bearbeitungs_zeit / period_len * 100` (1 Nachkommastelle).
Bei leerer Periode liefern alle Quotienten 0 (keine ZeroDivision).

## Partial-kinds (Eingabe für 01-04 meta.json:streams.kpi_auswertung)

Der `kpi_auswertung`-Stream ist insgesamt **partial**. Voll verdrahtet sind heute:
`prod_auftrag` (außer verspaetet), `betr` (Bearbeitungsanteil), `eigen`, `gesamt`.
Auf Null-Default (partial) stehen: `best_auftrag`, `pers`, `schicht`,
`kalkulation`, `wschlange`, `nbearbeit`, `kauf` sowie die ruest_/stillstand-Anteile
von `betr` und das verspaetet-Flag der Auftrags-kinds. Auflösung:

- `verspaetet` + Auftrags-Status → **P5-D** (Aufgabe-Status-State-Machine, Priorität-1 lt. D-2.3).
- `pers`/`schicht` → **P5-M** (Arbeitszeit-Slice).
- `kalkulation` → Kosten-/Kalkulations-Slice (noch nicht priorisiert).
- `wschlange`/`nbearbeit` → Warteschlangen-/Nicht-Bearbeitungs-Instrumentierung.

Der Frame-Vertrag (Feldnamen/Form) steht ab Phase 01 vollständig — Coverage wächst
mit der jeweiligen Slice-Closure, ohne den Stream-Vertrag zu brechen.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `period_num`-Off-by-one gegen den Kern-Fanout aufgelöst**
- **Found during:** Task 2
- **Issue:** `core/simulator.py` (Z.129/140) inkrementiert `m_periodNum` VOR dem
  `listener.on_period_end`-Fanout. Ein naives `period_num = sim.m_periodNum` hätte
  die erste Flush mit 1 statt 0 markiert und die Plan-Akzeptanz
  („period_num in {0,1}, je 11 Frames") verfehlt.
- **Fix:** `period_num = max(0, sim.m_periodNum - 1)` im Listener. Kein Kern-Eingriff.
- **Files:** engine/src/osim_engine/streaming/listeners/auswertung.py
- **Commit:** cce12fa

**2. [Rule 2 - Missing critical] ZeroDivision-Schutz in allen Quotienten-Snapshots**
- **Found during:** Task 1
- **Issue:** `durchlaufzeit_avg`/`auslastung_pct` ohne abgeschlossene Aufträge bzw.
  ohne gesetzte period_len hätten durch Null geteilt (leere erste Periode ist normal).
- **Fix:** Quotienten geben 0/0.0 zurück, wenn der Nenner 0 ist (gepinnt in
  test_streaming_kpi: `*_leer_snapshot_keine_division_durch_null`).
- **Files:** engine/src/osim_engine/insights/classes.py
- **Commit:** c95117e

Sonst: Plan wie geschrieben ausgeführt. Die C++-Referenz `ISimulatorViewerAusw*.cpp`
liegt nicht im lokalen Repo-Workspace (separater OSim2004-Baum) und konnte nicht
direkt konsultiert werden; die KPI-Feldsemantik folgt SPEC §6.3 (maßgeblich), die
Arithmetik ist gegen handgerechnete Werte gepinnt — ausreichend für den
manuellen C++-Parity-Spot-Check (AC-9, D-OP-6).

## Sacred Constraint (SPEC §5)

`git diff --stat HEAD -- engine/src/osim_engine/core/simulator.py` leer,
`git diff --stat HEAD -- engine/src/osim_engine/streaming/attach.py` leer
(beide als Tests gepinnt: `test_core_simulator_unchanged_kpi`,
`test_attach_py_unchanged_since_01_01`). Der Listener hängt sich ausschließlich
listener-only über `register_listener` ein.

## Known Stubs

| Stub | Datei:Zeile | Grund / Auflösung |
|------|-------------|-------------------|
| `best_auftrag/pers/schicht/kalkulation/wschlange/nbearbeit/kauf` snapshots = Null-Default | streaming/listeners/auswertung.py (`on_sim_ereig` füttert sie nicht) | Quell-Slices Skelett (P5-D/P5-M/Kosten). Stream per D-2.1 `partial`; in 01-04 meta.json markieren. Frame-Vertrag vollständig. |
| `verspaetet=False` für Auftrags-kinds | streaming/listeners/auswertung.py (`update_auftrag_ende`) | P5-D Auftrag-Status-State-Machine fehlt (gleiche Wurzel wie gantt_durchlauf `status="unbekannt"` aus 01-01). Priorität-1-Closure (D-2.3). |
| `betr` ruest_pct/stillstand_pct = 0 | streaming/listeners/auswertung.py | Rüst-/Stillstands-Instrumentierung noch nicht verdrahtet (nur Bearbeitungsanteil). |

## Verification

- `cd engine && uv run pytest tests/integration/test_streaming_kpi.py -q` → **13 passed**.
- `test_p5n_insights.py` → **4 passed** (Identität/Vererbung der Insights-Klassen erhalten).
- Regression `test_streaming.py` + `test_v1_smoke.py` → **29 passed, 1 xpassed** (gantt-partial-Safety-Net aus 01-01, unverändert).
- O-2 (kpi_auswertung als voller Sub-Stream, 11 kinds — Set-Gleichheit getestet), AC-1 (Snapshot-Arithmetik + Frame-Form gepinnt), AC-9-Basis (deterministische KPI-Werte) verifiziert.
- grep: `AuswertungListener(OListenerSimulator)` == 1, `register_listener` >= 1 in auswertung.py.

## Self-Check: PASSED

- engine/src/osim_engine/streaming/listeners/auswertung.py existiert (Write erfolgreich, Tests grün).
- engine/src/osim_engine/insights/classes.py modifiziert (Tests grün).
- engine/tests/integration/test_streaming_kpi.py existiert (13 passed).
- Commits e0076ae, c95117e, cce12fa vorhanden (git log).
- core/simulator.py + attach.py-Diff leer (Sacred-Guard-Tests grün).
