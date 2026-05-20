# osim-engine API-Referenz für osim-ui

**Stand:** 2026-05-20  
**Zielgruppe:** Backend-/UI-Integration  
**Engine-Version:** v0.2.0-dev (Spike-Reset 2026-05-15)

> **HINWEIS:** Dieses Dokument basiert auf einer Explore-Agent-Analyse vom 2026-05-20.
>
> Spot-verifiziert (Quelle gelesen):
> - ✅ Modul-Struktur `src/osim_engine/{core,pps,io,observability,engine,resources,kpi,model,decisions,generator}`
> - ✅ `PSimulator` in `pps/simulator.py`, erbt von `OSimulator`
> - ✅ `EventBus.subscribe(topic_pattern, sink)` / `EventBus.emit(topic, **data)` in `observability/bus.py`
> - ✅ OTX-Parser: `parse_otx_file(path) -> OtxFile` (Latin-1)
> - ✅ OTX-Loader: `load_otx_file(path) -> LoadResult` (mit `.simulator`, `.loaded`, `.unsupported`, `.coverage_ratio`)
> - ✅ LCG-Konstanten + `s_verteil`-Singleton in `core/distribution.py`
> - ✅ `OSimulator.start()` / `.reset()` / `m_keim` / `on_sim_begin`
> - ✅ Engine `pyproject.toml`: Python ≥3.12, Dependencies pydantic 2 + numpy + scipy
>
> Mit ⚠️ markierte Aussagen sind noch nicht direkt aus dem Code geprüft.

---

## 1. Überblick & Designprinzipien

Die `osim-engine` ist eine **1:1-Portierung des OSim2004-C++-Codes nach Python**, headless (ohne UI).

**Festgeschriebene Design-Prinzipien:**
- **PAWLICEK-LCG bit-genau:** `AA=6636085.0`, `X=907633385.0`, `AM=2^32`. Kein NumPy/SciPy für Stochastik.
- **Plain Python-Klassen mit Vererbung** als Engine-Klassen; **Pydantic nur am IO-Rand**.
- **Headless-only:** keine UI-, keine MFC/OFC-Abhängigkeiten.

**Domänenkonzepte (knapp):**

| Konzept | Erklärung |
|---|---|
| Periode | Default 86400 s (1 Tag), event-basiert, re-entrant via `start()` |
| Event-Pool | Min-Heap, Sortierungsschlüssel `(time << 2) \| subTime` |
| Auslöser (`PAusloeser`) | Erzeugt Plan-Auslösungen nach Zeitplan/Bedingung |
| Durchlaufplan (`PDurchlaufplan`) | Plan (V1 linear, später DAG) mit Knoten/Kanten |
| Knoten (`PDlplKnoten`) | Bearbeitungsschritte |
| Prozess (`PProzess`) | Instanz eines Durchlaufs |
| Ressource (`PRessBeleg`/`PRessMenge`) | Kapazität, Material, Warteschlange |
| Ptk | Protokoll-Zeitintervall für KPI-Erfassung |

---

## 2. Modulstruktur (laut Agent-Analyse, ⚠️ zu verifizieren)

```
osim_engine/
├── core/                 # Diskreter Event-Sim-Kern
│   ├── simulator.py      # OSimulator
│   ├── sim_object.py     # OSimObj
│   ├── event.py
│   ├── event_pool.py     # heapq-Wrapper
│   ├── distribution.py   # PAWLICEK-LCG + Verteilungen
│   └── ...
├── pps/                  # PPS-Domain
│   ├── simulator.py      # PSimulator
│   ├── ausloeser/        # PAslEinzel, ...
│   ├── knoten/           # PDpKnKonstant, PDpKnAlternativ, ...
│   ├── kante/            # PDlplKante, PDlplUebergang
│   ├── prozess/
│   └── durchlaufplan.py
├── resources/            # PRessource, PRessBeleg, PRessMenge, ...
├── io/
│   ├── otx_reader.py     # OTX-Parser (252-Obj funktioniert)
│   ├── otx_loader.py     # OTX → PSimulator
│   ├── json_loader.py    # JSON → SimModel (Skelett)
│   └── azeitsim.py       # Win32 AZeitSim.exe-Integration
├── observability/
│   ├── bus.py            # EventBus (Pub/Sub, Wildcard-Topics)
│   └── sinks/
│       ├── jsonl.py
│       └── testing.py    # TraceCaptureSink
├── engine/
│   └── recorder.py       # JSONL-Recorder (laut README)
├── kpi/
└── model/                # Pydantic-Datenmodelle
```

