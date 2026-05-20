---
phase: 01-vertical-slice
plan: 01
subsystem: engine-io
type: execute
status: complete
wave: 0
tags: [engine, io, otx, writer, roundtrip, tdd]
requirements: [D-01, D-02]
implements_decisions: [D-01, D-02]
dependency_graph:
  requires: []
  provides:
    - "osim_engine.io.otx_writer.dump_simulator_to_otx"
    - "osim_engine.io.otx_writer.OtxWriter"
    - "osim_engine.io.otx_writer.WriterHandler"
    - "osim_engine.io.otx_writer.register_writer"
    - "osim_engine.io.otx_writer.format_object"
    - "osim_engine.io.otx_writer.encode_value"
  affects:
    - "osim_engine.io"   # Re-Export, vorher leere __init__.py
tech_stack:
  added: []   # Keine neuen Dependencies — rein interne Engine-Erweiterung
  patterns:
    - "register_writer-Decorator-Registry (Spiegel zu register_handler im Loader)"
    - "WriterHandler.serialize(writer, py_obj, oid) -> (props, sub_refs)"
    - "Optionaler OTX-Pass-Through für unsupported Klassen"
    - "OID-Übernahme aus LoadResult.instances für OID-stabile Roundtrips"
key_files:
  created:
    - "engine/src/osim_engine/io/otx_writer.py"   # 601 → ~1000+ Zeilen final
    - "engine/tests/unit/io/__init__.py"
    - "engine/tests/unit/io/test_otx_writer.py"
    - "engine/tests/integration/io/__init__.py"
    - "engine/tests/integration/io/conftest.py"
    - "engine/tests/integration/io/test_otx_roundtrip.py"
  modified:
    - "engine/src/osim_engine/io/__init__.py"   # Re-Export, vorher leer
decisions:
  - id: ENCODING
    decision: "Writer liefert str (kein bytes). Latin-1 ist Disk-Encoding (analog otx_reader.parse_otx_file). Konsument MUSS path.write_text(text, encoding='latin-1') aufrufen."
    rationale: "Trennt Format-Logik (str-Manipulation) von I/O. Reader-Vertrag bleibt symmetrisch."
  - id: OID_ORDER
    decision: "Wenn LoadResult.instances mitkommt: OID-Übernahme 1:1 → Roundtrip OID-stabil. Sonst: deterministische Neuvergabe in Tree-Reihenfolge (Sim=0, Auslöser ab 1, dann Pläne, Knoten, Kanten, Ressourcen, Einsatzzeiten, Verteilungen, Entscheider)."
    rationale: "Stabilität schlägt Neuvergabe für den Save-back-Pfad (D-01/D-02). Für Synthese-Modelle ohne Original (zukünftiger Editor-Generate-Modus) reicht deterministische Neuvergabe."
  - id: UNSUPPORTED_PASSTHROUGH_DEFAULT
    decision: "include_unsupported_passthrough=True ist Default. Skelett-Objekte (klass + oid + leere props + original sub_refs) werden für jedes OtxObject, das nicht im Writer-Registry und nicht in der Instances-Map ist, mitgeschrieben."
    rationale: "D-01-Save-back-Pfad muss roundtrip-stabil sein. Browser-Edit-Pfad kann später per Flag opt-out und nur die geladenen/editierten Objekte schreiben (= 'JSON-Tree-only-Edit'-Modus)."
  - id: ASIMULATOR_LABEL_FROM_OTX
    decision: "Wenn original_otx vorhanden: Klassen-Label aus original_otx.by_oid[oid].klass übernehmen, nicht aus type(py_obj).__name__."
    rationale: "Bug-Fix: Python PSimulator wird im OTX als ASimulator serialisiert (siehe Loader-Konvention: vor-instanzierte PSimulator unter OID 0, ASimulator-Handler nutzt sie). Naive type-Inspection labelt sie als 'PSimulator' und der Reload klassifiziert sie als unsupported."
