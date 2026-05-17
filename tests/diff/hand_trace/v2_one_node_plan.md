# V2 Hand-Trace: 1-Knoten-Plan mit Übergangskanten

Erweiterung von `v1_one_node_constant.md` um den Plan-Container und Kanten.

## Setup

```python
sim = PSimulator()
plan = PDurchlaufplan(sim); plan.m_sName = "P"

knoten = PDpKnKonstant(sim); knoten.m_sName = "K"
knoten.m_iDurchfuehrungszeit = 100
plan.add_knoten(knoten)

start_kante = PDpKaUebergang(sim); start_kante.m_sName = "S"
start_kante.m_iUebergangszeit = 10
start_kante.m_lNachfolger.append(knoten)
knoten.m_lKanteEin = start_kante
plan.add_kante(start_kante); plan.set_start_kante(start_kante)

end_kante = PDpKaUebergang(sim); end_kante.m_sName = "E"
end_kante.m_iUebergangszeit = 10
end_kante.m_lVorgaenger.append(knoten)
knoten.m_lKanteAus = end_kante
plan.add_kante(end_kante); plan.set_end_kante(end_kante)

sim.register_plan(plan)

ausl = PAslEinzel(sim); ausl.m_sName = "A"; ausl.m_iBeginTermin = 0
ausl.m_lDlpl = plan
sim.register_ausloeser(ausl)

sim.start()
```

## Event-Trace

| Zeit | sub | Event-Typ | Wirkung |
|---|---|---|---|
| **0** | — | (Sim-Begin) | `on_sim_begin` → Auslöser plant `EvtAuslTriggern` bei t=0 |
| **0** | — | (Periode-Begin) | Pool: `[(0, sub=1, EvtAuslTriggern)]` |
| 0 | 1 | `EvtAuslTriggern` für A | `A.dlpl_ausloesen(trigger)` → `P.dlpl_ausloesen` → PtProzDurchlaufplan `proz_p` erzeugt, `bearbeit_beginnen` → `P.bearbeit_beginnen(proz_p)` → `S.proz_weitergeben(proz_p, ent)` (Startkante!) → an alle Nachfolger weitergeben (= K) → `K.proz_weitergeben(proz_p, ent)` → PtProzZeitvorgabe `proz_k` erzeugt + bearbeit_beginnen → `EvtBearbeitEnde` für proz_k bei t=100 |
| 100 | 2 | `EvtBearbeitEnde` für proz_k | `proz_k.bearbeit_beenden` → `K.on_proz_beendet(proz_k, ent)` → Counter ++, remove_prozess → `K.m_lKanteAus = E` → `E.proz_weitergeben(proz_k, ent)` → Nicht-Startkante → kein Join (1 Vorgänger) → Endkante? Nein, wartet erst PDpKaUebergang. Spiegelprozess erzeugen, `EvtUebergangEnde` für E bei t=110 |
| 110 | 3 | `EvtUebergangEnde` für E | `E.evt_uebergang_ende(spiegel)` → remove from m_lProzesse → `PDlplKante.proz_weitergeben` (Basis) → Endkante? **JA** → `P.on_dlpl_beendet(proz_k.m_oProzOber=proz_p, ent)` → P ist Top-Level (kein m_lKanteAus, kein m_lKnotenOber) → `proz_p.m_oTrigger.on_dlpl_beendet(proz_p)` → `A.on_dlpl_beendet(trigger, proz_p)` → Counter++ → `proz_p.bearbeit_beenden` |
| ... | — | Pool leer für diese Periode | `is_empty(86399)` returns True |
| 86400 | — | (Periode-Ende) | `m_periodNum=1`, `m_periodBegin=86400` |

**Wichtig**: Hier hat die **Start-Kante S keinen** `EvtUebergangEnde`! Bei
`is_start_kante=True` wird der Original-Prozess direkt an alle Nachfolger
weitergegeben (ohne Spiegelprozess, ohne EvtUebergangEnde), siehe
`PDlplKante.proz_weitergeben` Z. 124-136.

**Korrektur** zum vorigen Trace: PDpKaUebergang überschreibt das gesamte
`proz_weitergeben`. Bei IsStartKante=True wird trotzdem ein EvtUebergangEnde
geplant (siehe PDlplKante.cpp:800-802 `else { EvtInsert(EvtEvtUebergangEnde, ...) }`).
Also: **doch** Spiegelprozess auch bei Startkante? **Nein** — bei Startkante
KEIN Spiegelprozess, aber **doch** EvtUebergangEnde.

Korrigierter Trace:

