---
phase: 01-live-viewer-bridge
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - engine/src/osim_engine/streaming/__init__.py
  - engine/src/osim_engine/streaming/frame.py
  - engine/src/osim_engine/streaming/jsonl_writer.py
  - engine/src/osim_engine/streaming/run_dir.py
  - engine/src/osim_engine/streaming/registry.py
  - engine/src/osim_engine/streaming/listeners/__init__.py
  - engine/src/osim_engine/streaming/listeners/lifecycle.py
  - engine/src/osim_engine/streaming/listeners/gantt.py
  - engine/src/osim_engine/streaming/attach.py
  - engine/tests/integration/test_streaming.py
  - .gitignore
autonomous: true
requirements: [O-1, O-2, O-4, O-5, AC-1]
must_haves:
  truths:
    - "Ein Sim-Lauf erzeugt genau eine append-only Datei runs/<run-id>/stream.jsonl"
    - "Jede Zeile in stream.jsonl ist ein eigenständiges JSON-Objekt mit den Pflichtfeldern t, stream, seq, v"
    - "Der lifecycle-Stream enthält sim_begin/period_begin/period_end-Frames mit monoton steigender seq"
    - "Der gantt_durchlauf-Stream enthält start- und ende-Frames für ablaufende Prozesse"
    - "Die Engine-Sim läuft unverändert; das Streaming hängt ausschließlich als OListenerSimulator-Subklasse via sim.attach() ein"
    - "Bei Buffer-Full werden die ältesten Frames verworfen (drop-oldest), der Sim wird nie blockiert"
  artifacts:
    - path: "engine/src/osim_engine/streaming/frame.py"
      provides: "Frame-Dataclass mit Feldern t, stream, seq, v + serialize() nach JSONL-Zeile"
      contains: "class Frame"
    - path: "engine/src/osim_engine/streaming/jsonl_writer.py"
      provides: "Buffered append-only Writer mit bounded buffer + drop-oldest"
      contains: "class JsonlStreamWriter"
    - path: "engine/src/osim_engine/streaming/run_dir.py"
      provides: "run-id-Generierung + run-dir-Auflösung + meta.json-Schreiber"
      contains: "def make_run_id"
    - path: "engine/src/osim_engine/streaming/registry.py"
      provides: "Listener-Factory-Registry, damit Wave-2-Listener sich ohne attach.py-Edit anhängen"
      contains: "def register_listener"
    - path: "engine/src/osim_engine/streaming/listeners/lifecycle.py"
      provides: "LifecycleListener (OListenerSimulator-Subklasse) für sim/period-Events"
      contains: "class LifecycleListener"
    - path: "engine/src/osim_engine/streaming/listeners/gantt.py"
      provides: "GanttListener für gantt_durchlauf start/ende"
      contains: "class GanttListener"
    - path: "engine/src/osim_engine/streaming/attach.py"
      provides: "attach_streaming_listeners(sim, run_dir) Helper"
      contains: "def attach_streaming_listeners"
  key_links:
    - from: "streaming/listeners/lifecycle.py"
      to: "core/listener.py:OListenerSimulator"
      via: "Subklasse + sim.attach()"
      pattern: "OListenerSimulator"
    - from: "streaming/listeners/lifecycle.py"
      to: "streaming/jsonl_writer.py:JsonlStreamWriter"
      via: "writer.write(frame)"
      pattern: "JsonlStreamWriter|\\.write\\("
    - from: "streaming/attach.py"
      to: "core/simulator.py:_sim_listeners"
      via: "listener.attach(sim)"
      pattern: "\\.attach\\("
---

<objective>
Walking-Skeleton der Engine-Seite: osim-engine emittiert während eines Sim-Laufs einen Live-JSONL-Stream nach `runs/<run-id>/stream.jsonl`. Dieser Plan pinnt den **Engine↔UI-Vertrag** (Frame-Format §6.2) end-to-end fest, bevor in Wave 2 auf alle 6 Streams + 11 KPI-Varianten gefächert wird.

