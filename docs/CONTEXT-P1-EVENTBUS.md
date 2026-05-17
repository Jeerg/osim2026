# CONTEXT-P1-EVENTBUS — Observability-Architektur

**Stand:** 2026-05-17
**Bereich:** Live-Output während Sim-Lauf + Trace-Capture für Diff-Tests
**Status:** Architektur-Kontrakt, ab V1 mit-implementiert
**Verwandt:** [`CONTEXT-P1-DIFFTEST.md`](CONTEXT-P1-DIFFTEST.md) (nutzt
`TraceCaptureSink` als Diff-Test-Substrat),
[`CONTEXT-P1-SUPPLEMENT.md`](CONTEXT-P1-SUPPLEMENT.md) § 6.4 (Slice-Plan)

---

## Designziel

Während eines Sim-Laufs werden **bedeutsame Domänen-Ereignisse** über einen
zentralen **EventBus** publiziert. Mehrere **Sinks** subscribieren auf
Topic-Pattern und konsumieren die Events parallel — für Trace-Capture,
Live-Terminal-Anzeige, Period-End-KPI-Snapshot und optional
WebSocket-Push an ein Browser-Dashboard.

**Nicht-Ziel**: kein Universal-Logging. Sim-internes Debugging (Python-`logger`)
ist separat und geht nicht über den EventBus.

**Performance-Vertrag**: Ein deaktivierter Topic darf **null Allokation, null
String-Formatting** kosten. Hot-Path (`rng.sample` bei langen Sims:
≥10⁶ Calls) muss durch Fast-Path-Check geschützt sein.

---

## EventBus

### Public-API

```python
# src/osim_engine/observability/bus.py

from collections.abc import Iterator
from typing import Any, Protocol
import fnmatch


class Sink(Protocol):
    def receive(self, topic: str, data: dict[str, Any], sim_time: int, sub_time: int) -> None:
        ...


class EventBus:
    def __init__(self, simulator) -> None:
        self._sim = simulator
        self._subscriptions: list[tuple[str, Sink]] = []      # (pattern, sink)
        self._active_topics: set[str] = set()                  # topics mit ≥1 Subscriber
        self._all_topics: set[str] = set()                     # alle je emittierten Topics (für Pattern-Resolution)

    def subscribe(self, topic_pattern: str, sink: Sink) -> None:
        """Pattern via fnmatch (z. B. 'proz.*', 'kante.uebergang.*')."""
        self._subscriptions.append((topic_pattern, sink))
        self._refresh_active_topics()

    def unsubscribe(self, sink: Sink) -> None:
        self._subscriptions = [(p, s) for p, s in self._subscriptions if s is not sink]
        self._refresh_active_topics()

    def is_active(self, topic: str) -> bool:
        """Fast-Path-Check für Caller: lohnt sich das Payload-Building?"""
        return topic in self._active_topics

    def emit(self, topic: str, **data: Any) -> None:
        """Caller MUSS vorab is_active(topic) prüfen für Hot-Topics."""
        if topic not in self._active_topics:
            return
        sim_time = self._sim.evt_curr_time()
        sub_time = getattr(self._sim.current_meta_event, "m_subTime", 0)
        for pattern, sink in self._subscriptions:
            if fnmatch.fnmatchcase(topic, pattern):
                sink.receive(topic, data, sim_time, sub_time)

    def _refresh_active_topics(self) -> None:
        self._active_topics = {
            t for t in self._all_topics
            if any(fnmatch.fnmatchcase(t, p) for p, _ in self._subscriptions)
        }

    def _register_topic(self, topic: str) -> None:
        """Sim-Engine ruft das bei jedem neuen Topic auf (Discovery)."""
        if topic not in self._all_topics:
            self._all_topics.add(topic)
            self._refresh_active_topics()
```

### Verwendung in Sim-Engine

```python
# Pattern für Hot-Topics (>10^5 emits/Sim):
def zufall(self) -> float:
    keim_before = self._keim
    self._keim = (AA * self._keim + X) % AM
    if self._bus.is_active("rng.sample"):                 # Fast-Path
        self._bus.emit("rng.sample",
                       call_no=self._sample_count,
                       keim_before=keim_before,
                       result=self._keim / AM)
    self._sample_count += 1
    return self._keim / AM


# Pattern für normale Topics (<10^4 emits/Sim, immer emittieren):
def bearbeit_beginnen(self, proz: PtProzess) -> bool:
    if not self.res_verfuegbar(proz):
        return False
    self._iPtkBegAusloesungCount += 1
    self._notify_listeners("on_proz_bearbeit_beginn", proz)
    self._bus.emit("proz.bearbeit.start",
                   proz_id=proz.id, knoten=self.name,
                   ende_zeit=self.simulator.evt_curr_time()
                              + self.get_durchfuehrungszeit(proz))
    proz.bearbeit_beginnen()
    return True
```

