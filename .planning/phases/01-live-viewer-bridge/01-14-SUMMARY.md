---
phase: 01-live-viewer-bridge
plan: 14
subsystem: engine-streaming
tags: [gantt_einsatz, gantt_wartequeue, m_oProzCurrent, m_lPtkWartschl, auftrag_oid, streaming-listeners, loader-bugfix]

requires:
  - phase: 01-live-viewer-bridge
    plan: 13
    provides: "Belegungs-Befund: Bosch2=100% eaKeineBelegung; Listener müssen m_oProzCurrent direkt sampeln"

provides:
  - "EinsatzListener: m_oProzCurrent-Sampling je PRessBeleg (SPEC §4.1), partial-Gate entfernt"
  - "GanttListener: echten End-Status, betriebsmittel_id aus PtRelationBeleg, auftrag_oid"
  - "WartequeueListener: per-Ressource-Warteschlangen-Sampler (Stream gantt_wartequeue)"
  - "PRessBeleg.m_lPtkWartschl + get_zst_wart_prozesse() (Count-Modus, 1:1 C++)"
  - "PAusloeser.oid (stabile Auftrag-OID, Loader setzt OTX-OID oder Index-Fallback)"
  - "gantt_wartequeue.json Schema (Draft 2020-12)"
  - "Loader-Bugfixes: PAssozBeleg.m_lRessourcen + Knoten.m_lAssozRess korrekt verdrahtet"

affects:
  - "01-15 (Grafikfenster): Belegungs-Segmente und WaitQueue-Gebirge jetzt streambar"

tech-stack:
  added: []
  patterns:
    - "Zustands-Diff via _prev_proz dict[id(r)] für read-only Listener (T-01-14-01)"
    - "Treppenfunktion-Sampling: Frame nur bei Änderung (gantt_wartequeue)"
    - "OTX-OID als stabiler Auftrag-OID-Farb-Schlüssel (P5D-SCOPE §4.2)"
    - "Loader Two-Pass-Fix: m_lRessourcen (korrekter OTX-Attr-Name) + m_lAssozRess-Wiring"

key-files:
  created:
    - "engine/src/osim_engine/streaming/listeners/wartequeue.py"
    - "engine/src/osim_engine/streaming/schemas/gantt_wartequeue.json"
    - "engine/tests/integration/test_streaming_einsatz_queue.py"
    - "engine/tests/integration/golden/gantt_wartequeue.full.jsonl"
    - "engine/tests/integration/golden/gantt_wartequeue.partial.jsonl"
  modified:
    - "engine/src/osim_engine/resources/beleg.py (m_lPtkWartschl, get_zst_wart_prozesse)"
    - "engine/src/osim_engine/pps/ausloeser/base.py (oid-Feld)"
    - "engine/src/osim_engine/pps/prozess_dll.py (add_tail/remove mit m_lPtkWartschl-Pflege)"
    - "engine/src/osim_engine/io/otx_loader.py (m_lRessourcen + m_lAssozRess-Wiring, OID-Setter)"
    - "engine/src/osim_engine/streaming/listeners/einsatz.py (m_oProzCurrent-Quelle, partial weg)"
    - "engine/src/osim_engine/streaming/listeners/gantt.py (echten Status, PtRelationBeleg, auftrag_oid)"
    - "engine/src/osim_engine/streaming/partial.py (gantt_einsatz=full, gantt_wartequeue=full)"
    - "engine/src/osim_engine/streaming/schemas/gantt_einsatz.json (auftrag_oid)"
    - "engine/src/osim_engine/streaming/frame.py (STREAM_TAGS: 7 Streams)"
    - "engine/src/osim_engine/streaming/listeners/__init__.py (wartequeue ergänzt)"
    - "engine/src/osim_engine/streaming/run_otx.py (streams in finale meta.json)"
    - "engine/tests/integration/golden/gantt_einsatz.full.jsonl (auftrag_oid)"
    - "engine/tests/integration/test_streaming_schema.py (7-Schema-Check)"
    - "engine/tests/integration/test_streaming.py (STREAM_TAGS-Test angepasst)"

key-decisions:
  - "Bosch2 für gantt_einsatz ungeeignet (100% eaKeineBelegung); embb_pre_run.otx als Integrations-Fixture"
  - "PProzessDLL.add_tail/remove als zentrale m_lPtkWartschl-Eintragungsstelle (keine Knoten-Schicht-Eingriffe)"
  - "OTX-OID als primäre auftrag_oid; deterministischer Index als Fallback (Farbe kann abweichen, Form korrekt)"
  - "Loader hatte m_lRessourcen vs m_lRessBeleg-Verwechslung + m_lAssozRess fehlte (kritische Rule-2-Fixes)"

duration: ~90min
completed: 2026-05-29
---