Liefert: das `streaming/`-Modul (Frame, Writer, run-dir/meta.json, Listener-Registry), die ersten zwei Listener (`lifecycle`, `gantt_durchlauf`), den `attach`-Helper und die Test-Basis in `test_streaming.py`.

Purpose: De-Risk des JSONL-Vertrags. O-1 (eine append-only Datei), O-2 (Stream-Typen, hier 2 von 6 als Vertrag), O-5 (versioniert + schema-fähig) werden hier verankert; die restlichen Streams/KPIs hängen sich danach kontraktstabil über das Registry-Pattern ein, OHNE attach.py erneut zu editieren.
Output: `engine/src/osim_engine/streaming/`-Modul + `engine/tests/integration/test_streaming.py` + `.gitignore`-Eintrag für `runs/`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-live-viewer-bridge/01-SPEC.md
@.planning/phases/01-live-viewer-bridge/01-CONTEXT.md
@.planning/STATE.md
@./CLAUDE.md

<interfaces>
<!-- Aus engine/src/osim_engine/core/listener.py — der Hook-Punkt (D-1.2): -->
class OListenerSimulator(OListener):
    def __init__(self) -> None: self.m_sim = None
    def attach(self, sim) -> None: ...      # insert-at-head in sim._sim_listeners
    def detach(self) -> None: ...
    def on_sim_begin(self, time_begin: int) -> None: ...
    def on_period_begin(self, time_begin: int, time_end: int) -> None: ...
    def on_period_end(self, time_end: int) -> None: ...
    def on_period_break(self, time_end: int) -> None: ...
    def on_period_reset(self) -> None: ...
    def on_sim_ereig(self) -> None: ...     # nach jedem Event-Pop, via _on_sim_ereig()

<!-- Aus core/simulator.py — Sim-Zeit + Period-State, NUR LESEN: -->
sim.evt_curr_time() -> int       # Sim-Zeit des aktuellen Events; entspricht C++ EvtCurrTime() / Frame-Feld t
sim.m_periodNum: int             # aktuelle Periodennummer
sim.m_periodBegin: int           # Sekunde des Periodenbeginns
sim.m_periodLen: int             # Periodenlänge in Sekunden
sim.current_meta_event           # OMetaEvent | None — aktuell ausgeführtes Event (für meta_event-Feld)
sim._sim_listeners: list         # Listener-Registry; attach() hängt hier ein. NICHT von Hand mutieren.

