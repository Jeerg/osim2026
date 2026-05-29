---
phase: 01-live-viewer-bridge
plan: 13
subsystem: engine-simulation
tags: [ress_belegen, p5e, link-status, get_assoz_mit, fill_shadow_list, belegung, diagnosis]

requires:
  - phase: 01-live-viewer-bridge
    provides: "P5-D Knoten-Infrastruktur, PAssozBeleg-Basis, EPEntscheidungsAufgabe-Verzweigung"

provides:
  - "Empirische Sonde (diag_ress_einsatz.py): m_eRessUsage-Histogramm, ress_belegen-Counter"
  - "PDlplKnoten.get_assoz_mit(pobj) — 1:1 zu C++ GetAssozMit"
  - "PAssozBeleg.get_link_status/set_link_status/get_base_link_status — 1:1 zu C++ LinkStatus-API"
  - "EPEntKrzRessourcenEinsatz.fill_shadow_list — treu portiert, Skelett-Marker entfernt"
  - "Acceptance-Pin + Bosch2-Regressions-Waechter (test_ress_einsatz_p5e.py)"

affects:
  - "01-14 (Stream: Listener muessen m_oProzCurrent direkt sampeln, nicht aus Events raten)"
  - "01-15 (Grafikfenster: Belegungs-Segmente erfordern korrektes Listener-Abgreifen)"

tech-stack:
  added: []
  patterns:
    - "Monkeypatch-Sonde: Methoden wrappen ohne RNG-Eingriff (read-only Listener)"
    - "LinkStatus-API via dict[id(beleg), (current, base)] statt C++-CList"
    - "TDD RED/GREEN: Tests zuerst failing, dann Implementierung"

key-files:
  created:
    - "engine/experiments/diag_ress_einsatz.py"
    - "engine/tests/integration/test_ress_einsatz_p5e.py"
  modified:
    - "engine/src/osim_engine/pps/knoten/base.py"
    - "engine/src/osim_engine/resources/assoziation/beleg.py"
    - "engine/src/osim_engine/decisions/aufgabe.py"
    - ".gitignore"

key-decisions:
  - "Bosch2_wechseln hat 100% eaKeineBelegung — leere Belegung ist modelltreu, KEIN Python-Bug"
  - "Acceptance-Tests 1+2 laufen auf Minimal-Fixture, nicht Bosch2 (Bosch2 hat keine EABELEGEN-Knoten)"
  - "fill_shadow_list portiert ohne LinkStatus-Filter (1:1 zu C++: FillShadowList sammelt alles)"
  - "LinkStatus-dict intern per id(beleg) statt Objekt-Identitaet wegen CList-Semantik-Aequivalenz"
  - "Symptom-Ursache: Streaming-Listener greifen m_oProzCurrent falsch ab — Scope fuer Plan 01-14"

patterns-established:
  - "Empirische Sonde vor Implementierung: erst Verhalten messen, dann entscheiden"
  - "Bosch2-Regressions-Waechter: Modell-Befund als Pin-Test verankern"

requirements-completed: [O-2, O-3]

duration: 45min
completed: 2026-05-29
---

# Phase 01-13: Ressourcen-Einsatz-Diagnose und P5-E-Basis Summary

**Empirische Sonde beweist: Bosch2_wechseln hat 100% eaKeineBelegung (modelltreu leer); get_assoz_mit + LinkStatus-API 1:1 gegen C++-Original portiert; Skelett-Marker in fill_shadow_list entfernt.**

## Performance

- **Duration:** ca. 45 min
- **Started:** 2026-05-29
- **Completed:** 2026-05-29
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Task-1-Befund empirisch belegt: alle 140.688 EPEntscheidungsAufgabe-Aufrufe im Bosch2-Lauf haben `m_eRessUsage=eaKeineBelegung`; `ress_belegen` = 0 ist modelltreu, kein Python-Defekt.
- `PDlplKnoten.get_assoz_mit(pobj)` implementiert — 1:1 zu C++ `PDlplKnoten::GetAssozMit` (PDlplKnoten.cpp:703-715).
- `PAssozBeleg.get_link_status/set_link_status/get_base_link_status` portiert — 1:1 zu C++ `PAssozRessource.cpp:712-751`; `m_bIsEntAktiv`-Guard korrekt, Default ABL_STD, nicht-enthaltene Ressource = ABL_BLOCKED.
- `EPEntKrzRessourcenEinsatz.fill_shadow_list` treu implementiert (C++ FillShadowList: flat-collect aller PAssozBeleg-Ressourcen); Skelett-Docstring-Marker `"P5-D als Stub"` entfernt.
- 9 Tests grün; Bosch2-Regressions-Wächter verankert das 0/34819-Symptom als erwartetes Modell-Verhalten.