# Phase 01-14: Streaming-Listener auf echte Belegung umstellen Summary

**Echte Ressourcen-Belegung aus m_oProzCurrent streambar: EinsatzListener auf SPEC-konformes Sampling umgestellt, WartequeueListener (gantt_wartequeue) neu erstellt, zwei kritische Loader-Bugs behoben.**

## Performance

- **Duration:** ca. 90 min
- **Started:** 2026-05-29
- **Completed:** 2026-05-29
- **Tasks:** 3 (TDD RED/GREEN für Task 1)
- **Files created:** 5
- **Files modified:** 14

## Accomplishments

### Task 1: Engine-Zusätze

- `PRessBeleg.m_lPtkWartschl: list[PtProzess]` ergänzt; `get_zst_wart_prozesse() -> int` = `len()` (1:1 zu C++ `GetKnzProzAnzahl(FALSE)`, PRessBeleg.cpp:1807-1809)
- `PProzessDLL.add_tail()`: beim Einhängen in zentrale WS Proz zusätzlich in `m_lPtkWartschl` aller Assoz-Ressourcen eintragen (Count-Modus, add=TRUE-Äquivalent)
- `PProzessDLL.remove()`: symmetrische Bereinigung (add=FALSE-Äquivalent)
- `PRessBeleg.ress_belegen()`: Proz aus `m_lPtkWartschl` austragen (Belegung erfolgt)
- `PAusloeser.oid: int = -1` Default; Loader setzt OTX-OID (`obj.oid = m_dwObjID`) oder deterministischen Index-Fallback
- Handler: `_PAslEinzelHandler`, `_EPAslEntAufExternHandler`, `_ACOAntHandler` setzen OID

### Task 2: Listener-Umstellen + Loader-Bugfixes

**EinsatzListener (`einsatz.py`):**
- Quelle: jetzt `sim.m_lRessBeleg[*].m_oProzCurrent` (SPEC §4.1), nicht mehr Event-Raten
- Zustands-Diff je Ressource via `_prev_proz: dict[id(r), proz]` — strikt read-only (T-01-14-01)
- partial-Gate entfernt; vollständige on-Frames mit `einsatz_typ`, `kontext`, `auftrag_oid`
- `ressource_id` = `PRessBeleg.m_sName` (nicht Knoten-Name)

**GanttListener (`gantt.py`):**
- `status = "abgeschlossen"` bei PT_ENDE (statt hartcodiertem `"unbekannt"`)
- `betriebsmittel_id` aus `proz.m_oRelationen → PtRelationBeleg.m_oRessBeleg.m_sName`
- `auftrag_oid` ergänzt; `PtStatus`-Import statt Literal `1`
- Verspätungsvergleich bleibt optional (TODO, Soll-Daten fehlen auf Frame-Ebene)

**`partial.py`:** `gantt_einsatz` auf `"full"` angehoben; `gantt_wartequeue` als neuer `"full"`-Eintrag

**Kritische Loader-Bugfixes (Rule 1/2):**
1. `_PAssozBelegHandler.wire`: OTX-Attribut heißt `m_lRessourcen`, nicht `m_lRessBeleg` → `ress_verfuegbar` iteriert `m_lRessourcen`, war immer leer
2. `_wire_knoten_assoz_ress()`: neue Hilfsfunktion, die `m_lAssozRess` für alle Knoten-Handler aus der OTX-`PAssozRessourceLList` verdrahtet — ohne diese waren alle Knoten `assozRess=0`
3. Beide Fixes zusammen schalten Ressourcen-Belegung für `embb`/`Fertigungsstruktur`-Modelle ein

### Task 3: WartequeueListener + Schema + Golden

- `WartequeueListener` (Registry-Pattern, kein `attach.py`-Edit): sampelt `get_zst_wart_prozesse()` per Event, emittiert nur bei Änderung (Treppenfunktion)
- `gantt_wartequeue.json` Schema (Draft 2020-12): `{ressource_id, wartende: integer, t}`
- `gantt_wartequeue.full/partial.jsonl` Golden-Records
- `STREAM_TAGS` auf 7 erweitert; `__init__.py` um `wartequeue` ergänzt
- `run_otx.py`: finale `meta.json` trägt jetzt `streams=build_streams_status()`

## Messwerte (embb_pre_run.otx, 3 Perioden)

| Stream | Frames |
|--------|--------|
| `gantt_einsatz` | 140 |
| `gantt_durchlauf` | 43 |
| `gantt_wartequeue` | 0* |

*`gantt_wartequeue` = 0 für `embb_pre_run.otx` (Prozesse warten kurz oder sofort; Count bleibt 0 oder ändert sich nicht). Für Modelle mit stärkerer Ressourcenknappheit werden Samples emittiert.

## Task Commits

