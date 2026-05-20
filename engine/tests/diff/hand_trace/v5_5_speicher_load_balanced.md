# V5.5 Hand-Trace: Knoten mit 2 Speichern, Load-Balancing

Zweck: papier-genauer Trace des load-balanced Speicher-Pfads. 3 Auslöser
triggern einen Knoten K, der seine Prozesse über eine PAssozSpeicher in
2 verfügbare Prozess-Speicher S1 und S2 verteilt.

Die Verteilung folgt C++ `PAssozSpeicher::HoleSpeicher`: der Speicher
mit der MINIMALEN Prozess-Anzahl wird gewählt (bei Gleichstand: der
LETZTE in der Liste — wegen `<=`-Vergleich in C++).

Da in V5.5 die Aktor-Schiene (PRessBeleg-Entnahme) noch nicht aktiv ist,
bleiben die Prozesse in den Speichern liegen.

## Setup

```python
sim = PSimulator()

s1 = PSpeicherProz(sim); s1.m_sName = "S1"; sim.register_speicher_proz(s1)
s2 = PSpeicherProz(sim); s2.m_sName = "S2"; sim.register_speicher_proz(s2)

assoz = PAssozSpeicher(sim); assoz.m_sName = "K->[S1,S2]"
assoz.m_lSpeicher.extend([s1, s2])

knoten = PDpKnKonstant(sim); knoten.m_sName = "K"
knoten.m_iDurchfuehrungszeit = 100
sim.register_knoten(knoten)
knoten.set_assoziation_speicher(assoz)

for i, t in enumerate((10, 20, 30)):
    a = PAslEinzel(sim); a.m_sName = f"A{i+1}"
    a.m_iBeginTermin = t; a.m_lDlpl = knoten
    sim.register_ausloeser(a)

sim.start()
```

## Event-Trace

| Zeit | Event | hole_speicher-Entscheidung | S1 | S2 |
|---|---|---|---|---|
| 0 | (Sim-Begin) | — | leer | leer |
| 10 | EvtAuslTriggern (A1) | beide leer (=0). C++ `<=` ⇒ **letzter (S2)** | leer (0) | proz_A1 (1) |
| 20 | EvtAuslTriggern (A2) | S1=0, S2=1 → S1 ist kleiner ⇒ **S1** | proz_A2 (1) | proz_A1 (1) |
| 30 | EvtAuslTriggern (A3) | S1=1, S2=1 → Gleichstand, `<=` ⇒ **letzter (S2)** | proz_A2 (1) | proz_A1, proz_A3 (2) |
| ... | Pool leer (kein BearbeitEnde geplant) | — | (1) | (2) |
| 86400 | Periode-Ende | — | (1) | (2) |

## Erwartete Werte

| Counter | Wert | Begründung |
|---|---|---|
| `knoten.m_iPtkProzessCount` | 3 | 3× Proz erzeugt durch proz_weitergeben |
| `knoten.m_iPtkBegAusloesungCount` | 0 | KEIN bearbeit_beginnen (Speicher-Pfad) |
| `knoten.m_iPtkAusloesungCount` | 0 | nichts beendet |
| `knoten.m_lProzesse` | [] | keine Prozesse direkt am Knoten |
| `s1.get_proz_anzahl()` | 1 | A2 |
| `s2.get_proz_anzahl()` | 2 | A1, A3 |
| `a1.m_iPtkBegAusloesungCount` | 1 | dlpl_ausloesen 1× |
| `a1.m_iPtkAusloesungCount` | 0 | nie on_dlpl_beendet (kein Aktor) |

## EventBus-Topics

| Zeit | Topic | Felder |
|---|---|---|
| 10 | `proz.create` | proz_id=A1.trig0\|K |
| 10 | `speicher.einfuegen` | speicher=S2, anzahl=1 |
| 20 | `proz.create` | proz_id=A2.trig0\|K |
| 20 | `speicher.einfuegen` | speicher=S1, anzahl=1 |
| 30 | `proz.create` | proz_id=A3.trig0\|K |
| 30 | `speicher.einfuegen` | speicher=S2, anzahl=2 |

## Wichtige Beobachtungen

1. **Last-Balancing**: C++ verwendet `<=`-Vergleich, was bei Gleichstand
   den LETZTEN Speicher in der Liste bevorzugt — nicht den ersten. Das
   ist ein subtiler aber wichtiger Detail: portierter Code muss diese
   Reihenfolgen-Semantik beibehalten.

2. **Aktor-Pipeline noch passiv**: in V5.5 bleiben die Prozesse in den
   Speichern, da kein PRessBeleg-Aktor (mit `m_bAktAsActor=True`) und
   keine `ProzWaehlen`-Logik existiert. Phase 3 macht das scharf:
   `PSpeicherProz.proz_einfuegen` ruft bereits jetzt
   `m_lRessourcen[i].on_proz_eingefuegt(self, proz)` für jeden
   angeschlossenen Aktor — der wird dann auf das Event reagieren und
   den Proz aus dem Speicher entnehmen.

3. **Knoten-Counter-Asymmetrie**: `m_iPtkProzessCount` (Anzahl
   instanziierter Prozesse) zählt weiter, aber
   `m_iPtkBegAusloesungCount` (Bearbeit-Beginn-Versuche) bleibt 0, weil
   im Speicher-Pfad kein `bearbeit_beginnen` aufgerufen wird. Das ist
   1:1 zum C++-Pfad in PDpKnZeitvorgabe.cpp:52-56.

4. **Auslöser-Asymmetrie**: `m_iPtkBegAusloesungCount` am Auslöser
   zählt (jeder Trigger erhöht), aber `m_iPtkAusloesungCount` (Plan
   beendet) bleibt 0 — Auslöser bekommt nie `on_dlpl_beendet` weil der
   Knoten nie fertig wird.