## Task-1-Befund (Entscheidungsgrundlage)

Lauf auf `Bosch2_wechseln-azeitsim.otx`, 1 Periode:

| Metrik | Wert |
|--------|------|
| `knoten.bearbeit_beginnen` gesamt | 34.819 |
| `EPEntscheidungsAufgabe.bearbeit_beginnen` | 140.688 |
| davon `eaKeineBelegung` | 140.688 (100%) |
| davon `EABELEGEN` | 0 |
| `ress_belegen` aufgerufen | 0 |
| `EPEntAufgabeAltIntern` Sub-Pläne | 0 |

**Schlussfolgerung:** Der `eaBelegen`-Default-Pfad ist in Python korrekt und vollständig vorhanden. Das Symptom (leeres Grafikfenster) liegt NICHT in einer fehlenden Belegungslogik, sondern darin, dass die Streaming-Listener `m_oProzCurrent` nicht korrekt abgreifen (Plan 01-14/01-15).

## Task Commits

Jede Aufgabe wurde atomar committed:

1. **Task 1: Empirische Belegungs-Sonde** — `63859e1` (feat)
2. **Task 2 RED: Failing Tests** — `42c6a33` (test)
3. **Task 2 GREEN: get_assoz_mit + LinkStatus-API** — `6df1ce3` (feat)
4. **Task 3: Bosch2-Acceptance-Pin** — `3944381` (feat)

## Files Created/Modified

- `engine/experiments/diag_ress_einsatz.py` — Empirische Sonde: Monkeypatch auf EPEntscheidungsAufgabe/PRessBeleg/PDlplKnoten; Histogramm-Ausgabe
- `engine/tests/integration/test_ress_einsatz_p5e.py` — 9 Tests: Minimal-Fixture-Acceptance, get_assoz_mit-Unit-Tests, LinkStatus-Unit-Tests, Bosch2-Regressions-Wächter
- `engine/src/osim_engine/pps/knoten/base.py` — `PDlplKnoten.get_assoz_mit(pobj)` ergänzt
- `engine/src/osim_engine/resources/assoziation/beleg.py` — `get_link_status`, `set_link_status`, `get_base_link_status` + `_link_status_dict` ergänzt
- `engine/src/osim_engine/decisions/aufgabe.py` — `EPEntKrzRessourcenEinsatz.fill_shadow_list` treu implementiert; Skelett-Marker entfernt
- `.gitignore` — Exception für `diag_bosch2.py` + `diag_ress_einsatz.py`

## Decisions Made

1. **Bosch2-Acceptance-Test auf Minimal-Fixture** — Das Bosch2-Modell hat keine `EABELEGEN`-Knoten; Acceptance-Tests 1+2 für `ress_belegen > 0` laufen daher auf einem synthetischen 1-Knoten-1-Ressource-Fixture (wie bereits in test_v4_passive_ressource.py etabliert).
2. **fill_shadow_list ohne LinkStatus-Filter** — C++ `FillShadowList` sammelt nur, filtert nicht. Der Filter findet statt bei `GetStatus`/`SetStatus`. Plan-Text war hier unpräzise; C++ ist die bindende Referenz.
3. **_link_status_dict per id(beleg)** — C++ `m_LinkStatusList` ist eine CList mit Objekt-Pointer-Identität. Python-dict mit `id(beleg)` als Key ist semantisch äquivalent für single-threaded Sim-Läufe.

## Deviations from Plan

### Plan-Anpassungen (kein Auto-Fix, sondern Befund-getriebene Präzisierung)

**1. [Befund-getrieben] Acceptance-Tests 1+2 auf Minimal-Fixture statt Bosch2**