---

## 3. Public API: Simulation starten

### Minimal-Beispiel
```python
from osim_engine.pps.simulator import PSimulator
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant

sim = PSimulator()

knoten = PDpKnKonstant(sim)
knoten.m_sName = "Bearbeitung"
knoten.m_iDurchfuehrungszeit = 500
sim.register_knoten(knoten)

ausl = PAslEinzel(sim)
ausl.m_sName = "Erzeugnis-1"
ausl.m_iBeginTermin = 100
ausl.m_lDlpl = knoten
sim.register_ausloeser(ausl)

sim.start()  # 1 Periode (86400 s)
```

### Modell aus OTX laden (verifiziert)
```python
from osim_engine.io.otx_loader import load_otx_file

result = load_otx_file(Path("modell.otx"))   # -> LoadResult
sim = result.simulator                        # PSimulator-Instance
print(result.summary())                       # "OTX-Loader-Result: N geladen, ..."
print(f"Coverage: {result.coverage_ratio:.0%}")
sim.m_keim = 54321.0
sim.start()
```
`LoadResult` enthält: `simulator`, `otx`, `instances`, `loaded`, `skipped`, `unsupported`, `warnings`, `coverage_ratio`.

### Mehrere Perioden
```python
sim.start()              # Periode 1
sim.start()              # Periode 2
sim.reset()              # zurücksetzen
sim.m_keim = 12345
sim.start()              # neuer Lauf
```

---

## 4. Input-Formate

### 4.1 `.otx` (Legacy-Text-Binary)
- **Status:** funktioniert für 252-Objekt-Files
- **Parser:** `osim_engine.io.otx_reader.parse_otx_file(path) -> OtxFile`
- **Loader (verifiziert):** `osim_engine.io.otx_loader.load_otx_file(path) -> LoadResult`
- **OO-Variante:** `OtxLoader().load(otx_file) -> LoadResult` (für Tests, Resets)
- **Format-Struktur:**
  ```
  OIDArray|N!
  #ClassName|attr;val|attr;val|...|$N;sub1;sub2|!
  ```
- **Zwei-Pass:** Instantiate → Wire (Referenzen auflösen)
- **Class-Registry:** nur bekannte Klassen werden geladen; unsupported wird zurückgegeben

### 4.2 JSON (nativer Web-Input)
- **Status:** ⚠️ Skelett, Schema TBD
- **Module:** `io/json_loader.py` (`load_model`, `dump_model`)
- **Empfehlung:** Web-UI nutzt ein **dediziertes JSON-Schema** (von der Engine getrennt), das vom UI-Backend in `PSimulator`-Aufrufe umgewandelt wird. So ist die Engine-API stabil gegen Schema-Änderungen.

---

## 5. Output & Beobachtbarkeit

### 5.1 EventBus (Live, Pub/Sub)
- **API:** `sim.bus.subscribe(pattern: str, sink)`, `sim.bus.emit(topic, **data)`
- **Wildcard-Topics:** `plan.*`, `proz.*`, `*` (alles)
- **Sink-Protocol:** `def receive(self, topic, data, sim_time, sub_time): ...`

**Standard-Topics:**

| Topic | Wann |
|---|---|
| `sim.begin` | vor Start |
| `sim.period.begin` / `sim.period.end` | je Periode |
| `plan.ausloesen` / `plan.beendet` | Trigger feuert / Plan fertig |
| `proz.bearbeit.start` / `proz.bearbeit.ende` | Knoten-Begin/Ende |
| `ptk.periode_*` | Protokoll-Intervalle |

### 5.2 TraceCaptureSink (In-Memory, Tests)
```python
sink = TraceCaptureSink()
sim.bus.subscribe("*", sink)
sim.start()
events = sink.for_topic("plan.ausloesen")
```

### 5.3 JSONL-Recorder (Datei-Stream)
```python
from osim_engine.engine.recorder import Recorder
with Recorder(path="trace.jsonl", in_memory=True) as rec:
    # Sink, der an Recorder weiterleitet, registrieren
    sim.start()
```

**Event-Schema (JSONL, Beispiel):**
```json
{"type": "sim_begin", "t": 0}
{"type": "plan.ausloesen", "t": 100, "trigger_id": "ausl-1", "plan_id": "plan-1"}
{"type": "proz.bearbeit.start", "t": 100, "node_id": "knoten-1"}
{"type": "proz.bearbeit.ende", "t": 600, "duration": 500}
```