<!-- Aus engine/recorder.py (engine/src/osim_engine/engine/recorder.py) — NUR Buffering-Pattern kopieren, NICHT erweitern (D-OP-5): -->
class Recorder(AbstractContextManager):
    def __init__(self, path=None, in_memory=True): ...
    def __enter__(self): self._file = self.path.open("w", encoding="utf-8"); return self
    def __exit__(self, ...): self._file.flush(); self._file.close()
    def emit(self, event_type, t, **payload): self._file.write(json.dumps(rec, ensure_ascii=False) + "\n")
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Frame-Dataclass, JsonlStreamWriter mit bounded buffer, run-dir + meta.json</name>
  <files>engine/src/osim_engine/streaming/__init__.py, engine/src/osim_engine/streaming/frame.py, engine/src/osim_engine/streaming/jsonl_writer.py, engine/src/osim_engine/streaming/run_dir.py, .gitignore</files>
  <read_first>
    - engine/src/osim_engine/engine/recorder.py (Buffering-/Context-Manager-Pattern — Klasse Recorder Z. 30-57; NUR kopieren, NICHT erweitern, D-OP-5/D-1.1)
    - .planning/phases/01-live-viewer-bridge/01-SPEC.md §6.2 (Frame-Pflichtfelder t/stream/seq/v + optional wall_t/meta_event), §6.4 (meta.json-Felder run_id/engine_version/schema_version/sim_config/started_at), §7.4 (Backpressure-Strategie)
    - .planning/phases/01-live-viewer-bridge/01-CONTEXT.md D-1.3 (Batched-Flush per N Frames, Default N=100), D-OP-1 (run-id Format), D-OP-2 (run-dir Default ./runs/, OSIM_RUN_DIR env, --run-dir CLI), D-OP-3 (bounded buffer 10_000, drop-oldest + warn-log + drop-counter in meta.json), D-1.4 (Schema-Validation nur Tests/CI — Frame ist getypte Dataclass, Discretion: dataclass statt Pydantic wählen, leichtgewichtig)
  </read_first>
  <behavior>
    - Frame mit t=0, stream="lifecycle", seq=1, v={"kind":"sim_begin"} serialisiert zu genau einer JSON-Zeile mit Schlüsseln t, stream, seq, v.
    - JsonlStreamWriter mit batch_n=2 flusht erst nach 2 write()-Aufrufen auf Platte; flush() schreibt sofort.
    - JsonlStreamWriter mit max_buffer=3 und 5 schnellen writes ohne flush verwirft die 2 ältesten Frames (drop-oldest), erhöht drop_count auf 2, schreibt nie mehr als die 3 jüngsten.
    - make_run_id() liefert einen String im Format JJJJ-MM-TTTHH-MM-SS-NNNN (ISO-Slug + 4-stellige Sequence).
    - resolve_run_dir() respektiert OSIM_RUN_DIR-Env, dann explizites Argument, sonst ./runs/.
    - write_meta(run_dir, ...) schreibt meta.json mit schema_version, run_id, started_at, drop_count und einem streams-Status-Block.
  </behavior>
  <action>
    Lege `streaming/__init__.py` an (leerer Package-Init mit Modul-Docstring). Implementiere in `frame.py` eine `@dataclass(slots=True)` `Frame` mit Feldern `t: int`, `stream: str`, `seq: int`, `v: dict`, optional `wall_t: str | None = None`, `meta_event: str | None = None`; Methode `serialize() -> str` gibt `json.dumps({...}, ensure_ascii=False)` zurück (optionale Felder nur wenn nicht None). Definiere die 6 gültigen Stream-Tags als Konstante `STREAM_TAGS = ("lifecycle","gantt_durchlauf","gantt_einsatz","gantt_schicht","kpi_auswertung","reporting_record")`.

    In `jsonl_writer.py` Klasse `JsonlStreamWriter` (AbstractContextManager-Pattern wie Recorder, aber EIGENSTÄNDIG — recorder.py bleibt unangetastet): Konstruktor-Args `path`, `batch_n=100` (D-1.3, konfigurierbar), `max_buffer=10_000` (D-OP-3). Interner `collections.deque(maxlen=max_buffer)` als Bounded-Buffer; bei Überlauf zählt `self.drop_count` hoch und es wird per `logging.warning` gewarnt (drop-oldest ist deque-maxlen-Semantik). `write(frame: Frame)` appended in den Buffer; nach `batch_n` Buffer-Einträgen oder bei explizitem `flush()` werden alle gepufferten Zeilen mit `self._file.write(line + "\n")` geschrieben und `self._file.flush()` gerufen. `__exit__` flusht garantiert. Die Sim darf NIE blockieren — kein `os.fsync`-Zwang pro Frame, kein Lock-Warten (SPEC §5).

    In `run_dir.py`: `make_run_id(seq: int = 1) -> str` baut `datetime.now().strftime("%Y-%m-%dT%H-%M-%S") + f"-{seq:04d}"` (D-OP-1). `resolve_run_dir(explicit: str | None = None) -> Path` Priorität: explizit > `os.environ["OSIM_RUN_DIR"]` > `"./runs"` (D-OP-2); löse den Pfad zu absolut auf und lehne `..`-Traversal ab (T-01-01). `write_meta(run_dir, run_id, schema_version="1.0", sim_config=None, drop_count=0, streams=None)` schreibt `meta.json` (Felder run_id, engine_version aus `importlib.metadata` best-effort, schema_version, sim_config, started_at ISO-8601, drop_count, streams-Status-Block; streams default leeres dict, wird in 01-04 gefüllt).

    Ergänze in `.gitignore` einen Block `# OSim run output` mit Zeile `runs/` (D-OP-2 Folge-Task).
  </action>
  <verify>
    <automated>cd engine && uv run pytest tests/integration/test_streaming.py -k "frame or writer or run_dir" -x -q</automated>
  </verify>
  <acceptance_criteria>
    - `Frame(t=0, stream="lifecycle", seq=1, v={"kind":"sim_begin"}).serialize()` ergibt eine JSON-Zeile, deren Parse-Resultat exakt die Schlüssel `{"t","stream","seq","v"}` hat (keine `wall_t`/`meta_event` wenn None).
    - `JsonlStreamWriter(path, batch_n=2)`: nach 1 write ist die Datei leer/0 Zeilen, nach 2 writes stehen 2 Zeilen auf Platte.
    - `JsonlStreamWriter(path, max_buffer=3)` mit 5 writes ohne flush: nach `flush()` stehen genau 3 Zeilen (die letzten 3) auf Platte und `writer.drop_count == 2`.
    - `make_run_id(1)` matcht Regex `^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-0001$`.
    - Mit gesetztem `OSIM_RUN_DIR=/tmp/xrun` liefert `resolve_run_dir()` einen Path, der auf `xrun` endet; ohne Env und ohne Argument endet er auf `runs`. Ein `..`-haltiger Pfad löst ValueError aus.
    - `write_meta(...)` erzeugt eine `meta.json`, deren Parse-Resultat die Schlüssel `run_id`, `schema_version`, `started_at`, `drop_count`, `streams` enthält.
    - `grep -v '^#' .gitignore | grep -c '^runs/$'` gibt `1`.
  </acceptance_criteria>
  <done>Frame/Writer/run-dir-Modul existiert, alle Frame/Writer/run_dir-Tests grün, runs/ in .gitignore.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Listener-Registry + LifecycleListener + GanttListener + attach_streaming_listeners</name>
  <files>engine/src/osim_engine/streaming/registry.py, engine/src/osim_engine/streaming/listeners/__init__.py, engine/src/osim_engine/streaming/listeners/lifecycle.py, engine/src/osim_engine/streaming/listeners/gantt.py, engine/src/osim_engine/streaming/attach.py, engine/tests/integration/test_streaming.py</files>
  <read_first>
    - engine/src/osim_engine/core/listener.py (OListenerSimulator — Override-Points + attach()/detach())
    - engine/src/osim_engine/core/simulator.py Z. 82-225 (on_sim_begin/period_begin/period_end-Fanout, _on_sim_ereig, evt_curr_time, current_meta_event) — NUR lesen, kein Eingriff (SPEC §5, D-1.2)
    - .planning/phases/01-live-viewer-bridge/01-SPEC.md §6.3 (Beispiel-Frames lifecycle + gantt_durchlauf — kind sim_begin/period_begin/period_end/start/ende, Feldnamen period_num/period_begin/period_len/auftrag_id/prozess_id/start_time/end_time/betriebsmittel_id/dauer_*/status), §7.2 (Hook-Pattern), §7.3 (incremental, flush bei period-end)
    - OSim2004/OSimV01(Fj)/OSimBase/OSimulator.cpp L48-160, L374-470 (Listener-Fanout-Referenz für lifecycle-Semantik)
    - OSim2004/OSimV01(Fj)/OSimPro/PDlplViewerStd.cpp (Datenstruktur-Referenz für gantt_durchlauf-Felder; nur soweit zur Feldableitung nötig)
  </read_first>
  <behavior>
    - register_listener(factory) trägt eine Factory in LISTENER_FACTORIES ein; Doppelregistrierung desselben Namens ist idempotent.
    - LifecycleListener.on_sim_begin(0) schreibt einen Frame stream="lifecycle", v.kind=="sim_begin" mit period_num, period_begin in v.
    - LifecycleListener.on_period_end(t) schreibt einen Frame v.kind=="period_end" und ruft writer.flush() (garantierter Flush bei period-end, D-1.3).
    - Aufeinanderfolgende Frames haben streng monoton steigende seq.
    - GanttListener emittiert beim Prozess-Start einen Frame stream="gantt_durchlauf", v.kind=="start" mit auftrag_id/prozess_id/start_time; beim Prozess-Ende v.kind=="ende" mit end_time/status.
    - attach_streaming_listeners(sim, run_dir) instanziiert alle registrierten Factories und hängt sie via .attach(sim) ein, ohne dass sim._sim_listeners-Reihenfolge bestehender Listener bricht.
  </behavior>
  <action>
    In `registry.py`: `LISTENER_FACTORIES: list[ListenerFactory] = []` (eine `ListenerFactory` ist ein Callable `(seq_counter, writer) -> OListenerSimulator`) plus `register_listener(factory)`-Helper (idempotent über den Factory-/Klassennamen). Dieses Modul ist der Erweiterungspunkt: Wave-2-Listener (auswertung/einsatz/schicht/reporting) registrieren ihre Factory hier per Import, OHNE attach.py oder dieses File zu editieren.

    In `listeners/__init__.py` ein Package-Init, der die Listener-Module importiert, damit ihre Registrierung beim Import des Pakets ausgeführt wird. Da alle sechs Listener-Module im Lauf dieser Phase entstehen, importiere defensiv per `importlib`/try-except über eine feste Namensliste (`lifecycle`, `gantt`, `auswertung`, `einsatz`, `schicht`, `reporting`) — fehlende Module (noch nicht gebaut) werden still übersprungen. Damit muss KEIN Wave-2-Plan dieses File editieren (kein Shared-Write).

    In `lifecycle.py` Klasse `LifecycleListener(OListenerSimulator)`: Konstruktor nimmt einen geteilten `seq_counter` (mutable Zähler — globale monotone seq über alle Streams, SPEC §6.2) und den `JsonlStreamWriter`. Override `on_sim_begin`, `on_period_begin`, `on_period_end`, `on_period_break`, `on_period_reset` → baut je einen `Frame` mit `t = self.m_sim.evt_curr_time()`, `stream="lifecycle"`, nächster seq, `v={"kind": ...}` (Kinds: `sim_begin`, `period_begin`, `period_end`, `period_break`, `sim_reset`) + Feldern `period_num`/`period_begin`/`period_len`. In `on_period_end` nach `write()` ein `writer.flush()`. Am Modul-Ende `register_listener(lambda seq, w: LifecycleListener(seq, w))`.

    In `gantt.py` Klasse `GanttListener(OListenerSimulator)`: nutzt `on_sim_ereig` + `self.m_sim.current_meta_event`, um Prozess-Start/Ende-Events des Durchlaufplans zu erkennen und je einen `Frame` stream `gantt_durchlauf` mit `v.kind` `start`/`ende` zu emittieren (Felder §6.3: `auftrag_id`, `prozess_id`, `start_time`, `betriebsmittel_id`, `dauer_geplant` bzw. `end_time`, `dauer_ist`, `status`). Wenn der konkrete Prozess-Status heute Skelett ist (P5-D), `status="unbekannt"`. Am Modul-Ende `register_listener(...)`.

    In `attach.py` Funktion `attach_streaming_listeners(sim, run_dir=None, batch_n=100) -> JsonlStreamWriter`: resolve run-dir + run-id, lege `stream.jsonl` an, erzeuge geteilten seq-Counter + `JsonlStreamWriter`, importiere das `streaming.listeners`-Package (löst alle Registrierungen aus), instanziiere für JEDE Factory in `LISTENER_FACTORIES` einen Listener und rufe `.attach(sim)`, schreibe initial `meta.json` (streams default leer — 01-04 ergänzt den Status-Block via write_meta). Gib den Writer zurück (Caller schließt ihn am Sim-Ende). KEINE Änderung an core/simulator.py. Lege `test_streaming.py` an und teste Registry + Lauf.
  </action>
  <verify>
    <automated>cd engine && uv run pytest tests/integration/test_streaming.py -k "registry or lifecycle or gantt or attach" -x -q</automated>
  </verify>
  <acceptance_criteria>
    - `register_listener` trägt eine Factory ein; zweimaliges Registrieren derselben Klasse lässt `len(LISTENER_FACTORIES)` unverändert (Idempotenz-Test).
    - `lifecycle.py` und `gantt.py` enthalten je eine Klasse, die von `OListenerSimulator` erbt (`grep -c "OListenerSimulator" engine/src/osim_engine/streaming/listeners/lifecycle.py` ≥ 1).
    - In `test_streaming.py`: ein kleiner Sim-Lauf mit `attach_streaming_listeners` erzeugt eine `stream.jsonl`, deren lifecycle-Zeilen mindestens einen Frame mit `v.kind=="sim_begin"` und einen mit `v.kind=="period_end"` enthalten.
    - Die `seq`-Werte aller Frames in `stream.jsonl` sind streng monoton steigend (assert in Test).
    - Mindestens ein Frame mit `stream=="gantt_durchlauf"` und `v.kind in {"start","ende"}` erscheint im Stream eines Demo-Laufs mit Durchlaufplan (oder, falls die Slice heute keine Prozesse fährt, der Test markiert dies via xfail mit Reason "P5-D Skelett").
    - `core/simulator.py` ist gegenüber HEAD unverändert (`git diff --stat HEAD -- engine/src/osim_engine/core/simulator.py` ist leer).
    - `attach_streaming_listeners(sim)` lässt vorher registrierte Listener in `sim._sim_listeners` erhalten.
  </acceptance_criteria>
  <done>Registry + beide Listener + attach-Helper existieren, Sim-Lauf schreibt eine valide stream.jsonl, Engine-Kern unverändert, Wave-2-Listener können sich ohne attach.py-Edit anhängen.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Konfig (OSIM_RUN_DIR / --run-dir) → Dateisystem | Benutzer-/Env-gesteuerter Pfad bestimmt, wohin geschrieben wird |
