# Skelett / Stub Inventory — osim-engine

Stand: 2026-05-28 (auto-extracted via graphify)

Diese Dateien enthalten Klassen/Methoden, die als **Skelett**, **Stub**, **TODO** oder **Placeholder** markiert sind — also bewusst nicht-portierte Slice-Reste aus der phasenweisen Portierung von OSim2004.

**Tests können grün laufen, ohne dass diese Slices echte Funktionalität haben** — Skeleton-Konstruktoren returnen leere Default-Werte. Wenn eine Test-Suite einen dieser Pfade nicht aktiv stimuliert, wird die fehlende Logik nicht aufgedeckt.

## Übersicht nach Porting-Slice

| Slice | Modul / Datei | Marker | Was fehlt |
|---|---|---:|---|
| **P5-D** | `decisions/aufgabe.py` | **27 Stubs** | Status/Block/Invert-State-Machine, Einsatz-Dauer-Arithmetik, Ress-Increment/Decrement, PRessBeleg-API, Knoten-Prozess-Iteration, ResetByTimespan, SetByTimespan2State |
| **P5-E** | `decisions/strategie_rsv.py` | 6 Stubs + 2 Skelette | Reservierungs-Strategie cpp:889-1543 (komplexe Zuordnung), ArbSuchen-Algorithmus konkret iter |
| **P5-F** | `decisions/strategie_eet.py` | 14 Skelette | Einsatzzeit-Tausch (EET): Gruppen-basierter Capacity-Swap, GiveKapTo, SearchBestRessFor, GetUmlFaktor, Tausch-Hauptberechnung cpp:1683-2900 |
| **P5-H** | `decisions/alternativ_elogik.py` | 3 Skelette | GetMinZeitbedarf, EntscheideZH (Zielhierarchie), EntscheideNWZ (Nutzwertanalyse) — heute alle "erste Alternative" |
| **P5-K** | `decisions/aco.py` + `pps/ausloeser/aco_ant.py` | 5 + 7 Skelette | ACO (Ant Colony) komplett: WegWhlReihenfolge/Split/Logik, EinLogik, ACOPrioregelKOZ, GetSplitMenge, OnFillSplitAmount |
| **P5-L** | `generator/generator.py` | 8 Stubs + 4 Skelette | Generator-File-Format: Write/InterpretPSimGeneratorFile, StartGeneration, SuspendGeneration, ResetSimulation, StartSimulation, SetProperty2Lauf, GetAZTag, CountBreaks, GetPauseZeit |
| **P5-M** | `azeit/*.py` (6 Klassen) | 2+ visible Markers (alle azeit/-Klassen Skelett) | Arbeitszeit-Modell: AAusloeser, AEinsatzzeitWunsch, AGruppe, AKapBedViewerInfo, APerson, ASimulator — Konstruktoren + Stub-Body |
| **N/A** | `pps/knoten/extern.py`, `pps/prozess/extern.py`, `pps/prozess/ruesten.py` | je 1-2 Stubs | Externe-Steuerung-Knoten/Prozess (im C++ bereits oft leer/abstract) — `proz_weitergeben` Stub |
| **N/A** | `resources/assoziation/speicher.py` | 1 Stub | `RemovePSimObj` returns FALSE (C++-Kompat) |
| **legacy** | `pps/simulator.py` | 1 Stub | Backwards-Kompat-Stub, durch PGenerator ersetzt |

## Konsequenz für die Test-Strategie

- Tests, die nur **Engine-Core** (event-loop, period-management) ausführen, decken **keine** dieser Lücken auf.
- Tests, die **Domain-Logik** triggern (Auftragsdurchlauf, Ressourcen-Zuordnung, Arbeitszeitmodell, ACO-Wegwahl, Generator-Init), würden bei aktivem Code in die Stubs laufen — heute mit silent-default-return.

Empfohlene Reihenfolge zum Schließen der Lücken (von wenig zu viel Aufwand):
1. **P5-L Generator-File-IO** — Engineering-low-risk, eindeutiges File-Format
2. **P5-D Aufgabe-Status-Machine** — größte Stub-Konzentration, ein zusammenhängendes Stück
3. **P5-M azeit/-Modul** — vom Domain her klar abgrenzbar
4. **P5-H Alternativ-Logik** — algorithmisch klein, aber Verhaltens-relevant
5. **P5-F EET-Strategie** — komplex, viele Skelette mit interner Abhängigkeit
6. **P5-K ACO** — heuristik-heavy, Test-Aufwand hoch
7. **P5-E RSV-Strategie** — größte fachliche Komplexität

## Reproduktion

```bash
# Aus osim-engine root:
python graphify-out/.tmp_skeletons.py
# oder
graphify query "skelett stub placeholder" --budget 2000
```

Das `.tmp_skeletons.py`-Skript filtert Knoten-Labels nach Skelett/Stub/TODO/placeholder-Patterns. Die kanonische Quelle ist der Code selbst (Docstring-Marker) — diese Liste ist auto-extracted, keine händische Pflege.