| Zeit | sub | Event-Typ | Wirkung |
|---|---|---|---|
| **0** | — | (Sim-Begin) | `on_sim_begin` → A plant EvtAuslTriggern bei t=0 |
| 0 | 1 | `EvtAuslTriggern` | A → P.dlpl_ausloesen → proz_p erzeugt → P.bearbeit_beginnen → S.proz_weitergeben(proz_p, ent) → S ist PDpKaUebergang → IsStartKante=True → Original-proz_p **ohne Spiegel** in m_lProzesse, EvtUebergangEnde bei t=10 |
| 10 | 3 | `EvtUebergangEnde` für S | proz_p aus S.m_lProzesse raus → PDlplKante.proz_weitergeben Basis → IsStartKante=True → an alle Nachfolger (= K) → K.proz_weitergeben(proz_p, ent) → proz_k erzeugt → bearbeit_beginnen → EvtBearbeitEnde bei t=110 |
| 110 | 2 | `EvtBearbeitEnde` für proz_k | proz_k.bearbeit_beenden → K.on_proz_beendet → Counter++ → E.proz_weitergeben(proz_k, ent) → IsStartKante=False → Spiegel-proz_k erzeugen, EvtUebergangEnde bei t=120 |
| 120 | 3 | `EvtUebergangEnde` für E | spiegel-proz_k aus E.m_lProzesse → PDlplKante.proz_weitergeben Basis → IsEndKante=True → P.on_dlpl_beendet(spiegel-proz_k.m_oProzOber=proz_p, ent) → Top-Level → proz_p.m_oTrigger.on_dlpl_beendet(proz_p) → A.on_dlpl_beendet → Counter++ → proz_p.bearbeit_beenden |
| 86400 | — | (Periode-Ende) | period_end |

## Erwartete Counter nach Sim-Ende

| Counter | Wert | Begründung |
|---|---|---|
| `sim.m_periodNum` | 1 | eine Periode abgeschlossen |
| `ausl.m_iPtkBegAusloesungCount` | 1 | dlpl_ausloesen 1× |
| `ausl.m_iPtkAusloesungCount` | 1 | on_dlpl_beendet 1× |
| `ausl.m_dPtkDurchlaufzeit` | 120.0 | 120 - 0 |
| `plan.m_iPtkProzessCount` | 1 | 1× PtProzDurchlaufplan erzeugt |
| `plan.m_iPtkBegAusloesungCount` | 1 | P.bearbeit_beginnen 1× |
| `plan.m_iPtkAusloesungCount` | 1 | P.on_dlpl_beendet 1× |
| `knoten.m_iPtkProzessCount` | 1 | 1× PtProzZeitvorgabe |
| `knoten.m_iPtkBegAusloesungCount` | 1 | K.bearbeit_beginnen 1× |
| `knoten.m_iPtkAusloesungCount` | 1 | K.on_proz_beendet 1× (während is_ptk) |
| `start_kante.m_iPtkUebergangCount` | 1 | S.proz_weitergeben 1× |
| `start_kante.m_iKummUebergangszeit` | 10 | 10s Übergang 1× |
| `end_kante.m_iPtkUebergangCount` | 1 | E.proz_weitergeben 1× |
| `end_kante.m_iKummUebergangszeit` | 10 | 10s Übergang 1× |
| `sim.evt_get_sum()` | 4 | EvtAuslTriggern + 2× EvtUebergangEnde + 1× EvtBearbeitEnde |

## EventBus-Topic-Reihenfolge

| Zeit | sub | Topic |
|---|---|---|
| 0 | 0 | `sim.begin` |
| 0 | 0 | `sim.period.begin` |
| 0 | 1 | `plan.ausloesen` |
| 0 | 1 | `kante.uebergang.start` (S, ubg_zeit=10) |
| 10 | 3 | `kante.uebergang.ende` (S) |
| 10 | 3 | `kante.weitergeben` (S, in PDlplKante.proz_weitergeben Basis) |
| 10 | 3 | `proz.create` (knoten=K) |
| 10 | 3 | `proz.bearbeit.start` (ende_zeit=110) |
| 110 | 2 | `proz.bearbeit.ende` (K) |
| 110 | 2 | `kante.uebergang.start` (E, ubg_zeit=10) |
| 120 | 3 | `kante.uebergang.ende` (E) |
| 120 | 3 | `kante.weitergeben` (E, in Basis-Routing) |
| 120 | 3 | `plan.beendet_intern` (P) |
| 120 | 3 | `plan.beendet` (A, dauer=120) |
| 86400 | 3 | `sim.period.end` |

**Anmerkung**: `kante.weitergeben` wird nur **einmal pro Kante** emittiert —
in `PDlplKante.proz_weitergeben` (Basis), die nach `EvtUebergangEnde` durch
das übergeordnete `evt_uebergang_ende` aufgerufen wird. Die
PDpKaUebergang-spezifische `proz_weitergeben` (die das EvtUebergangEnde
plant) emittiert nur `kante.uebergang.start` — sie überschreibt die Basis
vollständig und routet nicht selbst.