---

## Topic-Taxonomie (V1-Stand)

Dotted-Notation, hierarchisch. Pattern-Subscriptions via `fnmatch`
(`proz.*`, `kante.uebergang.*`).

| Topic | Payload-Felder | Frequenz | Hot? |
|---|---|---|---|
| `sim.period.begin` | `period_num`, `begin_time` | 1/Periode | nein |
| `sim.period.end` | `period_num`, `end_time` | 1/Periode | nein |
| `sim.suspend` | `at_time` | selten | nein |
| `sim.reset` | — | selten | nein |
| `sim.event.pop` | `topic`, `obj`, `time`, `sub_time` | 10⁴–10⁶/Sim | **ja** (opt-in) |
| `proz.create` | `proz_id`, `knoten`, `trigger`, `ober` | 10³/Sim | nein |
| `proz.bearbeit.start` | `proz_id`, `knoten`, `ende_zeit` | 10³–10⁴/Sim | nein |
| `proz.bearbeit.ende` | `proz_id`, `knoten` | 10³–10⁴/Sim | nein |
| `proz.bearbeit.unterbr` | `proz_id`, `knoten` | selten | nein |
| `proz.warteschlange.add` | `proz_id`, `knoten`, `schlange_laenge` | 10³/Sim | nein |
| `proz.warteschlange.remove` | `proz_id`, `knoten` | 10³/Sim | nein |
| `kante.weitergeben` | `kante_id`, `proz_id`, `target_knoten` | 10³–10⁴/Sim | nein |
| `kante.uebergang.start` | `kante_id`, `proz_id`, `ubg_zeit` | 10³/Sim | nein |
| `kante.uebergang.ende` | `kante_id`, `proz_id` | 10³/Sim | nein |
| `plan.ausloesen` | `plan_id`, `trigger_id`, `proz_id` | 10²/Sim | nein |
| `plan.beendet` | `plan_id`, `dauer` | 10²/Sim | nein |
| `verknuepfung.create` | `kante_id`, `anz_warte` | 10²/Sim | nein |
| `verknuepfung.complete` | `kante_id` | 10²/Sim | nein |
| `rng.sample` | `call_no`, `keim_before`, `result` | 10⁵–10⁷/Sim | **ja** (opt-in) |
| `counter.snapshot` | `knoten_id`, `counters` (dict) | 1/Periode | nein |

**Pflicht-Felder bei jedem Sink-Empfang** (von EventBus injiziert, nicht im
`data`-Dict): `topic`, `sim_time` (int, Sekunden), `sub_time` (int, 0-3).

### Topic-Naming-Konvention

- **lowercase, dotted**
- **Domäne zuerst** (`proz`, `kante`, `plan`, `sim`, `rng`, `counter`,
  `verknuepfung`)
- **dann Sub-Domäne** (`proz.bearbeit.start`, nicht `proz.start.bearbeit`)
- **Verben am Ende** (`start`, `ende`, `add`, `remove`)
- **Singular** (`proz`, nicht `prozesse`)

---

## Standard-Sinks

Vier Sinks im Modul-Repo. Sie liegen in `osim_engine.observability.sinks.*`.

### 4.1 `JsonlSink`

**Zweck**: persistenter Trace + Diff-Test-Substrat (siehe DIFFTEST.md).

```python
# src/osim_engine/observability/sinks/jsonl.py

import json, io
from pathlib import Path
from typing import Any

class JsonlSink:
    def __init__(self, path: Path) -> None:
        self._fh: io.TextIOBase = path.open("w", encoding="utf-8")

    def receive(self, topic: str, data: dict[str, Any], sim_time: int, sub_time: int) -> None:
        record = {"t": sim_time, "subt": sub_time, "topic": topic, "data": data}
        self._fh.write(json.dumps(record, separators=(",", ":")) + "\n")

    def close(self) -> None:
        self._fh.close()
```

**Format pro Zeile** (kompakt, keine Spaces):
```json
{"t":86400,"subt":2,"topic":"proz.bearbeit.start","data":{"proz_id":"P42","knoten":"K3","ende_zeit":90000}}
```

**Use Cases**:
- Diff-Test-Substrat: ein Sim-Lauf → ein `.trace.jsonl`, vergleichbar mit
  Referenz-Trace
- Forensik nach Crashes
- Reproduzierbarkeits-Beweise

### 4.2 `TuiSink` (rich.Live)

**Zweck**: Live-Anzeige im Terminal während Sim-Lauf.

