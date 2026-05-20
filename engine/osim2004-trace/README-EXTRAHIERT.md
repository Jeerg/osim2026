# Provenienz-Tabelle für osim2004-trace

Jede `.c`-/`.h`-Datei in diesem Subfolder ist wörtliche Extraktion aus
OSim2004. Diese Tabelle dokumentiert genau, welche Datei aus welcher
Quelle stammt und was sich geändert hat.

**Quell-Repository**:
`C:/Users/JörgWFischer/PycharmProjects/OSim2004/OSimV01(Fj)/`

| Extracted-File | Source-File | Source-Zeilen | Δ (Änderungen gegenüber Original) |
|---|---|---|---|
| `common/lcg.h` | `inc/OVerteil.h` | 121 (`STD_KEIM`) | Klassen-Deklaration entfällt; LCG-State als globale Variablen `g_keim`, `g_anti`; freistehende Funktionen `zufall()`, `init_lcg()` |
| `common/lcg.c` | `OFC/OVerteil.cpp` | 60-71 (`Zufall()`) | `m_keim` → `g_keim`; `anti` → `g_anti`; sonst Bit-für-Bit identisch (Konstanten `AM`, `AA`, `X`, Reihenfolge `fmod(AA * keim + X, AM)`, Antithetisch-Branch) |
| `common/verteil.h` | `inc/OVerteil.h` | 139-149 | Funktions-Signaturen aus Klassen-Methoden herausgelöst |
| `common/verteil.c::vert_gleich` | `OFC/OVerteil.cpp` | 182-185 | identisch (direkter `zufall()`-Aufruf) |
| `common/verteil.c::vert_gleich_range` | `OFC/OVerteil.cpp` | 202-216 | identisch; nur `OVerteil::VertGleich()` → `vert_gleich()` |
| `common/verteil.c::vert_norm_calc` | `OFC/OVerteil.cpp` | 254-262 | identisch; **kritisch**: Reihenfolge `wert *= sqrt(2.0); wert *= (wert*wert/120.0 + 0.975) * sa;` exakt erhalten |
| `common/verteil.c::vert_norm` | `OFC/OVerteil.cpp` | 234-252 | identisch (Jeerg-Rejection); `VertNormCalc(0, sa)` mit `if (ew * -1 < wert) break;` |
| `common/verteil.c::vert_norm_grenz` | `OFC/OVerteil.cpp` | 306-318 | identisch; do/while mit Rejection auf `[min, max]` |
| `common/verteil.c::vert_expo` | `OFC/OVerteil.cpp` | 335-341 | identisch; **kritisch**: `while (wert <= 0.0) wert = zufall();` (nicht `vert_gleich()`!) |
| `common/verteil.c::vert_log_norm` | `OFC/OVerteil.cpp` | 368-377 | identisch; `vert_norm(0.0, 1.0)` für die Standard-Normal-Komponente |
| `lcg/main.c` | (neu, CLI-Wrapper) | — | CLI über `zufall()` aus `common/lcg.c` |
| `verteil/konstant.c` | `OSimBase/OVerteilung.cpp` | 32-35 (`OVerteilungKonstant`) | CLI; Methoden-Body ist `return m_wertBasis;` (kein LCG-Use) |
| `verteil/gleich.c` | `OSimBase/OVerteilung.cpp` | 43-46 (`OVerteilungGleich`) | CLI; ruft `wert_basis * vert_gleich()` |
| `verteil/normal.c` | `OSimBase/OVerteilung.cpp` | 54-57 (`OVerteilungNormal`) | CLI; ruft `vert_norm(ew, sa)` |
| `verteil/normal_grenz.c` | `OSimBase/OVerteilung.cpp` | 65-69 (`OVerteilungNormalGrenz`) | CLI; ruft `vert_norm_grenz(ew, sa, min, max)` |
| `verteil/expo.c` | `OSimBase/OVerteilung.cpp` | 77-80 (`OVerteilungExponential`) | CLI; ruft `vert_expo(ew, 0.0)` |
| `verteil/log_normal.c` | `OSimBase/OVerteilung.cpp` | 88-91 (`OVerteilungLogNormal`) | CLI; ruft `vert_log_norm(ew, sa)` |
| `verteil/expo_versch.c` | `OSimBase/OVerteilung.cpp` | 99-102 (`OVerteilungExponentialVersch`) | CLI; ruft `vert_expo(ew, rv)` |
| `eventpool/sorting.c` | `OSimBase/EventPoolDll.cpp` | 184-186 (Insert-Encoding) + 244-258 (RemoveFirst-Decoding) | nur das Sortier-SCHEMA `(time<<2)\|subTime`, ohne DLL-Linked-List (qsort statt linear-search; das ist äquivalent, weil die Encoding-Logik kompakt ist) |

## Was NICHT übernommen wurde

| OSim2004-Code | Begründung |
|---|---|
| `OFC/OVerteil.cpp::VertDreieck` (Z. 391-405) | Phase 2+ — Dreiecksverteilung wird in OSimPro genutzt, nicht in OSimBase |
| `OFC/OVerteil.cpp::VertBeta`/`VertBetaPERT`/`VertGamma` (Z. 420-579) | Phase 2+ |
| `OFC/OVerteil.cpp::Shuffle` (Z. 596-657) | Phase 2+ — wird nur in Auslöser-Pfaden gebraucht |
| `OFC/OVerteil.cpp::VertNorm_abDummy` (Z. 270-284) | Test-Dummy laut Quell-Kommentar — irrelevant |
| `OSimBase/EventPoolDll.cpp` — der DLL-Linked-List-Algorithmus | Python nutzt `heapq` (siehe SUPPLEMENT § 6.2); nur das Sortier-Schema ist portierungs-relevant |

## Verifikations-Strategie

Jede `.jsonl`-Output-Datei wird verglichen mit:
- entweder dem Output des Python-Reference-Generators (`python-reference/generate_fixtures.py`)
- oder, sobald ein C-Compiler verfügbar ist, dem Output dieser Mini-C-Binaries

Wenn beide Outputs Bit-für-Bit identisch sind, ist die Portierung
bit-genau zur C++-Referenz.
