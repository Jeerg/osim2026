# osim-engine

**1:1-Portierung der OSim2004-C++-Codebase nach Python, headless (ohne UI).**

## Designprinzip

> Den existierenden Code übertragen — nichts neu erfinden. Keine Theorie-Vorlage
> als Implementierungs-Referenz.

Quelle: `C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\`. Die
zugehörige Dissertation (Uwe Jonsson 2003) ist nur **Begleitmaterial zum
Verstehen**, nicht die Implementierungs-Vorlage.

## Was übernommen wird

- `OSimBase/` — Sim-Kern (`OSimObj`, `OSimulator`, `OVerteilung`)
- `OSimPro/` — PPS-Domain (`PSimulator`, `PDurchlaufplan`, `PDlplKnoten`, …)
- `OSimAZeit/` — Auftragszeit-Modul
- `OSimINSIGHTS/` — Reporting

## Was raus muss

- UI-Schichten: `OFC/`, `OGfx*`, `*DesignView`, `OMetaViewer*`
- Reflektion: `ObjectBase/`, `.odh`-DSL, `odhc`-Compiler — durch Python-Klassen ersetzt
- Persistenz via `OArchive` — durch JSON ersetzt

## Datenmodell-Strategie

- **Plain Python-Klassen mit Vererbung** als Engine-Klassen (1:1 wie in C++)
- **Pydantic nur am IO-Rand** (JSON-Load/Dump, Konfig-Validierung)

## Stochastik

Der PAWLICEK-LCG aus `OFC/OVerteil.cpp` wird **bit-genau** portiert. Die exakten
Konstanten `AA=6636085.0`, `X=907633385.0`, `AM=2^32` und die Reihenfolge der
`VertGleich()`-Aufrufe in Box-Müller etc. sind Teil des Reproduzierbarkeits-
Vertrags — **kein NumPy/SciPy** für die Stochastik.

## Status

Spike-Reset (2026-05-15). Vollständiger Portierungs-Plan in
[`docs/porting-plan.md`](docs/porting-plan.md).

Behalten aus dem ersten Versuch:
- `engine/event_heap.py` — heapq-Wrapper
- `engine/recorder.py` — JSONL-Stream
- `io/otx_reader.py` — Parser für `.otx`-Format (funktioniert für 252-Objekt-Files)
- `io/json_loader.py` — Skelett