| Sim-Kern → Streaming-Listener | Read-Side; darf den Kern nie verlangsamen/verändern (SPEC §5) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-01 | Tampering | resolve_run_dir() via OSIM_RUN_DIR / --run-dir | mitigate | Pfad zu absolutem Path auflösen und `..`-Traversal mit ValueError ablehnen, bevor Verzeichnisse angelegt werden |
| T-01-02 | Denial of Service | JsonlStreamWriter Buffer / Schreib-Throughput | mitigate | Bounded deque(maxlen=10_000) + drop-oldest + Warn-Log + drop_count (D-OP-3); Sim wird nie blockiert (SPEC §5) |
| T-01-03 | Denial of Service | Unbegrenzte Akkumulation von runs/ auf Platte | accept | Operatives Risiko; M1 lokal, Aufräumen ist Betriebs-/Folgephasen-Sache (Replay M6). Kein Code-Gate. |
</threat_model>

<verification>
- AC-1 (Schema-Tests, hier Basis): `test_streaming.py` validiert Frame-Pflichtfelder + monotone seq gegen einen erzeugten Stream.
- O-1: genau eine `stream.jsonl` pro Run.
- O-5: `meta.json` enthält `schema_version`.
- SPEC §5 / Hard-Non-Goal: `git diff` von `core/simulator.py` leer.
</verification>

<success_criteria>
- `cd engine && uv run pytest tests/integration/test_streaming.py -q` grün.
- Ein Demo-Sim-Lauf mit `attach_streaming_listeners` legt `runs/<run-id>/{stream.jsonl,meta.json}` an.
- `runs/` ist in `.gitignore`.
</success_criteria>

<output>
Create `.planning/phases/01-live-viewer-bridge/01-01-SUMMARY.md` when done. Dokumentiere den finalen Frame-Vertrag (Pflichtfeld-Namen + lifecycle/gantt_durchlauf v-Felder), die `register_listener`-Factory-Signatur und das `seq_counter`-Objekt, damit 01-02 (UI-Tail-Reader) und die Wave-2-Listener (01-03/01-04) kontraktstabil aufsetzen, ohne attach.py/__init__.py zu editieren.
</output>