```python
# src/osim_engine/observability/sinks/tui.py

from rich.live import Live
from rich.table import Table
from rich.layout import Layout
from typing import Any

class TuiSink:
    def __init__(self, refresh_hz: float = 4.0) -> None:
        self._layout = self._build_layout()
        self._live = Live(self._layout, refresh_per_second=refresh_hz)
        self._aktive_prozesse: dict[str, dict] = {}      # proz_id → {knoten, start_time}
        self._counters: dict[str, int] = {
            "proz.bearbeit.start": 0,
            "proz.bearbeit.ende":  0,
            "kante.uebergang.start": 0,
            "verknuepfung.complete": 0,
        }
        self._sim_time = 0
        self._period_num = 0

    def receive(self, topic: str, data: dict[str, Any], sim_time: int, sub_time: int) -> None:
        self._sim_time = sim_time
        if topic in self._counters:
            self._counters[topic] += 1
        if topic == "proz.bearbeit.start":
            self._aktive_prozesse[data["proz_id"]] = {
                "knoten": data["knoten"], "start": sim_time, "ende": data["ende_zeit"]
            }
        elif topic == "proz.bearbeit.ende":
            self._aktive_prozesse.pop(data["proz_id"], None)
        elif topic == "sim.period.begin":
            self._period_num = data["period_num"]
        self._refresh()

    def _build_layout(self) -> Layout: ...
    def _refresh(self) -> None: ...

    def __enter__(self): self._live.__enter__(); return self
    def __exit__(self, *exc): self._live.__exit__(*exc)
```

**Anzeige-Layout** (V1-Minimum):

```
┌─ OSim-Engine ────────── Sim 2026-05-17 ──────── Period 17 @ 86400 s ─┐
│                                                                       │
│  Aktive Prozesse                  Counter pro Knoten                  │
│  ┌────────┬──────────┬────────┐  ┌──────┬──────┬──────┐              │
│  │ ProzID │ Knoten   │ Ende   │  │ Knot │ Anz  │ Mitt │              │
│  ├────────┼──────────┼────────┤  ├──────┼──────┼──────┤              │
│  │ P42    │ Drehen   │ 87650  │  │ Dreh │  47  │ 1250 │              │
│  │ P43    │ Schweiss │ 88200  │  │ Schw │  31  │  820 │              │
│  └────────┴──────────┴────────┘  └──────┴──────┴──────┘              │
│                                                                       │
│  Events:  bearbeit.start  4253  │  bearbeit.ende  4198               │
│           kante.uebergang  9012  │  verknuepfung    47                │
└───────────────────────────────────────────────────────────────────────┘
```

**Use Cases**: interaktives Beobachten kurzer Sims, Demo, Lehre.

### 4.3 `CounterSnapshotSink`

**Zweck**: pro Period-Ende einen aggregierten KPI-Snapshot raus.

```python
# src/osim_engine/observability/sinks/counter_snapshot.py

import json
from pathlib import Path
from typing import Any

class CounterSnapshotSink:
    def __init__(self, simulator, path: Path) -> None:
        self._sim = simulator
        self._fh = path.open("w", encoding="utf-8")

    def receive(self, topic: str, data: dict[str, Any], sim_time: int, sub_time: int) -> None:
        if topic != "sim.period.end":
            return
        snapshot = {
            "period": data["period_num"],
            "end_time": sim_time,
            "knoten": [
                {
                    "id": k.name,
                    "anz_ausl": k.m_iPtkAusloesungCount,
                    "anz_beg_ausl": k.m_iPtkBegAusloesungCount,
                    "mittl_dlfz": k.get_knz_mittl_dlfz(),
                }
                for k in self._sim.all_knoten()
            ],
            "ausl": [
                {
                    "id": a.name,
                    "anz_ausl": a.m_iPtkAusloesungCount,
                    "mittl_dlfz": a.get_knz_mittl_dlfz(),
                }
                for a in self._sim.m_lAusl
            ],
        }
        self._fh.write(json.dumps(snapshot) + "\n")

    def close(self) -> None:
        self._fh.close()
```

**Use Cases**: KPI-Reporting pro Sim-Lauf, Input für Plot-Skripte,
Vergleich Multi-Lauf-Studien.

### 4.4 `WebsocketSink` (optional, später)

**Zweck**: Live-Push an ein separates Browser-Frontend.

```python
# src/osim_engine/observability/sinks/websocket.py

import asyncio, json
from typing import Any
import websockets   # extra-dep, optional

class WebsocketSink:
    def __init__(self, host: str = "127.0.0.1", port: int = 8765) -> None:
        self._clients: set = set()
        self._loop = asyncio.new_event_loop()
        # Server in eigenem Thread starten
        ...

    def receive(self, topic: str, data: dict[str, Any], sim_time: int, sub_time: int) -> None:
        msg = json.dumps({"t": sim_time, "subt": sub_time, "topic": topic, "data": data})
        for ws in list(self._clients):
            asyncio.run_coroutine_threadsafe(ws.send(msg), self._loop)
```

