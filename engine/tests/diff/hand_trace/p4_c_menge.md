# P4-C Hand-Trace: PDpKnMenge + PDpKnMengeRuesten

Papier-genauer Trace für `test_p4_c_menge.py`. Plan mit einem einzigen
Menge-Knoten, der die Durchführungszeit über den Auslöser-Parameter
`"menge"` berechnet.

Bezugscode: `pps/knoten/zeitvorgabe.py` + `OSimPro/PDpKnZeitvorgabe.cpp`.

Zwei Szenarien — gleiche End-Zeit (50), aber andere Zerlegung:
- **A** — `PDpKnMenge` mit `menge=5`, `dfz_pro_einheit=10` → Dauer = 5×10 = 50
- **B** — `PDpKnMengeRuesten` mit `menge=3`, `dfz_pro_einheit=10`,
  `ruestzeit=20` → Dauer = 3×10 + 20 = 50

## Setup (Szenario A)

```python
sim = PSimulator()
knoten = PDpKnMenge(sim); knoten.m_sName = "M"
knoten.m_iDfzProEinheit = 10

plan = PDurchlaufplan(sim); plan.m_sName = "Plan"; plan.add_knoten(knoten)
kS = PDpKaUebergang(sim); kS.m_sName = "S"; kS.m_iUebergangszeit = 0
kE = PDpKaUebergang(sim); kE.m_sName = "E"; kE.m_iUebergangszeit = 0
plan.add_kante(kS); plan.add_kante(kE)
plan.set_start_kante(kS); kS.m_lNachfolger.append(knoten); knoten.m_lKanteEin = kS
knoten.m_lKanteAus = kE; kE.m_lVorgaenger.append(knoten); plan.set_end_kante(kE)

sim.register_plan(plan)
ausl = PAslEinzel(sim); ausl.m_sName = "A"; ausl.m_iBeginTermin = 0
ausl.m_lDlpl = plan
ausl.m_lParameter.append(PParameterMenge(sim, wert=5))
sim.register_ausloeser(ausl)

sim.start()
```

Szenario B ersetzt `PDpKnMenge` durch `PDpKnMengeRuesten` mit
`m_iRuestzeit=20` und `menge=3`.

## Event-Trace (Szenario A)

| Zeit | Phase | Wirkung |
|---|---|---|
| **0** | Sim-Begin | `A` plant `EvtAuslTriggern` bei t=0 |
| 0 | Auslösung | `A.dlpl_ausloesen` → `Plan.dlpl_ausloesen` → `proz_plan` erzeugt → `Plan.bearbeit_beginnen` → `S.proz_weitergeben(proz_plan)` → IsStartKante → `EvtUebergangEnde` für S bei t=0 |
| 0 | Knoten-Start | `EvtUebergangEnde` S → `kante.weitergeben` → `M.proz_weitergeben(proz_plan, ent)` → `PtProzZeitvorgabe proz_K` erzeugt, `m_sName="Plan\|M"` → `proz.create` → `add_prozess` + `M.bearbeit_beginnen` → Basis-Logik: `_knoten_begin_zeit=0`, `get_durchfuehrungszeit(proz_K)`: liest `ausl.m_lParameter.hole_parameter_int("menge", 0)=5`, `m_bIsProduktionEnde=False` → Kum-Counter: `m_iPtkKumDurchfuehrungszeit += 5×10 = 50`, `m_iPtkDurchfuehrungszeitCount=1`, **return 50** → `proz.bearbeit_beginnen` → `EvtBearbeitEnde` bei t=50 |
| **50** | Knoten-Ende | `proz_K.bearbeit_beenden` → `M.on_proz_beendet` → DLZ-Schließen, `AusloesungCount++` → `E.proz_weitergeben` → IsEndKante → Spiegel-Prozess, `EvtUebergangEnde` für E bei t=50 |
| 50 | Plan-Ende | `EvtUebergangEnde` E → IsEndKante → `Plan.on_dlpl_beendet(proz_K.m_oProzOber=proz_plan, ent)` → Top-Level → `proz_plan.m_oTrigger.on_dlpl_beendet(proz_plan)` → `A.on_dlpl_beendet` → AusloesungCount++ → `proz_plan.bearbeit_beenden` |
| 86400 | Period-End | `sim.period.end` |

## Reihenfolge-Subtilitäten

1. **`get_durchfuehrungszeit` wird IN `bearbeit_beginnen` aufgerufen** (genauer:
   in der `PDpKnZeitvorgabe`-Basis vor dem `proz.bearbeit_beginnen` des Prozesses).
   Das bedeutet: der Kum-Counter `m_iPtkKumDurchfuehrungszeit` ist BEREITS
   inkrementiert, BEVOR das `proz.bearbeit.start`-Event den Bus erreicht.
   Wer den Counter pro Event lesen möchte, muss sich auf den Zeitpunkt
   NACH `proz.bearbeit.start` verlassen.
