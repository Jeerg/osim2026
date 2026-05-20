# osim2004-trace

Mini-C-Programme, die Bit-für-Bit identische Outputs zum OSim2004-C++-Code
produzieren — als **goldene Referenz** für die Diff-Tests in
[`docs/CONTEXT-P1-DIFFTEST.md`](../docs/CONTEXT-P1-DIFFTEST.md).

**Was hier NICHT liegt**: kein vollständiger OSim2004-Build. Nur die
deterministischen Kernel-Routinen (LCG, Verteilungen, EventPool-Sortierung),
**ohne** MFC, **ohne** OFC, **ohne** ObjectBase, **ohne** UI-Schichten.

---

## Wozu

OSim2004 (das Original-C++/MFC-Projekt) lässt sich nicht mehr ohne VC6-
Toolchain bauen. Damit ist ein direkter End-to-End-Lauf-Vergleich (Option A
in `CONTEXT-P1-DIFFTEST.md`) nicht möglich.

**Aber**: die Stochastik (LCG + 7 Verteilungs-Subtypen) und der EventPool
sind kompakte, autonome Code-Stücke, die wir aus den `.cpp`-Files extrahieren
und mit modernem Compiler bauen können. Die produzierten `.jsonl`-Traces
werden unter `tests/diff/fixtures/` committed und dienen als Bit-genaue
Referenz für die Python-Portierung.

Trade-off: dieses Subprojekt deckt nur die **deterministischen Schichten**
ab. Sim-Pfad-Counter und KPIs bleiben weiterhin via Hand-Trace und Property-
Tests validiert (siehe DIFFTEST.md § 4-5). Falls das nicht reicht, wird in
V2/V3 über Option D (komplette OSim-Resurrection) entschieden.

---

## Modul-Layout

```
osim2004-trace/
├── README.md                       # dieses File
├── Makefile                        # MinGW-gcc / clang Build (Linux/macOS/Windows)
├── build.bat                       # MSVC cl.exe Build (Windows)
├── common/
│   ├── lcg.h                       # OVerteil::Zufall() inline
│   └── lcg.c
├── lcg/
│   └── main.c                      # CLI: Seed + N → JSONL erste N LCG-Samples
├── verteil/
│   ├── konstant.c
│   ├── gleich.c
│   ├── normal.c                    # Box-Müller Sum-of-6 + Polynom-Korrektur
│   ├── normal_grenz.c              # Jeerg-Rejection
│   ├── expo.c
│   ├── log_normal.c
│   └── expo_versch.c
├── eventpool/
│   └── sorting.c                   # synthetische Insert/Pop-Sequenz
└── README-EXTRAHIERT.md            # für jede Datei: aus welchem OSim2004-File extrahiert,
                                    # welche Zeilen, was geändert (Stubs etc.)
```

---

## Source-Provenienz

Jede `.c`-Datei in diesem Subfolder ist **wörtliche Extraktion** aus einer
OSim2004-`.cpp`-Datei, mit minimalen Anpassungen:

- MFC-Headers entfernt (`#include <afxwin.h>`, etc.)
- `OSimulator::s_verteil` → globale `g_keim`-Variable
- `oprX` Smart-Pointer → normale `X*`
- `OBaseObj`-Vererbung weggelassen, alles `struct`/freestanding-Funktionen
- `throw new OException` → `fprintf(stderr, ...); exit(1)`

**Welche Datei aus welcher Quelle**, dokumentiert in
`README-EXTRAHIERT.md` (eine Tabelle: extracted-file → source-file, line-
range, deltas).

**Wichtig**: die Stochastik-Routinen werden **nicht inhaltlich verändert** —
nur Boilerplate-Stub-Layer. Konstanten, Operatoren-Reihenfolge, Klammerung
bleiben Bit-für-Bit identisch zum Original.

---

## Bauen

### Variante 1: MinGW / clang (POSIX-Make)

```bash
cd osim2004-trace
make all
# erzeugt osim2004-trace/bin/lcg, osim2004-trace/bin/verteil_normal, etc.
```

