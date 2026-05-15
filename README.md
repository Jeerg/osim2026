# osim-engine

Headless Discrete-Event-Simulator (process-flow auf Knoten-Kanten-Graphen). Reengineering von OSim2004 auf Basis der Dissertation **Uwe Jonsson (2003) — "Auf dem Weg zur integrierten Simulation von Produktionssystemen"** (Uni Karlsruhe, IfAB).

## Designprinzipien

- **Standalone-Library**, keine Datenbank, kein Webservice.
- **Input:** JSON-Datei (deserialisiert in Pydantic-Klassen).
- **Output:** Event-Stream als JSONL (append-only) + End-Ergebnis-JSON mit KPIs.
- **Domain-agnostisch:** der Kern weiß nur Knoten/Kanten/Prozesse/Zeit, keine PPS-Spezifika.
- **Sukzessive Modellierung** als Designprinzip (Jonsson Kap. 1.1): minimal lauffähig sind nur Durchlaufpläne + Auslöser; Ressourcen, Aktoren, Entitäten, Hierarchie kommen schrittweise dazu, ohne Bestehendes zu brechen.

## Architektur

```
src/osim_engine/
├── model/        Pydantic-Datenmodell (JSON-serialisierbar)
├── engine/       Sim-Loop, Event-Heap, Lifecycle-Methoden
├── kpi/          Post-Processing aus Event-Log + Modell
└── io/           JSON-Loader, .otx-Konverter (für Jonssons Originaldaten)
```

## Status

Spike-Phase. Stand:

- [ ] Pydantic-Modell (Plan, Node, Edge, Trigger, Distribution)
- [ ] Engine-Loop (heapq, Period, Lifecycle)
- [ ] Recorder (JSONL)
- [ ] KPI-Aggregator (AFA, AFK, MDZ, MDK)
- [ ] Jonssons 4-Knoten-Beispiel als Smoke-Test
- [ ] .otx-Reader
- [ ] test.otx durch Engine

## Roadmap

Schichten gemäß Jonssons 5 Bausteinen:

1. **Phase 1 — Sim-Kern** (aktuelle Phase): Durchlaufpläne, Knoten, Kanten, Auslöser, Verteilungen, KPI-Basis.
2. **Phase 2 — Passive Ressourcen:** Belegungs- und Mengenressourcen, Assoziationen, Einsatzzeiten, Prozesskosten.
3. **Phase 3 — Aktive Ressourcen:** Aktoren, Prozessspeicher.
4. **Phase 4 — Prozessentitäten:** persistente Entities (passiv / extern).
5. **Phase 5 — Hierarchisierung:** verschachtelte Pläne, Ressourcenkollektionen, Kopplungsknoten.

## Quellen

- `../OSim2004/docs/dissertations/jonsson-300.pdf` — Hauptquelle, Diss Uwe Jonsson 2003
- `../OSim2004/` — alte C++-Codebasis als Referenz
- `../OSim2004/Vorstellung04/*.otx` — Realdaten als Validierungs-Fixtures