### 5.4 Counter / KPI (State nach Run)
```python
ausl.m_iPtkAusloesungCount
knoten.m_iPtkProzessCount
sim.evt_get_sum() / evt_get_max() / evt_get_cur()
```

---

## 6. Stochastik & Reproduzierbarkeit

**LCG-Konstanten (kritisch, nicht ändern!):**
```python
STD_KEIM = 1776496601.0
_AM = 4294967296.0   # 2^32
_AA = 6636085.0
_X  = 907633385.0
```

**Lauf-Identität:** `(seed_int, start_date, end_date, period_len)` → reproduzierbarer Run.

**Wichtig fürs UI:**
- Seed speichern und exakt zurücksetzen
- Modul-Singleton `s_verteil` in `distribution.py` ist **GLOBAL** → Parallelisierung NUR über Subprozesse
- UI darf KEINE Reihenfolge / Aggregation einschieben, die RNG-Aufrufreihenfolge verändert

---

## 7. Parallelisierung — kritisch für osim-ui

**Status laut Agent:**
- ⚠️ Engine ist **NICHT thread-safe** (LCG-Singleton)
- ✅ Engine ist **prozess-safe**

**Konsequenz für die UI-Architektur:**
- Sim-Läufe MÜSSEN in **separaten OS-Prozessen** laufen
- Variante A: `multiprocessing.Pool` (Single-Host, einfach)
- Variante B: **Worker-Container** (Cloud Run Jobs, Celery + RabbitMQ, RQ + Redis) — skaliert über Hosts
- IPC: stdout-JSONL oder Pub/Sub-Topic (Cloud Pub/Sub) für Event-Stream zurück zum UI

**Empfehlung (vorläufig):** Cloud Run Jobs + Pub/Sub (Stream) + GCS (final report) — passt zu 3fls-Pattern.

---

## 8. Performance (Schätzung)

| Szenario | Dauer | Events | Wall-Clock |
|---|---|---|---|
| Minimal (1 Auslöser, 1 Knoten, 1 Tag) | 86400 s | 2–5 | <<1s |
| Voll (252 Objekte, 30 Tage) | 86400×30 | 10.000+ | 10–60s |

| Memory | Wert |
|---|---|
| OSimulator + Pool | ≈ 1 MB |
| Pro Event in JSONL | ≈ 200 B |
| 100k Events ≈ | 20 MB JSON |

---

## 9. Fehlerbehandlung

| Exception | Quelle |
|---|---|
| `ValueError` | `evt_insert()` (Zeit außerhalb Periode) |
| `KeyError` | `evt_time()` (Handle nicht im Pool) |
| `NotImplementedError` | `OMetaEvent.execute()` (Typ unbekannt) |
| `FileNotFoundError` | OTX-Loader |
| `RuntimeError` | `azeitsim.py` (nur Windows) |

---

## 10. Was für die UI noch fehlt (Wishlist an die Engine)

1. **JSON-Schema definieren** (`io/json_loader.py` ist Skelett) — gemeinsam mit UI, kompatibel zu OTX-Roundtrip
2. **Recorder-EventBus-Verdrahtung als Convenience** (statt manuellem Sink, der an Recorder weiterleitet)
3. **Public Result-Object** (`SimResult` mit summary KPIs + path zur JSONL), damit Worker einfaches Rückgabe-Objekt liefern
4. **Subprozess-Entry-Point** (`python -m osim_engine.cli run --model <path> --seed N --periods K --out <jsonl>`), damit Worker ohne Python-Importtricks gestartet werden können
5. **Verteilungs-Knoten** (`PDpKnExponential`, normal, etc.) finalisieren
6. **DAG-Pläne** (V2)

---

## Zusammenfassung für die UI-Architektur

| Frage | Antwort |
|---|---|
| Entry-Point | `PSimulator` (`pps/simulator.py`) |
| Modell laden | OTX heute, JSON-Schema noch zu definieren |
| Live-Events | EventBus (subscribe + Sink) — passt für WebSocket-Stream |
| Persistenz | JSONL über Recorder, später nach GCS verschieben |
| Parallelisierung | **Subprozesse** (LCG-Singleton verbietet Threads) |
| Reproduzierbarkeit | Seed + Datum-Range + Period-Len speichern |
| Performance-Budget | 10–60 s für realistischen Lauf, ~20 MB Trace |
