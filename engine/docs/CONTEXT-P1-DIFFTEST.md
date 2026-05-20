# CONTEXT-P1-DIFFTEST — Test- und Diff-Strategie

**Stand:** 2026-05-17
**Bereich:** Validierung der Python-Portierung gegen OSim2004
**Status:** Strategie-Kontrakt für Phase 1 — wird in V1/V2 angewandt, vor V3
neu bewertet (Option-D-Trigger)
**Verwandt:** [`CONTEXT-P1-EVENTBUS.md`](CONTEXT-P1-EVENTBUS.md) (liefert
`TraceCaptureSink`-Substrat),
[`CONTEXT-P1-SUPPLEMENT.md`](CONTEXT-P1-SUPPLEMENT.md) § 6.4 (Slice-Plan)

---

## Ausgangslage

**OSim2004 als Referenz-Implementierung baut nicht mehr** (VC6/MFC-Projekt
aus 2003–2005). Inspektion am 2026-05-17 zeigte:

- Keine `.protokoll`-/`.dump`-/`.log`-Files mit deterministischen Sim-Outputs
  im Repo (`OsimLog.txt` ist nur UI-Debug-Spam)
- Keine vorgenerierten Referenz-Traces

Damit fällt der "End-Zustände aus Protokoll-Files vergleichen"-Pfad weg,
**bevor wir ihn beschreiten konnten**.

**Sekundär-Referenz vorhanden**: die Dissertation Jonsson 2003 enthält
numerische Tabellen mit Sim-Ergebnissen (siehe § 5). Sie sind kein bit-genauer
Vergleich, aber Plausibilitäts-Anker.

---

## Strategie pro Schicht

| Schicht | Methode | Bit-genau? | Werkzeug |
|---|---|---|---|
| **LCG (`OVerteil::Zufall`)** | Mini-C-Programm-Output gegen Python | **ja** | `osim2004-trace/lcg/` |
| **Verteilungen (7 Subtypen)** | Mini-C-Programm gegen Python | **ja** | `osim2004-trace/verteil/` |
| **Event-Pool (Sortierung)** | reine Algorithmik, Unit-Test | **ja** | pytest |
| **Sim-Pfad-Counter** | Hand-Trace `test.otx` + Property-Tests | nein | pytest + Papier |
| **KPIs am Sim-Ende** | Property-Tests + Diss-Tabellen | nein | pytest + Hypothesis |
| **Trace-Konsistenz** | Python-zu-Python-Regression | ja (innerhalb Python) | `TraceCaptureSink` |

Die ersten drei Zeilen geben **harte Garantien** (Bit-Reproduzierbarkeit). Die
letzten drei sind **weiche Garantien** (Plausibilität, Konsistenz, keine
Regression).

---

## § 1 — LCG bit-genau via Mini-C-Programm

### Was ist zu vergleichen

Der PAWLICEK-LCG (siehe `CONTEXT-P1-osimbase.md` §"OVerteil — PAWLICEK-LCG"):

```c++
double OVerteil::Zufall() {
    const double AM = 4294967296.0;     // 2^32
    const double AA = 6636085.0;
    const double X  = 907633385.0;
    m_keim = fmod(AA * m_keim + X, AM);
    return m_keim / AM;
}
```

Konstanten: `AA=6636085.0`, `X=907633385.0`, `AM=2^32`, `STD_KEIM=1776496601.0`.

### Mini-C-Programm

Liegt in `osim2004-trace/lcg/`. Kompiliert mit jedem ANSI-C-Compiler
(MinGW-gcc, MSVC `cl.exe` ≥ VS2015, clang). **Kein MFC, kein OFC, kein
ObjectBase**.

```c
/* osim2004-trace/lcg/main.c */
#include <stdio.h>
#include <math.h>

int main(int argc, char *argv[]) {
    const double AM = 4294967296.0;
    const double AA = 6636085.0;
    const double X  = 907633385.0;
    double keim = (argc > 1) ? atof(argv[1]) : 1776496601.0;
    long n_samples = (argc > 2) ? atol(argv[2]) : 10000;

    for (long i = 0; i < n_samples; i++) {
        double keim_before = keim;
        keim = fmod(AA * keim + X, AM);
        printf("{\"call_no\":%ld,\"keim_before\":%.1f,\"keim_after\":%.1f,\"result\":%.17g}\n",
               i, keim_before, keim, keim / AM);
    }
    return 0;
}
```