metrics:
  duration_minutes: ~45
  tasks_completed: 2
  files_created: 6
  files_modified: 1
  tests_added: 28
  tests_passing: 28
  loader_handler_coverage: "63/63 (100% Set-Equality, garantiert via test_writer_handles_all_known_loader_classes)"
  roundtrip_models_verified: 3   # embb_pre_run.otx + Dummy.otx + Fertigungsstruktur1_mit_AslFj.otx
  completed_date: 2026-05-20
---

# Phase 1 Plan 01: Engine-OTX-Writer Summary

OTX-Writer (`osim_engine.io.otx_writer.dump_simulator_to_otx`) für die osim-engine als Welle 0 von Phase 1. Spiegel-Architektur zum `OtxLoader` (Class-Registry + Handler-Decorator). Roundtrip-stabil über drei reale Modelle: `embb_pre_run.otx` (1480 OIDs, in-repo), `Dummy.otx` und `Fertigungsstruktur1_mit_AslFj.otx` aus OSim2004/Vorstellung04.

## Was implementiert wurde

### Foundation (Task 1, Commit `96d0f9f`)

- **`OtxWriter`-Klasse** mit Methoden:
  - `write(sim, *, original_otx, instances, include_unsupported_passthrough) -> str`
  - `assign_oids(sim) -> dict[int, int]` — deterministische Neuvergabe
  - `adopt_oids_from_instances(instances, original_otx) -> dict[int, int]` — Übernahme aus Load
  - `get_oid(py_obj) -> int | None` — Reverse-Lookup für Handler
- **`WriterHandler`-Basis** + `register_writer(*klass_names)`-Decorator analog zu `register_handler`/`_HANDLERS` im Loader.
- **`format_object(klass, oid, props, sub_refs) -> str`** — Format-Encoder mit Reader-Symmetrie (verifiziert via `test_format_object_round_trips_via_reader_*`).
- **`encode_value(value) -> str`** — Wert-Encoder (None→ONULL, bool→TRUE/FALSE, int/float/tuple/str).
- **`dump_simulator_to_otx`**-Convenience-API.
- Re-Export über `osim_engine.io.__init__.py` (vorher leer — additiv unproblematisch).
- 20 Unit-Tests (Modul-API, Encoder, Format, Decorator, OID-Vergabe, Smoke).

### Handler-Familie (Task 2, Commit `4784a52`)

WriterHandler für alle 63 Loader-Klassen, gruppiert in Familien (Helper-Factories für Reduktion von Boilerplate):

| Familie               | Klassen                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| Top-Level             | ASimulator                                                               |
| Auslöser              | PAslEinzel, EPAslEntAufExtern, ACOAnt                                    |
| Pläne                 | PDurchlaufplan                                                           |
| Knoten (Standard)     | PDpKnKonstant, PDpKnMenge, PDpKnMengeRuesten, PDpKnVerteilung            |
| Knoten (Verteilung)   | PDpKnRueckKonstant, PDpKnAlternativVerteilung                            |
| Knoten (Alternativ)   | PDpKnAlternativELogik, PDpKnAlternativSplit                              |
| Knoten (Aufgabe)      | EPEnt{AltProzesswege,Auftragsgroesse,KrzRessourcenEinsatz,Reihenfolge,…} |
| Knoten (ACO)          | ACODpKnSplit, ACOReihenfolge, ACOSplit, ACOLogik                         |
| Kanten                | PDlplKante/PDpKaUebergang, PDpKaVerteilung                               |
| Alternativen          | PAlternativeVerteilung, PAlternativeELogik, PAlternativeSplit            |
| Parameter             | PParameter{Menge,ID,Prioritaet,Float}                                    |
| Verteilungen          | PVert{Konstant,Gleich,Normal,LogNorm,Exponential,Beta,BetaPERT,Extern}   |
| Ressourcen            | PBetriebsmittel, PPerson                                                 |
| Einsatzzeiten         | PEinsatzzeitTag, PTagRess, PTagesEinsatzzeit                             |
| Assoziationen         | PAssozBeleg, PAssozRessEnt, PAssozELogikEnt                              |
| Entscheider           | EPEntInformation, EPEntInformationssystem, EPZiel, EPKrzDurchlaufzeit, EPZelSystem, EPEntFeld, EPAszEntFeld |
| Strategien (rsv)      | EPEntStrKrzRessBase/Bedarf/ArbSuchen                                     |
| Strategien (eet)      | EPEntStrAltExternRessBelegBase, EPEntStrKrzKapVeraenderungBase/PrgAutrag, EPEntStrArbVertMitWechsel |

