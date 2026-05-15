# Konzept-Mapping: Jonsson 2003 → osim-engine

| Jonsson (UML/C++) | osim-engine (Python) | Bemerkung |
|---|---|---|
| `OSimObj` (Basisklasse) | implizit im Engine-State | im Modell selbst nicht repräsentiert |
| `OSimulator` | `Simulator` (engine.runner) | Event-Heap, Clock, Listener |
| `m_dPeriodenLaenge` | `SimParams.period_length` | int (Sekunden) |
| `m_keim` | `SimParams.seed` | numpy PCG64 |
| `PDlpKnoten` (Basis) | `Node` (Discriminated Union) | `type`-Diskriminator |
| `PDlpKnoKonstant` | `Node(type="konstant", duration=...)` | konstante Durchführungszeit |
| `PDlpKnoVerteilung` | `Node(type="verteilung", distribution=...)` | stochastische Durchführungszeit |
| `PDurchlaufplan` | `Plan(id, nodes, edges, start_edge, end_edge)` | als eigene Klasse, später als `Node(type="plan")` für Hierarchie |
| `PDlpKante` / `PDlpKanUebergang` | `Edge(predecessors, successors, transition_time=0)` | UND-Logik im Engine |
| `PTProzess` (transient) | `Process` (dataclass im Engine) | nicht im Modell |
| `PTVerknuepfung` | Engine-internal Join-Counter | bei Mehr-Vorgänger-Kanten |
| `PAusloeser` (Basis) | `Trigger` (Discriminated Union) | `type`-Diskriminator |
| `PAslEinzel` | `Trigger(type="single", time=...)` | einmalige Auslösung |
| `PAslMehrfachZaz` | später: `Trigger(type="cyclic_iat", distribution=...)` | zyklische Auslösung |
| `PVrtKonstant/Gleich/Normal/Exp/LogNormal` | `Distribution` (5 Subtypen) | via numpy.Generator |
| Lifecycle-Methoden (`PrzAusloesen` etc.) | Engine-Methoden, intern | nicht in der Public API |
| `OnSimBeginn` / `OnPeriodenBeginn/Ende` | Recorder-Events | im JSONL-Stream |

## Phase 2+ (noch nicht implementiert)

| Jonsson | Geplante Python-Repräsentation |
|---|---|
| `PRscBeleg`, `PPerson`, `PBetriebsmittel` | `Resource(type="capacity", role=...)` |
| `PRscMenge`, `PRscLager` | `Resource(type="quantity", initial=..., lager_type=...)` |
| `PAszBeleg`, `PAszMng*` | `ResourceAssociation(role=...)` |
| `PAktor` + Prozessspeicher | `Resource(is_actor=true)` + `ProcessStore` |
| `PEntitaet`, `PEntExtern` | `Entity` an Trigger |
| `PRscKollektion` | hierarchische Resource mit `children` |
| `PDlpKnoRuecksprung`, `PDlpKnoAlternativ` | `Node(type="ruecksprung"/"alternativ", sub_plan=...)` |
| `PDlpKnoMenge`, `PDlpKnoMengeRst` | `Node(type="menge", time_per_unit=..., setup_time=...)` |
| `PDlpKnoExtern` | `Node(type="extern")` mit Entity-Steuerung |