### Variante 2: MSVC (Windows)

```cmd
cd osim2004-trace
build.bat
REM erzeugt osim2004-trace\bin\lcg.exe, ...
```

**Compiler-Anforderungen**:
- ANSI-C99 (`fmod`, `sqrt`, `log`, `exp`)
- Kein C++. Kein STL. Kein MFC.
- Empfohlen: gcc/clang ≥ 7, MSVC ≥ 2015. Getestet auf:
  - MinGW-w64 gcc 13.2 (Windows)
  - clang 17 (macOS)
  - MSVC `cl.exe` aus VS 2022 (Windows)

---

## Fixtures generieren

Nach Build:

```bash
# Erstellt alle Referenz-Traces unter tests/diff/fixtures/
make fixtures
```

Generiert (Stand V1-Plan):

```
tests/diff/fixtures/
├── lcg_10000_seed1776496601.jsonl                          # 10k LCG-Samples, Default-Seed
├── lcg_10000_seed42.jsonl                                  # 10k LCG-Samples, alt-Seed
├── verteil_konstant_5_seed1776496601.jsonl
├── verteil_gleich_10_seed1776496601.jsonl
├── verteil_normal_ew100_sa10_seed1776496601.jsonl
├── verteil_normal_ew0_sa1_seed1776496601.jsonl
├── verteil_normal_ew500_sa50_seed1776496601.jsonl
├── verteil_normal_grenz_ew100_sa20_min50_max200_seed1776496601.jsonl
├── verteil_expo_lambda01_seed1776496601.jsonl
├── verteil_log_normal_ew100_sa10_seed1776496601.jsonl
├── verteil_expo_versch_lambda01_versch10_seed1776496601.jsonl
└── eventpool_synthetic_sequence.jsonl                      # bekannte Insert/Pop-Sequenz
```

Größenordnung: ~12 Files × 1-2 MB = ~20 MB total. Wird committed (die
Reproduzierbarkeits-Garantie hängt daran, dass die Files stabil sind).

**Wann neu generieren?** Nur, wenn jemand am Mini-C-Code etwas ändert. Dann
muss eine Begründung in der Commit-Message stehen, und die alten Files werden
durch `git diff` gegen die neuen geprüft (sollten identisch sein — sonst hat
sich der Code unkontrolliert verändert).

---

## Output-Format

JSONL, eine Zeile pro Sample. Kompakt, ohne Spaces:

```
{"call_no":0,"keim_before":1776496601.0,"keim_after":3147873506.0,"result":0.7328765379078627}
{"call_no":1,"keim_before":3147873506.0,"keim_after":2517548089.0,"result":0.5861023459732533}
```

Float-Präzision: `%.17g` (volle IEEE-754 double — 17 signifikante Stellen
garantieren Round-Trip).

---

## Verifikations-Test in Python

Siehe `tests/diff/test_lcg_bit_exact.py`. Kurzform:

```python
def test_lcg_first_10000_samples_match_cpp():
    reset_keim(STD_KEIM)
    with open("tests/diff/fixtures/lcg_10000_seed1776496601.jsonl") as fh:
        for line in fh:
            ref = json.loads(line)
            assert s_verteil.zufall() == ref["result"]
```

Wenn dieser Test grün ist, ist Bit-Reproduzierbarkeit auf LCG-Ebene
zwischen Python und der goldenen C-Referenz **bewiesen**.

---

## Status

| Komponente | Status | Wann geplant |
|---|---|---|
| `lcg/main.c` | TODO | C0-S (vor V1) |
| `verteil/*.c` (7 Subtypen) | TODO | C0-S |
| `eventpool/sorting.c` | TODO | V1 |
| `Makefile` | TODO | C0-S |
| `build.bat` | TODO | C0-S |
| Fixtures generiert + committed | TODO | C0-S |
| Diff-Tests in `tests/diff/` aktiv | TODO | C0-S |

Pflicht-Vorarbeit für V1. Erst danach kann V1 selbst starten.