### Verifikation in Python

```python
# tests/diff/test_lcg_bit_exact.py

import json, subprocess
from pathlib import Path
from osim_engine.core.distribution import s_verteil, reset_keim, STD_KEIM

REF_TRACE = Path(__file__).parent / "fixtures" / "lcg_10000.jsonl"


def test_lcg_first_10000_samples_match_cpp():
    """LCG-Output muss Bit-für-Bit identisch zur Referenz-Trace sein."""
    reset_keim(STD_KEIM)
    with REF_TRACE.open() as fh:
        for ref_line in fh:
            ref = json.loads(ref_line)
            python_result = s_verteil.zufall()
            assert python_result == ref["result"], (
                f"LCG-Divergenz bei Call {ref['call_no']}: "
                f"Python={python_result!r} vs C++={ref['result']!r}"
            )
            assert s_verteil._keim == ref["keim_after"]
```

**Voraussetzung Bit-Gleichheit in Python**: `fmod` in Python (`math.fmod`)
entspricht IEEE-754 `fmod`, das gleiche Verhalten wie C `fmod`. **Wichtig**:
**nicht** Python `%` verwenden (verhält sich bei negativen Operanden anders).
Konstanten in Python als `float` (Default in Python 3), nicht `int`.

---

## § 2 — Verteilungen bit-genau via Mini-C-Programm

### Was ist zu vergleichen

Die 7 Subtypen von `OVerteilung`. Jeder ruft `s_verteil.VertGleich()` bzw.
seine subtyp-spezifische Routine (`VertNormCalc`, `VertExpo`, etc.) auf, deren
Output sich deterministisch aus dem LCG-Stream ergibt.

### Mini-C-Programm pro Subtyp

Liegt in `osim2004-trace/verteil/`. Pro Subtyp eine `.c`-Datei, die
Konstruktor-Parameter + Sample-Anzahl per CLI nimmt:

```c
/* osim2004-trace/verteil/normal.c */
/* Inline-Verteilungs-Code aus OFC/OVerteil.cpp + OSimBase/OVerteilung.cpp */
/* (extrahiert, kompilierbar ohne MFC) */

int main(int argc, char *argv[]) {
    double ew = atof(argv[1]);          // Erwartungswert
    double sa = atof(argv[2]);          // Standardabweichung
    long n   = atol(argv[3]);           // Anzahl Samples
    long keim = atol(argv[4]);          // Seed

    init_lcg(keim);
    for (long i = 0; i < n; i++) {
        double sample = vert_normal(ew, sa);
        printf("{\"call_no\":%ld,\"sample\":%.17g}\n", i, sample);
    }
    return 0;
}
```

### Verifikation in Python

```python
# tests/diff/test_verteil_normal_bit_exact.py

import json, pytest
from osim_engine.core.distribution import s_verteil, reset_keim, STD_KEIM
from osim_engine.core.verteilung import VerteilungNormal

@pytest.mark.parametrize("ew,sa", [(100.0, 10.0), (0.0, 1.0), (500.0, 50.0)])
def test_normal_distribution_bit_exact(ew, sa):
    reset_keim(STD_KEIM)
    v = VerteilungNormal(wert_basis=ew, std_abweich=sa)
    ref_path = REF_DIR / f"normal_ew{ew}_sa{sa}.jsonl"
    with ref_path.open() as fh:
        for ref_line in fh:
            ref = json.loads(ref_line)
            assert v.hole_zufallswert() == ref["sample"]
```

### Fixtures-Generierung

Einmaliger Schritt: `osim2004-trace/` baut + erzeugt alle Referenz-Traces als
`.jsonl`-Files, die unter `tests/diff/fixtures/` committed werden.
Reproduzierbar via `osim2004-trace/Makefile` oder `build.bat`.

**Größenordnung**: pro Verteilungs-Subtyp 10'000 Samples → ~1 MB JSONL → ~5 MB
total committed. Akzeptabel.

---

## § 3 — Event-Pool bit-genau via Unit-Test

Kein externes Input nötig. Reine Algorithmik:

```python
# tests/unit/test_event_pool_sorting.py

from osim_engine.core.event_pool import EventPool, OMetaEvent

class EvtA(OMetaEvent): m_subTime = 0; m_name = "A"
class EvtB(OMetaEvent): m_subTime = 1; m_name = "B"
class EvtC(OMetaEvent): m_subTime = 3; m_name = "C"


def test_same_time_different_subtime_orders_by_subtime():
    pool = EventPool()
    pool.insert(EvtC(), obj=None, ezeit=1000)
    pool.insert(EvtA(), obj=None, ezeit=1000)
    pool.insert(EvtB(), obj=None, ezeit=1000)

    assert pool.remove_first().meta.m_name == "A"   # subTime=0 first
    assert pool.remove_first().meta.m_name == "B"   # subTime=1
    assert pool.remove_first().meta.m_name == "C"   # subTime=3


def test_same_time_same_subtime_fifo():
    pool = EventPool()
    for i in range(5):
        evt = EvtA()
        pool.insert(evt, obj=f"obj_{i}", ezeit=1000)

    for i in range(5):
        assert pool.remove_first().obj == f"obj_{i}"


def test_combined_time_encoding_matches_cpp():
    """C++ EventPoolDll::Insert: eTime = (realTime << 2) | subTime."""
    pool = EventPool()
    pool.insert(EvtB(), obj="x", ezeit=100)         # combined = 401
    entry = pool._heap[0]
    assert entry[0] == (100 << 2) | 1
```

---

## § 4 — Sim-Pfad-Counter via Hand-Trace + Property-Tests

Hier wird es schwieriger ohne C++-Referenz. Zwei komplementäre Methoden.

### 4.1 Hand-Trace für `test.otx` (1 Knoten)

Der einfachste `.otx` ist klein genug für **Papier-Rechnung**. Vorgehen:

1. `test.otx` laden, die Modell-Struktur ausdrucken (1 Plan, 1 Knoten, 1
   Auslöser)
2. Auf Papier die ersten N Sim-Sekunden Schritt für Schritt durchspielen:
   - was steht zu welchem Zeitpunkt im Event-Pool?
   - welcher Counter wird wann inkrementiert?
   - welche Knoten-/Auslöser-KPIs zu Periode-Ende?
3. Python-Lauf mit `TraceCaptureSink` aktiviert
4. Python-Trace gegen Hand-Trace abgleichen

Liegt in `tests/diff/hand_trace/test_otx_1day.md` (Markdown mit Tabelle
zeitlicher Abfolge).

### 4.2 Property-basierte Tests (Hypothesis)

Eigenschaften, die immer gelten müssen, unabhängig vom Modell:

```python
# tests/property/test_sim_invariants.py

from hypothesis import given, strategies as st
from osim_engine import load_otx, run_simulation

@given(seed=st.integers(min_value=1, max_value=2**31 - 1),
       periods=st.integers(min_value=1, max_value=10))
def test_counter_monotonicity(seed, periods):
    """Counter dürfen nie sinken — sind kumulativ über den Sim-Lauf."""
    sim = load_otx("test.otx", seed=seed)
    snapshots = []
    for _ in range(periods):
        sim.run_period()
        snapshots.append({k.id: k.m_iPtkAusloesungCount for k in sim.all_knoten()})
    for s1, s2 in zip(snapshots, snapshots[1:]):
        for kid in s1:
            assert s2[kid] >= s1[kid]


@given(seed=st.integers(min_value=1, max_value=2**31 - 1))
def test_anz_beg_ausl_ge_anz_ausl(seed):
    """Begonnene Auslösungen ≥ abgeschlossene Auslösungen — immer."""
    sim = load_otx("dc1.otx", seed=seed)
    sim.run_period()
    for k in sim.all_knoten():
        assert k.m_iPtkBegAusloesungCount >= k.m_iPtkAusloesungCount


@given(seed=st.integers(min_value=1, max_value=2**31 - 1))
def test_mittl_dlfz_positiv(seed):
    """Mittlere Durchlaufzeit ist positiv (oder NaN bei 0 Ausführungen)."""
    sim = load_otx("test.otx", seed=seed)
    sim.run_period()
    for k in sim.all_knoten():
        dlfz = k.get_knz_mittl_dlfz()
        assert dlfz > 0 or k.m_iPtkAusloesungCount == 0
```

Property-Tests **garantieren keine Bit-Reproduzierbarkeit**, fangen aber
gröbere Logik-Brüche zuverlässig.

---

