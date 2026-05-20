# P4-B Hand-Trace: PDpKnAlternativTypID

Papier-genauer Trace für `test_p4_b_alternativ.py`. Outer-Plan mit einem
`PDpKnAlternativTypID` (3 Alternativen: ID 1/2/3, Dauern 10/50/100).
Auslöser-Parameter `"id"` wählt eine Alternative — bei kein Match
greift der Fallback "letzte Alternative" (C++-Original-Kommentar:
"Falls keine Alterantive gefunden wurde, wird immer die letzte
genommen!", PDpKnAlternativ.cpp:728).

Bezugscode: `pps/knoten/alternativ.py` + `OSimPro/PDpKnAlternativ.cpp`.

Zwei Szenarien:
- **A** — `id=2` → mittlere Alternative (Alt1, Dauer 50) wird gewählt
- **B** — `id=99` → kein Match → letzte Alternative (Alt2, Dauer 100)

## Setup (gemeinsam)

```python
sim = PSimulator()
alt_kn = PDpKnAlternativTypID(sim); alt_kn.m_sName = "Alt"

for i, (auswahl_id, dauer) in enumerate([(1, 10), (2, 50), (3, 100)]):
    sub = PDurchlaufplan(sim); sub.m_sName = f"Sub{i}"
    inner = PDpKnKonstant(sim); inner.m_sName = f"Sub{i}.K"
    inner.m_iDurchfuehrungszeit = dauer
    sub.add_knoten(inner)
    kS = PDpKaUebergang(sim); kS.m_sName = f"Sub{i}.S"; kS.m_iUebergangszeit = 0
    kE = PDpKaUebergang(sim); kE.m_sName = f"Sub{i}.E"; kE.m_iUebergangszeit = 0
    sub.add_kante(kS); sub.add_kante(kE)
    sub.set_start_kante(kS); kS.m_lNachfolger.append(inner); inner.m_lKanteEin = kS
    inner.m_lKanteAus = kE; kE.m_lVorgaenger.append(inner); sub.set_end_kante(kE)
    alt = PAlternativeTypID(sim, dlpl=sub, auswahl_id=auswahl_id)
    alt.m_sName = f"Alt{i}"
    alt_kn.add_alternative(alt)                # → sub.m_lKnotenOber = alt_kn

outer = PDurchlaufplan(sim); outer.m_sName = "Outer"
outer.add_knoten(alt_kn)
okS = PDpKaUebergang(sim); okS.m_sName = "Out.S"; okS.m_iUebergangszeit = 0
okE = PDpKaUebergang(sim); okE.m_sName = "Out.E"; okE.m_iUebergangszeit = 0
outer.add_kante(okS); outer.add_kante(okE)
outer.set_start_kante(okS); okS.m_lNachfolger.append(alt_kn); alt_kn.m_lKanteEin = okS
alt_kn.m_lKanteAus = okE; okE.m_lVorgaenger.append(alt_kn); outer.set_end_kante(okE)

sim.register_plan(outer)
ausl = PAslEinzel(sim); ausl.m_sName = "A"; ausl.m_iBeginTermin = 0
ausl.m_lDlpl = outer
ausl.m_lParameter.append(PParameterID(sim, wert=AUSW_ID))   # 2 oder 99
sim.register_ausloeser(ausl)

sim.start()
```

## Event-Trace (Szenario A: id=2 → Alt1)

| Zeit | Phase | Wirkung |
|---|---|---|
| **0** | Sim-Begin | `A` plant `EvtAuslTriggern` bei t=0 |
| 0 | Auslösung | `A.dlpl_ausloesen` → `Outer.dlpl_ausloesen` → `proz_outer` erzeugt → `Outer.bearbeit_beginnen` → `Out.S.proz_weitergeben(proz_outer)` → IsStartKante → `EvtUebergangEnde` für Out.S bei t=0 |
| 0 | Eintritt Alt | `EvtUebergangEnde` Out.S → `Alt.proz_weitergeben(proz_outer, ent)` → `alternative_auswaehlen`: id=2 matcht `Alt1.m_iAuswahlID=2` → Rückgabe Alt1 → `PtProzAlternativ proz_A` erzeugt mit `m_oAlternative=Alt1`, `m_sName="Alt"` → Trigger.on_prz_created → AddProzess → `proz.create` (mit `alternative="Alt1"`) → `Alt.bearbeit_beginnen` → Basis (ProzessCount++, BegAusloesungCount++, listener, proz.bearbeit_beginnen) → `Alt1.m_lDlpl.proz_weitergeben(proz_A, ent)` → `Sub1.dlpl_ausloesen` → `proz_sub` erzeugt → `Sub1.bearbeit_beginnen` → `Sub1.S.proz_weitergeben` → IsStartKante → `EvtUebergangEnde` für Sub1.S bei t=0 |
| 0 | Sub-Knoten Start | `EvtUebergangEnde` Sub1.S → `Sub1.K.proz_weitergeben` → `proz_K` erzeugt → `bearbeit_beginnen` → `EvtBearbeitEnde` bei t=50 |
| **50** | Sub-Knoten Ende | `proz_K.bearbeit_beenden` → `Sub1.K.on_proz_beendet` → AusloesungCount++ → `Sub1.E.proz_weitergeben` → IsEndKante → Spiegel-Prozess, `EvtUebergangEnde` für Sub1.E bei t=50 |
| 50 | Sub-Plan-Ende | `EvtUebergangEnde` Sub1.E → IsEndKante → `Sub1.on_dlpl_beendet(proz_sub.m_oProzOber=proz_A, ent)` → `Sub1.m_lKnotenOber=Alt` → `Alt.on_proz_sub_beendet(proz_A, ent)`: (1) `Alt.m_lKanteAus=Out.E` → `Out.E.proz_weitergeben(proz_A, ent)` → emit `kante.uebergang.start` Out.E, `EvtUebergangEnde` bei t=50; (2) `on_proz_bearbeit_ende(proz_A)`: `Alt1.m_iPtkAuswahlCount++` → AusloesungCount++ → DLZ-Schließen → Listener-Notify; (3) `remove_prozess(proz_A)` → `proz_A.bearbeit_beenden` |
| 50 | Plan-Ende | `EvtUebergangEnde` Out.E → IsEndKante → `Outer.on_dlpl_beendet(proz_A.m_oProzOber=proz_outer)` → `A.on_dlpl_beendet` → AusloesungCount++ → `proz_outer.bearbeit_beenden` |
| 86400 | Period-End | `sim.period.end` |

## Reihenfolge-Subtilitäten

1. **`alternative_auswaehlen` wird IN `proz_weitergeben` aufgerufen** (Schritt 1 in
   C++ PDpKnAlternativ.cpp:50-81) — vor `add_prozess`/`bus.emit("proz.create")`.
   Deshalb trägt das `proz.create`-Event bereits `alternative="Alt1"` im Payload.
2. **`on_proz_bearbeit_ende` läuft NACH `m_lKanteAus.proz_weitergeben`.**
   Das heißt: Listener und Auswahl-Counter werden NACH der Weitergabe gefeuert.
   Da die End-Kante mit ubg_zeit=0 sofort den Folge-Event scheduled (nicht
   synchron ausführt), bleibt die Reihenfolge sauber sub-time-geordnet.
3. **Fallback-Verhalten (Szenario B):** `id=99` matcht keine Alternative
   → `alternative_auswaehlen` gibt `m_lAlternativen[-1]` zurück (Alt2,
   Dauer 100). Die Topic-Sequenz ist strukturgleich zu Szenario A, nur
   die `Sub<i>`-Namen verschieben sich von `Sub1` zu `Sub2` und die
   Dauer von 50 auf 100.

## Erwartete Counter (Szenario A: id=2 → Alt1, dauer=50)

| Counter | Wert | Begründung |
|---|---|---|
| `sim.m_periodNum` | 1 | eine Periode |
| `ausl.m_iPtkBegAusloesungCount` | 1 | A löst 1× aus |
| `ausl.m_iPtkAusloesungCount` | 1 | A.on_dlpl_beendet 1× |
| `ausl.m_dPtkDurchlaufzeit` | 50.0 | Dauer Alt1.Sub1.K |
| `outer.m_iPtkProzessCount` | 1 | 1× proz_outer |
| `outer.m_iPtkBegAusloesungCount` | 1 | Outer.bearbeit_beginnen 1× |
| `outer.m_iPtkAusloesungCount` | 1 | Outer.on_dlpl_beendet 1× |
| `alt_kn.m_iPtkProzessCount` | 1 | 1× proz_A |
| `alt_kn.m_iPtkBegAusloesungCount` | 1 | Alt.bearbeit_beginnen 1× |
| `alt_kn.m_iPtkAusloesungCount` | 1 | über on_proz_bearbeit_ende |
| `alt_kn.m_iPtkProzRefuseCount` | 0 | kein Refuse |
| `alt_kn.m_lAlternativen[0].m_iPtkAuswahlCount` | 0 | Alt0 nicht gewählt |
| `alt_kn.m_lAlternativen[1].m_iPtkAuswahlCount` | 1 | Alt1 gewählt |
| `alt_kn.m_lAlternativen[2].m_iPtkAuswahlCount` | 0 | Alt2 nicht gewählt |
| `Sub1.m_iPtkProzessCount` | 1 | 1× proz_sub |
| `Sub1.m_iPtkAusloesungCount` | 1 | Sub1.on_dlpl_beendet 1× |
| `Sub1.K.m_iPtkProzessCount` | 1 | 1× proz_K |
| `Sub1.K.m_iPtkAusloesungCount` | 1 | Sub1.K.on_proz_beendet 1× |
| `Sub0.*` / `Sub2.*` Counter | 0 | nicht-gewählte Alternativen bleiben unberührt |
| `okS.m_iPtkUebergangCount` | 1 | Out.S 1× |
| `okE.m_iPtkUebergangCount` | 1 | Out.E 1× |
| Sub1.S / Sub1.E `m_iPtkUebergangCount` | 1 | nur die Kanten der gewählten Alternative |
| `sim.evt_get_sum()` | 6 | 1× EvtAuslTriggern + 4× EvtUebergangEnde + 1× EvtBearbeitEnde |

## EventBus-Topic-Reihenfolge (Szenario A: id=2 → Alt1)

| Zeit | sub | Topic | Anmerkung |
|---|---|---|---|
| 0 | 0 | `sim.begin` | |
| 0 | 0 | `sim.period.begin` | |
| 0 | 1 | `plan.ausloesen` | A → Outer |
| 0 | 1 | `kante.uebergang.start` | Out.S |
| 0 | 3 | `kante.uebergang.ende` | Out.S |
| 0 | 3 | `kante.weitergeben` | Out.S |
| 0 | 3 | `proz.create` | knoten=Alt, **alternative="Alt1"** |
| 0 | 3 | `kante.uebergang.start` | Sub1.S |
| 0 | 3 | `kante.uebergang.ende` | Sub1.S |
| 0 | 3 | `kante.weitergeben` | Sub1.S |
| 0 | 3 | `proz.create` | knoten=Sub1.K |
| 0 | 3 | `proz.bearbeit.start` | Sub1.K, ende_zeit=50 |
| 50 | 2 | `proz.bearbeit.ende` | Sub1.K |
| 50 | 2 | `kante.uebergang.start` | Sub1.E |
| 50 | 3 | `kante.uebergang.ende` | Sub1.E |
| 50 | 3 | `kante.weitergeben` | Sub1.E |
| 50 | 3 | `plan.beendet_intern` | Sub1 |
| 50 | 3 | `kante.uebergang.start` | Out.E |
| 50 | 3 | `kante.uebergang.ende` | Out.E |
| 50 | 3 | `kante.weitergeben` | Out.E |
| 50 | 3 | `plan.beendet_intern` | Outer |
| 50 | 3 | `plan.beendet` | A, dauer=50 |
| 86400 | 3 | `sim.period.end` | |

## Erwartete Counter (Szenario B: id=99 → Fallback Alt2, dauer=100)

Strukturgleich; nur:
- `ausl.m_dPtkDurchlaufzeit` = 100.0
- `m_iPtkAuswahlCount`: Alt0=0, Alt1=0, **Alt2=1**
- `Sub2.*` und `Sub2.K.*` Counter = 1 (statt Sub1)
- Alle Sub-Time-Stempel der zweiten Hälfte verschieben sich von t=50 auf t=100
- `evt_get_sum()` = 6 (gleich)
