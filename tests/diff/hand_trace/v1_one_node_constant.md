# V1 Hand-Trace: 1 Auslöser, 1 PDpKnKonstant

## Setup

```python
sim = PSimulator()
sim.m_periodLen = 86400  # 1 Tag

knoten = PDpKnKonstant(sim)
knoten.m_sName = "K"
knoten.m_iDurchfuehrungszeit = 500
sim.register_knoten(knoten)

ausl = PAslEinzel(sim)
ausl.m_sName = "A"
ausl.m_iBeginTermin = 100
ausl.m_lDlpl = knoten
sim.register_ausloeser(ausl)

sim.start()
```

## Event-Trace (manuell durchgespielt)

| Zeit | sub_time | Event-Typ | Wirkung |
|---|---|---|---|
| **0** | — | (Sim-Begin) | `on_sim_begin` → Auslöser plant `EvtAuslTriggern` bei t=100 |
| **0** | — | (Periode-Begin) | `on_period_begin`; Pool: `[(100, sub=1, EvtAuslTriggern)]` |
| 100 | 1 | `EvtAuslTriggern` für A | Trigger erzeugt; `dlpl_ausloesen(trigger)` → `PDpKnKonstant.proz_weitergeben`: PtProzZeitvorgabe erzeugt, `bearbeit_beginnen` plant `EvtBearbeitEnde` bei t=100+500=600 |
| 600 | 2 | `EvtBearbeitEnde` für Prozess | `bearbeit_beenden` → `K.on_proz_beendet` → `trigger.on_dlpl_beendet` → `A.on_dlpl_beendet` |
| 86399 | — | (Pool-leer-Check) | `is_empty(86399)` returns True → Loop endet |
| 86400 | — | (Periode-Ende) | `on_period_end`: `m_periodNum=1`, `m_periodBegin=86400` |

## Erwartete Counter nach Sim-Ende

| Counter | Wert | Begründung |
|---|---|---|
| `sim.m_periodNum` | 1 | eine Periode abgeschlossen |
| `sim.m_periodBegin` | 86400 | nächste Periode beginnt bei 86400 |
| `sim.m_simStatus` | PERIOD | Sim ist im PERIOD-Status, bereit für nächste Periode |
| `ausl.m_iPtkBegAusloesungCount` | 1 | 1× `dlpl_ausloesen` aufgerufen |
| `ausl.m_iPtkAusloesungCount` | 1 | 1× `on_dlpl_beendet` aufgerufen |
| `ausl.m_dPtkDurchlaufzeit` | 500.0 | Dauer = 600 - 100 |
| `knoten.m_iPtkProzessCount` | 1 | 1× Prozess erzeugt |
| `knoten.m_iPtkBegAusloesungCount` | 1 | 1× `bearbeit_beginnen` (mit ress_verfuegbar=True) |
| `knoten.m_iPtkAusloesungCount` | 1 | 1× `on_proz_beendet` (während is_ptk=True) |
| `knoten.m_lProzesse` | `[]` | Prozess wurde nach Ende aus Liste entfernt |
| `sim.evt_get_sum()` | 2 | 2 Events: EvtAuslTriggern + EvtBearbeitEnde |
| `sim.evt_get_cur()` | 0 | Pool leer nach Sim-Ende |

## EventBus-Trace

Erwartete Reihenfolge mit subscribed `"*"`:

| Zeit (t) | sub_time | Topic | Data |
|---|---|---|---|
| 0 | 0 | `sim.begin` | `{"begin_time": 0}` |
| 0 | 0 | `sim.period.begin` | `{"period_num": 0, "begin_time": 0}` |
| 100 | 1 | `plan.ausloesen` | `{"ausloeser": "A", "trigger_id": "A.trig0", "target": "K"}` |
| 100 | 1 | `proz.create` | `{"proz_id": "A|K", "knoten": "K", "trigger_id": "A.trig0"}` |
| 100 | 1 | `proz.bearbeit.start` | `{"proz_id": "A|K", "knoten": "K", "ende_zeit": 600}` |
| 600 | 2 | `proz.bearbeit.ende` | `{"proz_id": "A|K", "knoten": "K"}` |
| 600 | 2 | `plan.beendet` | `{"ausloeser": "A", "trigger_id": "A.trig0", "dauer": 500}` |
| 86400 | 2 | `sim.period.end` | `{"period_num": 0, "end_time": 86400}` |

Anmerkung zur `sim_time`-Zuordnung: bei `sim.period.end` ist `evt_curr_time` noch
600 (letzter Event), aber `period_end`-Event wird **nach** der Loop-Termination
emittiert — `evt_curr_time()` würde noch das letzte Event zurückliefern.
Die `end_time`-Data steht explizit auf 86400.