## § 5 — KPIs via Diss-Tabellen-Vergleich

Die Dissertation Jonsson 2003 enthält numerische Sim-Ergebnisse für die
Beispiel-Modelle. Sie sind **kein bit-genauer Vergleich** — andere
Compiler-Version, möglicherweise andere Eingabe-Parameter — aber
**Plausibilitäts-Anker** für KPI-Größenordnungen.

### Was zu tun ist (Vorbereitung)

1. **Diss-PDF beschaffen** (Pfad vom User nachreichen: `TBD-DISS-PFAD`)
2. **Tabellen identifizieren** und die zugehörigen `.otx`-Modelle aus
   `Vorstellung04/` zuordnen
3. **Fixture-File** `tests/diff/fixtures/diss_kpis.json` schreiben:

```json
{
  "test_otx_1_periode_seed_1776496601": {
    "source": "Diss S. 142, Tabelle 6.3",
    "kpis": {
      "knoten.Bearbeitung.anz_ausl":         {"value": 47, "tol_rel": 0.05},
      "knoten.Bearbeitung.mittl_dlfz":       {"value": 1250.0, "tol_rel": 0.10},
      "ausloeser.Auftrag_1.gueggrad":        {"value": 0.92, "tol_abs": 0.02}
    }
  }
}
```

4. **Test-Driver**:

```python
# tests/diff/test_kpis_vs_diss.py

import json, pytest
from pathlib import Path
from osim_engine import load_otx

FIXTURE = Path(__file__).parent / "fixtures" / "diss_kpis.json"

@pytest.mark.parametrize("scenario_id", list(json.load(FIXTURE.open())))
def test_kpi_within_diss_tolerance(scenario_id):
    scenario = json.load(FIXTURE.open())[scenario_id]
    sim = load_otx("test.otx", seed=1776496601)
    sim.run_period()
    for path, spec in scenario["kpis"].items():
        actual = _resolve_kpi(sim, path)
        expected = spec["value"]
        if "tol_rel" in spec:
            assert abs(actual - expected) / expected <= spec["tol_rel"], path
        elif "tol_abs" in spec:
            assert abs(actual - expected) <= spec["tol_abs"], path
```

**Toleranzen** sind großzügig (typisch 5-10 % relativ), weil Diss-Werte aus
einem **anderen Compiler/Setup** stammen. Hauptzweck: catch von 10×- oder
0.1×-Bugs.

---

## § 6 — Option-D-Trigger: wann lohnt OSim2004-Resurrection

**Option D** = OSim2004 als minimaler headless Build (modernes MSVC oder
MinGW, ohne MFC/OFC/ObjectBase, Sim-Kern + Stubs für UI-Aufrufe). Aufwand
1–2 Wochen, Ergebnis: bit-genaue C++-Referenz für **alle 5 Phasen**.

### Entscheidungs-Zeitpunkt

**Nach V2-Abschluss** (siehe `CONTEXT-P1-SUPPLEMENT.md` § 6.4):

- V2 = `test.otx`-Sim läuft, Hand-Trace und Property-Tests laufen grün

### Entscheidungs-Kriterien

| Beobachtung in V2 | Konsequenz |
|---|---|
| Hand-Trace + Property-Tests reichen aus | Option D bleibt **optional**, Entscheidung erst zu Phase-2-Start |
| ≥ 2 unerklärbare Divergenzen, deren Ursache aus Code-Reading allein nicht herleitbar ist | Option D wird **aktiv**, vor V3 |
| Diss-KPIs weichen > 50 % ab und Ursache unklar | Option D wird **aktiv**, vor V3 |

### Aufwand-Skizze (falls aktiv)

1. **`OSimBase/` extrahieren** in ein neues VS-2022-Projekt — alle MFC-
   Abhängigkeiten finden und stubben (afxwin.h, CObject, POSITION,
   CPlex, …)
2. **Stubs für ObjectBase**: `META`-Aufrufe, `oprX`-Smart-Pointer, `OID`-System,
   `OArchive`-Persistenz — alles entweder ersetzen durch minimale Eigenbau-
   Varianten ODER (besser) **deaktivieren via Preprocessor-Guards**, soweit
   sie nur in UI-/Persistenz-Pfaden vorkommen