**Trade-off**: bringt Async-Komplexität ins Repo, deshalb **Phase 2 / nach
V5**. Architektur muss heute kompatibel sein (gleiche `Sink`-Protocol-
Signatur), Implementation kann warten.

**Frontend**: minimal als Streamlit/Vue-App, separates Repo.

---

## Lifecycle & Konfiguration

### Initialisierung im `Simulator`

```python
# src/osim_engine/core/simulator.py (Auszug)

from osim_engine.observability.bus import EventBus

class OSimulator:
    def __init__(self) -> None:
        ...
        self._bus = EventBus(self)
        self.current_meta_event = None  # wird in EvtDoNext gesetzt

    @property
    def bus(self) -> EventBus:
        return self._bus
```

### Konfiguration via CLI

```bash
# Standard: nur Domänen-Events, JSONL-Trace
osim-run model.otx --trace out.jsonl

# + Live-TUI
osim-run model.otx --trace out.jsonl --tui

# + Period-KPI-Snapshots
osim-run model.otx --trace out.jsonl --counters out.counters.jsonl

# Vollständig (mit RNG-Trace für Diff-Tests, langsam!)
osim-run model.otx --trace out.jsonl --trace-rng --trace-events

# Browser-Dashboard
osim-run model.otx --websocket 8765
```

### Konfiguration in pytest

```python
# tests/conftest.py

import pytest
from osim_engine.observability.sinks.jsonl import JsonlSink
from osim_engine.observability.sinks.testing import TraceCaptureSink

@pytest.fixture
def trace_capture(tmp_path):
    """Liefert einen In-Memory-Trace-Sink für Diff-Tests."""
    sink = TraceCaptureSink()
    yield sink
    # Cleanup falls nötig

@pytest.fixture
def jsonl_sink(tmp_path):
    path = tmp_path / "trace.jsonl"
    sink = JsonlSink(path)
    yield sink
    sink.close()
```

`TraceCaptureSink` (testing-only): hält alle empfangenen Events in einer Liste
zur Inspektion. Variante von `JsonlSink`, die statt Datei in `list[dict]`
schreibt.

---

## Performance-Budget

| Szenario | Budget | Wie erreicht |
|---|---|---|
| EventBus ohne Sinks | < 50 ns/`emit()` | Fast-Path: `if topic not in _active_topics: return` |
| EventBus mit aktivem JsonlSink | < 1 μs/`emit()` (Domänen-Events) | `json.dumps` mit `separators=(",", ":")` |
| EventBus mit RNG-Trace aktiv | < 500 ns/`emit("rng.sample")` | Vorgebauter Format-Pfad, kein f-String |
| Sim-Lauf 1 Tag (10⁴ Events) ohne Sinks | < 1 % Overhead | Fast-Path |
| Sim-Lauf 1 Tag mit `--trace` | < 5 % Overhead | JSONL ist sequentielles Append |

**Microbench-Ziel V1**: `tests/perf/test_eventbus_overhead.py` misst die
Overhead pro 10⁶ Emits ohne Sinks. Soll < 50 ms gesamt sein (= < 50 ns/Call).

---

## Modul-Layout

```
src/osim_engine/observability/
    __init__.py
    bus.py                        # EventBus + Sink-Protocol
    topics.py                     # konstantes Dict mit Topic-Schemas (für Validierung in tests)
    sinks/
        __init__.py
        jsonl.py                  # JsonlSink
        tui.py                    # TuiSink (rich.Live)
        counter_snapshot.py       # CounterSnapshotSink
        websocket.py              # WebsocketSink (Phase 2)
        testing.py                # TraceCaptureSink (pytest-only)
```

Extra-Dependencies (in `pyproject.toml`):
- `rich` (für TuiSink) — small, optional via extras
- `websockets` (für WebsocketSink) — optional via extras

```toml
[project.optional-dependencies]
tui = ["rich>=13.0"]
websocket = ["websockets>=12.0"]
all = ["rich>=13.0", "websockets>=12.0"]
```

---

## Was noch offen ist (Phase-2-Ausblick)

- **OpenTelemetry-Sink** als optionale 5. Sink-Implementation (Anschluss an
  Jaeger/Tempo für verteiltes Tracing in Multi-Sim-Studien)
- **Replay-Modus**: aus einem `JsonlSink`-Trace einen vollständigen Sim-Lauf
  rekonstruieren (für Post-Mortem-Analysen)
- **Sampling**: bei `rng.sample` nur 1-zu-N samplen, falls Vollständigkeit
  zu teuer wird
- **Schema-Validierung**: jedes `emit()`-Payload gegen `topics.py`-Schema
  prüfen, opt-in via `--strict-topics` (für CI)
