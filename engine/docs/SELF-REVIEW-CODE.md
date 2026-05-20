# Self-Review-Findings — Python-Code (Claude, intern)

**Reviewer:** Claude (Opus 4.7) — **NICHT** Cross-AI-Review
**Datum:** 2026-05-17
**Auftrag:** Lückenfüller bis Codex-Findings vorliegen. Self-Review ist
keine vollständige unabhängige Überprüfung.

**Methodik:** 10 heikle Stellen aus `REVIEW-REQUEST-CODE.md` durchgegangen,
nur dort Findings notiert wo eine echte Lücke / ein echter Bug / eine
fehlende Dokumentation aufgefallen ist. Sparsame Findings, ehrliche
Bewertung. Bestätigungen ("alles OK") werden nicht aufgelistet.

---

## HIGH (1)

### H1: VertNorm-Fallback bei 10000 Rejections gibt `2*ew` zurück, nicht `ew`

**Wo:** `src/osim_engine/core/distribution.py::OVerteil.vert_norm` Z. 138-152
**C++:** `OFC/OVerteil.cpp:234-252`

**Befund:** Bei 10000 fehlgeschlagenen Jeerg-Rejections wird `wert = ew`
gesetzt. Dann `return ew + wert` → `2*ew`. C++ macht das identisch
(`if (n >= 10000) wert = ew; ... return ew + wert;`). Das ist
mit hoher Wahrscheinlichkeit ein C++-Bug — der Intent war wohl `return ew`.

**Bewertung:** 1:1 portiert, also Bit-Treue gewährleistet. Aber **NICHT
in `REVIEW-MAPPING.md` § Bekannte C++-Eigenheiten dokumentiert** — sollte
da rein.

**Empfehlung:** REVIEW-MAPPING.md ergänzen. Code-Verhalten nicht ändern.

---

## MED (3)

### M1: PtProzDurchlaufplan.bearbeit_beenden überspringt SucheUnterprozesseInPList-Check

**Wo:** `src/osim_engine/pps/prozess/durchlaufplan.py::bearbeit_beenden`
**C++:** `OSimPro/PtProzess.cpp:686-702`

**Befund:** C++ macht einen Konsistenz-Check `if (SucheUnterprozesseInPList()>1)
throw OException`. Wir haben das als Kommentar weggelassen ("in den Tests
ist garantiert dass alle Unter-Prozesse vor dem PtProzDurchlaufplan
beendet sind"). Bei einem Bug in Phase 2-5 (z. B. Ressourcen-Konflikt
lässt Prozess in Knoten-Liste hängen) würde Python silent das falsche
Verhalten tolerieren — C++ würde mit OException sofort aufhalten.

**Empfehlung:** Konsistenz-Check als RuntimeError einbauen. Aufwand:
~10 Zeilen. **Vor Phase 2 fixen** — Ressourcen-Layer wird genau diesen
Pfad belasten.

### M2: PDurchlaufplan._calc_krit_weg_rek hat keinen Zyklus-Schutz

**Wo:** `src/osim_engine/pps/durchlaufplan.py::_calc_krit_weg_rek`
**C++:** `OSimPro/PDurchlaufplan.cpp:249-305`

**Befund:** Bei zyklischem Plan-Graph läuft die Rekursion endlos. C++ hat
auch keinen Schutz — Voraussetzung ist DAG. In Python (mit
Rekursions-Limit) würde das `RecursionError` werfen, was unklar zu
debuggen ist.

**Empfehlung:** Optional eine DAG-Validierung in `PDurchlaufplan.add_kante`
oder `PDurchlaufplan.set_start_kante` (z. B. topologische Sortierung-Check
beim Build). Aufwand: ~30 Zeilen. **Kann warten bis nach Phase 2**.

### M3: `_RootProzOber` als V1-Fallback ist obsolet seit V2

**Wo:** `src/osim_engine/pps/ausloeser/base.py::_RootProzOber`

**Befund:** V1-Tests nutzen direkten Auslöser → Knoten-Pfad ohne
PDurchlaufplan. Dafür gibt es den `_RootProzOber`-Hack. Seit V2
gibt es echte `PDurchlaufplan`-Container. Der V1-Pfad ist nur noch
durch V1-Tests (`test_v1_smoke.py`) am Leben.

**Empfehlung:** V1-Tests auf V2-Stil umstellen (1-Knoten-Plan mit
echtem PDurchlaufplan), dann `_RootProzOber`-Branch ersatzlos streichen.
Aufwand: ~30 Zeilen Test-Änderungen + ~20 Zeilen Code-Cleanup. **Kann
warten — kein funktionales Problem**.

---

## LOW (4)

### L1: Kein expliziter Test für `simulator.suspend()` + Resume

`test_simulator_lifecycle.py` deckt `reset()` ab, aber nicht `suspend()` +
Wiederaufnahme via `start()`. Phase 1 nutzt das nicht aktiv, aber für
"echte" Anwendungen wichtig.

### L2: Kein Performance-Benchmark

`tests/perf/` ist im Plan (CONTEXT-P1-EVENTBUS.md § Performance-Budget),
aber leer. Bei 10⁴ Events sollten Sim-Loops klar unter 1s laufen — kein
Beweis bisher.

### L3: PProzessDLL hat O(n) `remove` und `find`

C++ intrusive DLL ist O(1) für `Remove`. Python-Backing-Store-list nicht.
Bei einer Warteschlange `m_oWarteSchl` mit >1000 hängenden Prozessen
spürbar. Phase 2 (Ressourcen-Blockierung) wird das relevant — beobachten.

### L4: TUI/Counter/Websocket-Sinks nicht implementiert

Im CONTEXT-P1-EVENTBUS.md § 4 spezifiziert (V1+), aktuell nur JsonlSink
+ TraceCaptureSink implementiert. Andere Sinks sind Phase 2+ — nicht
blockierend.

---

## Was vor Phase 2 fixen

**Empfehlung: nur M1** (SucheUnterprozesseInPList-Check). Aufwand 10 min,
verhindert schwer debuggierbare Phase-2-Bugs.

H1 ist nur Dokumentations-Nachtrag — kann zusammen mit Phase 2 erledigt
werden.

Alles andere darf warten bis Codex-Findings oder Phase 3.

---

## Vorbehalte

- **Self-Review hat blinden Fleck**: ich habe den Code geschrieben, kann
  meine eigenen Annahmen nicht hinterfragen. Echter Codex-Review wird
  Findings produzieren, die ich nicht sehe.
- **Keine bit-genaue C++-Verifikation**: Stand 2026-05-17 ist kein
  C-Compiler installiert, Fixtures sind Python-Reference-Output.
- **Keine reale `.otx`-Datei** als Validierungs-Korpus.