2. **`m_iPtkDurchfuehrungszeitCount` zählt die Berechnungs-Aufrufe**, nicht
   die Ausführungen. Bei Wiederaufnahme nach Pause (V6) würde der Counter
   nicht erneut hochlaufen — die Dauer wird in `bearbeit_beginnen` nur
   einmal beim ersten Eintritt berechnet.
3. **`PDpKnMengeRuesten` zählt die Gesamtdauer** in den Kum-Counter
   (inkl. Rüstzeit), nicht nur den Mengen-Anteil. Im
   Produktionsende-Branch wird der Kum-Counter NICHT geführt (1:1 zu C++:
   die Reduktion wird vor dem Return berechnet, der `+=` ist im
   non-Produktionsende-Pfad).
4. **`menge=0`** ergibt `get_durchfuehrungszeit() → 0`, der Prozess läuft
   synchron durch (kein `EvtBearbeitEnde` nötig — `proz.bearbeit_beginnen`
   meldet sofort fertig). Counter werden trotzdem geführt.

## Erwartete Counter (Szenario A: PDpKnMenge, menge=5, dfz=10)

| Counter | Wert | Begründung |
|---|---|---|
| `sim.m_periodNum` | 1 | eine Periode |
| `ausl.m_iPtkBegAusloesungCount` | 1 | A löst 1× aus |
| `ausl.m_iPtkAusloesungCount` | 1 | A.on_dlpl_beendet 1× |
| `ausl.m_dPtkDurchlaufzeit` | 50.0 | 5×10 |
| `plan.m_iPtkProzessCount` | 1 | 1× proz_plan |
| `plan.m_iPtkBegAusloesungCount` | 1 | Plan.bearbeit_beginnen 1× |
| `plan.m_iPtkAusloesungCount` | 1 | Plan.on_dlpl_beendet 1× |
| `knoten.m_iPtkProzessCount` | 1 | 1× proz_K |
| `knoten.m_iPtkBegAusloesungCount` | 1 | M.bearbeit_beginnen 1× |
| `knoten.m_iPtkAusloesungCount` | 1 | M.on_proz_beendet 1× |
| `knoten.m_iPtkKumDurchfuehrungszeit` | 50 | 5×10, einmalig in get_durchfuehrungszeit |
| `knoten.m_iPtkDurchfuehrungszeitCount` | 1 | 1× berechnet |
| `knoten.m_dPtkDurchlaufzeit` | 50.0 | DLZ = Dauer (keine Pausen) |
| `kS.m_iPtkUebergangCount` | 1 | S 1× |
| `kE.m_iPtkUebergangCount` | 1 | E 1× |
| `sim.evt_get_sum()` | 4 | 1× EvtAuslTriggern + 2× EvtUebergangEnde + 1× EvtBearbeitEnde |

## EventBus-Topic-Reihenfolge (Szenario A)

| Zeit | sub | Topic | Anmerkung |
|---|---|---|---|
| 0 | 0 | `sim.begin` | |
| 0 | 0 | `sim.period.begin` | |
| 0 | 1 | `plan.ausloesen` | A → Plan |
| 0 | 1 | `kante.uebergang.start` | S |
| 0 | 3 | `kante.uebergang.ende` | S |
| 0 | 3 | `kante.weitergeben` | S |
| 0 | 3 | `proz.create` | knoten=M |
| 0 | 3 | `proz.bearbeit.start` | M, ende_zeit=50 |
| 50 | 2 | `proz.bearbeit.ende` | M |
| 50 | 2 | `kante.uebergang.start` | E |
| 50 | 3 | `kante.uebergang.ende` | E |
| 50 | 3 | `kante.weitergeben` | E |
| 50 | 3 | `plan.beendet_intern` | Plan |
| 50 | 3 | `plan.beendet` | A, dauer=50 |
| 86400 | 3 | `sim.period.end` | |

## Erwartete Counter (Szenario B: PDpKnMengeRuesten, menge=3, dfz=10, ruest=20)

Strukturgleich zur Szenario A — gleiche End-Zeit (50), gleiche Event-Anzahl
(`evt_get_sum=4`), gleiche Topic-Reihenfolge. Nur die Knoten-Counter und
der innere Aufbau der Dauer ändern sich:

| Counter | Wert | Begründung |
|---|---|---|
| `ausl.m_dPtkDurchlaufzeit` | 50.0 | (3×10) + 20 |
| `knoten.m_iPtkKumDurchfuehrungszeit` | 50 | Gesamtdauer (inkl. 20 Rüstzeit) |
| `knoten.m_iPtkDurchfuehrungszeitCount` | 1 | 1× berechnet |

Topic-Reihenfolge identisch zu Szenario A (knoten heißt nur "MR" statt "M").