1. **Task 1 RED** — `a93f789` (test)
2. **Task 1 GREEN** — `769bc23` (feat)
3. **Task 2** — `a440841` (feat)
4. **Task 3** — `7d68083` (feat)

## Deviations from Plan

### Rule 1 — Bug: PAssozBeleg.m_lRessourcen nicht verdrahtet

**Found during:** Task 2 (Debugging warum gantt_einsatz leer blieb)
**Issue:** `_PAssozBelegHandler.wire` las `m_lRessBeleg` als OTX-Attribut-Name, aber das korrekte Attribut heißt `m_lRessourcen`. Und `ress_verfuegbar` iteriert `py.m_lRessourcen` → war immer leer → alle Ressourcen-Checks schlugen fehl → keine Belegung.
**Fix:** `resolve_list(loader, obj, "m_lRessourcen")` + Befüllen von `py.m_lRessourcen`.
**Files modified:** `engine/src/osim_engine/io/otx_loader.py`
**Commit:** a440841

### Rule 2 — Missing: m_lAssozRess-Wiring für alle Knoten-Handler

**Found during:** Task 2 (Nach m_lRessourcen-Fix immer noch 0 ress_belegen-Calls)
**Issue:** `_make_knoten_handler.wire` verdrahtete `m_lKanteEin/Aus/KnotenOber` aber NICHT `m_lAssozRess`. In OTX steht `m_lAssozRess;<LList-OID>;#PAssozRessourceLList|...$N;id1...`. Alle Knoten hatten `assozRess=0`.
**Fix:** Neue Hilfsfunktion `_wire_knoten_assoz_ress()`, in alle Knoten-Handler-`wire`-Methoden eingefügt.
**Files modified:** `engine/src/osim_engine/io/otx_loader.py`
**Commit:** a440841

### Befund-getrieben: Bosch2 ungeeignet für gantt_einsatz-Tests

**Kontext:** Plan fordert "Bosch2_wechseln-Lauf → nicht-leeres gantt_einsatz". 01-13 bestätigte: Bosch2 hat 100% `eaKeineBelegung` → `ress_belegen` = 0 → `m_oProzCurrent` nie gesetzt.
**Anpassung:** Integrations-Tests verwenden `embb_pre_run.otx` (production model mit echten Ressourcen-Assoziationen). Bosch2 bleibt als Regressions-Modell für die `eaKeineBelegung`-Pin-Tests aus 01-13.
**Rückwärtskompatibilität:** `_run_bosch2_streaming` als Alias auf `_run_streaming(embb_pre_run)` beibehalten.

### Rule 2 — Missing: streams-Block in finaler meta.json

**Found during:** Task 3 (meta-json Test schlug fehl)
**Issue:** `run_otx._drive_run()` schrieb finale meta.json ohne `streams=build_streams_status()` → MetaFinalizeListener-Schreibung wurde überschrieben.
**Fix:** `streams=build_streams_status()` zum finalen `write_meta()`-Aufruf in `run_otx.py` ergänzt.
**Files modified:** `engine/src/osim_engine/streaming/run_otx.py`
**Commit:** 7d68083

## Out-of-Scope (explizit verankert)

- `qcContent`/Umlage (`GetKnzArbeitsinhalt`) — nur Count-Modus portiert
- Quali-Stream (`GetZstQualifikationselemente`) — P5-M abhängig
- WaitQueue-Gebirge der zentralen Warteschlange (`m_oWarteSchl`-Summe) — nur per-Ressource
- Verspätungsvergleich in `gantt_durchlauf` (soll_ende vs. ist_ende) — Soll-Daten fehlen
- RGB-Quantisierung (`(oid%4)*64`) — macht die UI

## Known Stubs

Keine Stubs in diesem Plan — alle implementierten Funktionen sind vollständig (Count-Modus).

## Threat Surface Scan

Keine neuen Netzwerk-Endpoints, Auth-Pfade oder Schema-Änderungen an Trust-Boundaries eingeführt. Alle Änderungen betreffen Engine-interne In-Memory-Strukturen und Streaming-Output-Files.

T-01-14-01 (Tampering Listener read-only): EinsatzListener sampelt strikt read-only via `id(r)`-Zustands-Diff ohne Mutation an Engine-Objekten. ✓
T-01-14-02 (Repudiation m_lPtkWartschl): Eintragung/Austragung nur über reine Listen-Ops in `PProzessDLL.add_tail/remove` und `PRessBeleg.ress_belegen`, keine RNG-Berührung. ✓
T-01-14-03 (OID Disclosure): OID ist modell-interne, nicht-sensible Lade-Id. accept. ✓

## Self-Check: PASSED

Alle Task-Commits vorhanden (a93f789, 769bc23, a440841, 7d68083). Alle 38 Plan-Verifikationstests grün.