3. **Minimaler `.otx`-Loader**: entweder das `OArchive`-Parsing aus
   `ObjectBase` herauslösen ODER das `.otx` in Python zu Sim-Engine-Objekt-
   Graph parsen und über JSON-Bridge an C++ schicken
4. **Trace-Hooks** in `OSimulator::EvtDoNext`, `OVerteil::Zufall`,
   `PDlplKnoten::BearbeitBeginnen`, `OnProzBeendet` einbauen → JSONL-Output
5. **Test-Runner**: `osim2004-cli --otx model.otx --trace out.jsonl
   --periods 1 --seed N`

**Risiken**:
- `OArchive`-Loader ist tief verflochten — könnte 1 Woche allein kosten
- `ObjectBase`-MOP-Macros sind ohne MFC schwer zu stubben
- 1–2 Wochen ist **Best-Case**; realistisch kann es 4 Wochen werden

Deshalb erst nach V2 entscheiden, wenn klar ist, wie schmerzhaft die
schwächeren Test-Methoden in der Praxis sind.

---

## § 7 — Konsolidiertes Test-Layout

```
tests/
├── conftest.py                       # fixtures: trace_capture, jsonl_sink, seed_reset
├── unit/                             # reine Python-Algorithmik
│   ├── test_event_pool_sorting.py
│   ├── test_listener_attach_detach.py
│   ├── test_prozess_dll.py
│   └── test_proz_weitergeben_routing.py
├── diff/                             # gegen C++/Mini-C-Referenz
│   ├── fixtures/
│   │   ├── lcg_10000.jsonl                # generiert von osim2004-trace/lcg/
│   │   ├── verteil_normal_ew100_sa10.jsonl
│   │   ├── ... (pro Verteilungs-Subtyp)
│   │   └── diss_kpis.json
│   ├── hand_trace/
│   │   └── test_otx_1day.md              # Hand-Rechnung als Markdown
│   ├── test_lcg_bit_exact.py
│   ├── test_verteil_normal_bit_exact.py
│   ├── ... (pro Verteilungs-Subtyp)
│   ├── test_test_otx_hand_trace.py
│   └── test_kpis_vs_diss.py
├── property/                          # Hypothesis-basiert
│   ├── test_sim_invariants.py
│   └── test_kpi_monotonicity.py
├── integration/                       # End-to-End gegen Vorstellung04/
│   ├── test_test_otx_smoke.py
│   ├── test_dc1_otx_smoke.py
│   └── test_az_tool_otx_load.py
└── perf/                              # Microbenchmarks
    └── test_eventbus_overhead.py
```

---

## § 8 — Pflicht-Workflow vor jedem Slice-Abschluss

Bevor V1/V2/V3/V4/V5 als "fertig" markiert wird:

1. **Unit-Tests grün** (`pytest tests/unit/`)
2. **Diff-Tests grün** für bereits zugängliche Schichten:
   - V1: LCG + EventPool
   - V2: LCG + EventPool + Verteilungen + Hand-Trace `test.otx`
   - V3: + KPIs-vs-Diss für `dc1.otx`
3. **Property-Tests grün** (Hypothesis mit Default 100 Beispielen)
4. **Integration-Smoke grün** (`.otx` lädt, läuft N Perioden, crasht nicht)
5. **Trace-Konsistenz**: derselbe `.otx` mit gleichem Seed produziert
   bit-identische `TraceCaptureSink`-Records (Reproduzierbarkeit innerhalb
   Python)

Erst wenn alle 5 grün → Slice abgehakt, Commit, nächster Slice.

---

## Was noch geklärt werden muss (Aktionen für Sie)

1. **Diss-PDF + Tabellen-Pfade** — wo liegt die PDF, welche Tabellen-Seiten
   sind als Referenz nutzbar?
2. **Konkreter `.otx` für ersten Hand-Trace** — `test.otx` ist der naheliegende
   Kandidat. Inspektion zeigt: das ist nur ein Fragment im OArchive-Format.
   Existiert eine vollständige `test.otx`-Datei (1 Plan, 1 Knoten, 1 Auslöser)
   irgendwo, die wir nutzen können? Oder müssen wir uns einen synthetischen
   "trivialst möglichen" `.otx` bauen?
3. **Toleranz-Politik für Diss-Vergleiche** — 5 % / 10 % / 20 %? Hängt davon
   ab, wie genau Sie die Diss-Werte selbst einschätzen.