Garantiert via `test_writer_handles_all_known_loader_classes`: `set(_WRITERS.keys()) >= set(otx_loader._HANDLERS.keys())` — schlägt RED, sobald ein neuer Loader-Handler hinzukommt.

## Verification (alle 4 Plan-Steps grün)

1. `pytest tests/unit/io/test_otx_writer.py -x` → **20 passed**
2. `pytest tests/integration/io/test_otx_roundtrip.py -x` → **8 passed** (incl. Dummy.otx und Fertigungsstruktur1_mit_AslFj.otx — KEIN Skip)
3. Smoke: `load(Dummy.otx) → dump → 97478 chars output, coverage=1.000` → OK
4. `ruff check src/osim_engine/io/otx_writer.py tests/.../io/...` → **All checks passed**

Zusätzlich: Full IO-Regression (Reader, Loader, Inspect, Diff + neue Writer-Tests) → **75 passed, keine Regression**.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ASimulator vs PSimulator Klassen-Label-Mismatch**

- **Found during:** Task 2, erster Roundtrip-Test gegen `embb_pre_run.otx`.
- **Issue:** `adopt_oids_from_instances` setzte `klass_by_oid[oid] = type(obj).__name__`. Da der OtxLoader (siehe `_ASimulatorHandler.instantiate`) die vor-instanzierte `PSimulator`-Instanz unter OID 0 wiederverwendet, ist `type(sim).__name__ == "PSimulator"`. Das OTX-Klassen-Label für OID 0 ist aber `ASimulator`. Roundtrip-Reload klassifizierte das Sim daher als `unsupported`.
- **Fix:** `adopt_oids_from_instances(instances, original_otx=None)` zieht jetzt das Klassen-Label aus `original_otx.by_oid[oid].klass` wenn verfügbar; fällt sonst auf `type(obj).__name__` zurück. `OtxWriter.write` reicht `original_otx` an die Adopt-Methode durch.
- **Files modified:** `engine/src/osim_engine/io/otx_writer.py` (`adopt_oids_from_instances`, `write`).
- **Commit:** Bestandteil des Task-2-Commits `4784a52`.

**2. [Rule 3 - Blocking] Fixture-Pfad-Korrektur in conftest**

- **Found during:** Task 2, Setup der Roundtrip-Tests.
- **Issue:** Plan-Text und CONTEXT.md verwiesen auf `C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\Vorstellung04\` als Fixture-Pfad. Dieser Pfad existiert nicht — die Beispielmodelle liegen direkt unter `OSim2004\Vorstellung04\` (kein `OSimV01(Fj)` Zwischenordner).
- **Fix:** `conftest.py` nutzt `Path("C:/Users/JörgWFischer/PycharmProjects/OSim2004/Vorstellung04")` als Basis. Tests skippen sauber, wenn der Pfad nicht reachable ist (`pytest.skip(...)`).
- **Commit:** Bestandteil des Task-2-Commits `4784a52`.

**3. [Rule 2 - Critical] Primär-Fixture aus dem Engine-Repo statt nur OSim2004**

- **Found during:** Task 2, Test-Design.
- **Issue:** Plan-Text wollte Roundtrip-Tests primär gegen externe Dateien aus OSim2004 — aber diese sind nicht in CI verfügbar. Eine voll-grüne Test-Suite ohne externe Fixtures ist Pflicht (CI-Stabilität).
- **Fix:** Roundtrip-Tests laufen primär gegen `tests/fixtures/otx/embb_pre_run.otx` (in-repo, immer verfügbar, ~1480 OIDs). Zusätzlich opt-in gegen Dummy.otx und Fertigungsstruktur1_mit_AslFj.otx via Skip-Mechanik. Drei reale Modelle wurden tatsächlich (lokal) verifiziert — kein Skip war nötig.

## Format-Festlegungen (für nachfolgende Wellen)

- **Header:** `OIDArray|N!\n` mit N = Anzahl deklarierter Objekt-Zeilen.
- **Objekt-Zeile:** `#Klasse|attr;wert|...|m_dwObjID;MS_OID(Klasse);<oid>|$M;ref1;..;refM|!`
  - oder `$!` als Kombinations-Token, wenn `M == 0`.