- **Kontext:** Plan formuliert „Test 1: Nach einer Periode auf Bosch2_wechseln hat der Sim ress_belegen > 0". Task 1 beweist: das ist unmöglich (0 EABELEGEN-Knoten im Modell).
- **Anpassung:** Tests 1+2 laufen auf `_build_one_node_eabelegen()` (Minimal-Fixture mit PDpKnKonstant + PBetriebsmittel + PAssozBeleg), das den eaBelegen-Default-Pfad vollständig prüft. Plan-Fallback-Klausel (Task 2, `<action>`) angewendet.
- **Regressions-Wächter:** Statt Bosch2-Test für ress_belegen > 0 gibt es `test_bosch2_eabelegen_knoten_count()`, der den Befund (0 EABELEGEN, 0 ress_belegen) als Pin verankert.

**2. [Befund-getrieben] fill_shadow_list-Schritt (d) aus Plan 01-13 Task 2**

- **Kontext:** Plan: „Falls ... Bosch ausschließlich EPEnt-Entscheider-Knoten ohne eaBelegen-Default erreicht: den minimalen Auswahl-und-Bindungs-Schritt ergänzen."
- **Befund:** Bosch hat keine EPEnt-Entscheider mit EABELEGEN — alle sind eaKeineBelegung. Schritt (d) bleibt explizit OUT OF SCOPE.

**Total deviations:** 2 befund-getriebene Präzisierungen, kein spekulativer Code.
**Impact on plan:** Korrekt — der Plan selbst sieht den Befund-getriebenen Fallback vor.

## Out-of-Scope (explizit verankert)

Folgende Voll-P5-E/F-Funktionen bleiben bewusst Stubs (`decisions/aufgabe.py:566-749`):

- `block_all`, `un_block_all`, `invert_blocking` — P5-E Blocking-Strategien
- `inc_ress`, `dec_ress` — P5-E Ressourcen-Zählung
- `reset_status_2_base` — P5-F Base-Status-Reset
- `reset_by_timespan` — P5-F Zeitspan-Reset
- `get_status`, `get_base_status` — Entscheider-State-Abfragen (P5-E)

Diese Stubs sind korrekt benannt und dokumentiert. Sie werden erst für Modelle mit aktiver Entscheider-Funktion (`m_bIsEntAktiv=True` + EABELEGEN-Knoten + Strategie-Objekte) relevant.

## Threat Surface Scan

Keine neuen Netzwerk-Endpoints, Auth-Pfade, Dateioperationen oder Schema-Änderungen an Trust-Boundaries eingeführt. Alle Änderungen betreffen nur Engine-interne In-Memory-Strukturen.

T-01-13-01 (Tampering Bindungspfad): Implementierung 1:1 gegen C++ gepinnt, Tests 3+4 verankern die Reihenfolge.
T-01-13-02 (Repudiation RNG): Sonden nur read-only (Monkeypatch + Listener), kein RNG-Zugriff.

## Issues Encountered

- `.gitignore` ignorierted `engine/experiments/` vollständig; `diag_ress_einsatz.py` musste mit `git add -f` und einer `!`-Exception gestaged werden.
- Die `EPEntscheidungsAufgabe`-Aufrufzahl (140.688) übersteigt die Knoten-Aufrufe (34.819) wegen Mehrfachvererbungs-Dispatch (MRO-Kette ruft die Methode mehrfach auf). Dieser Zähler-Artefakt ist in der Sonde-Ausgabe korrekt, ändert aber den Befund nicht.

## Next Phase Readiness

- **01-14 (Stream):** Streaming-Listener (`einsatz.py`, `gantt.py`) müssen `m_oProzCurrent` direkt aus `sim.m_lRessBeleg[*]` sampeln statt aus dem Event-Prozess zu raten. Die get_assoz_mit + LinkStatus-API stehen bereit für zukünftige Modelle mit EABELEGEN-Knoten.
- **01-15 (Grafikfenster):** Belegungs-Segmente können erst nach korrektem Listener-Abgreifen gerendert werden.

---
*Phase: 01-live-viewer-bridge*
*Completed: 2026-05-29*