- **OID-Annotation** wird vom Writer immer als letzte Property direkt vor dem Basis-Abschluss `$N;...` geschrieben (Konvention: vorhersehbarer Reader-Pfad).
- **Tuple-Werte:** `(a,b,...)` ohne Whitespace (z.B. `(-1,-1)`, `(255,128,0)`).
- **Encoding-Kontrakt:** Output ist `str`. Konsument schreibt mit `path.write_text(text, encoding="latin-1")`.

## Risk-Mitigations

- **Format-Reverse-Engineering:** Wie im Plan-Risk gefordert wurde der Format-Reader `otx_reader.py` Zeile-für-Zeile gelesen, bevor der Encoder geschrieben wurde. Mini-Modell-Tests (`test_format_object_round_trips_via_reader_*`) verifizieren Reader-Symmetrie auf Token-Ebene, bevor die Full-Roundtrip-Tests auf Dummy.otx skaliert wurden.
- **OID-Stabilität:** Mitigation via `adopt_oids_from_instances` — Roundtrip ist nicht nur semantisch sondern strukturell OID-stabil, solange `LoadResult.instances` mitkommt. Tests prüfen auf Klassen/Counter-Ebene, nicht auf OID-Ebene (siehe `otx_diff.py` Konvention).
- **Fixtures-Verfügbarkeit:** Primär-Fixture im Repo, Sekundär-Fixtures mit `pytest.skip` — CI bricht nie wegen fehlender OSim2004-Files.
- **Unsupported-Passthrough korrumpiert File:** Pass-Through übernimmt nur die geflateneten `sub_refs` (alle Basisklassen-Blöcke gemerged) — keine Property-Werte aus dem Original. Damit kann ein beschädigtes Original keine erweiterten Format-Felder ins neue File schmuggeln.

## Self-Check: PASSED

- `engine/src/osim_engine/io/otx_writer.py` — FOUND (~1000 Zeilen, deutlich über 150-Zeilen-Minimum)
- `engine/tests/unit/io/test_otx_writer.py` — FOUND (20 Tests, alle grün)
- `engine/tests/integration/io/test_otx_roundtrip.py` — FOUND (8 Tests, alle grün)
- `engine/tests/integration/io/conftest.py` — FOUND
- Commit `96d0f9f` (`feat(engine-io): add OTX writer foundation (plan 01-01 task 1)`) — FOUND
- Commit `4784a52` (`feat(engine-io): add OTX writer handler family + roundtrip tests (plan 01-01 task 2)`) — FOUND
- Re-Export `from osim_engine.io import dump_simulator_to_otx` funktioniert — FOUND
- Verification-Step 1 (Unit-Tests) — PASSED (20/20)
- Verification-Step 2 (Integration-Tests) — PASSED (8/8)
- Verification-Step 3 (Smoke-Test Dummy.otx) — PASSED (97478 chars output, coverage 1.000)
- Verification-Step 4 (Ruff) — PASSED (All checks passed)

## Nächste Welle

Welle 0 ist abgeschlossen. Welle 1 (Plan 01-02, Backend-Foundation) kann starten — der Save-back-Pfad ist nun durchgängig: Browser-Edit → JSON-Tree → Server → PSimulator → `dump_simulator_to_otx` → Storage.
