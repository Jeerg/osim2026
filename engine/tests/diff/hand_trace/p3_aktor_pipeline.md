# Phase 3 Hand-Trace: Aktor-Pipeline

Zweck: papier-genauer Trace des Aktor-Pfads für
`test_p3_aktor.py::test_p3_aktor_eventbus_topic_reihenfolge`.

Knoten → AssozSpeicher → Speicher → Aktor. Der Aktor zieht den Prozess
aus dem Speicher, belegt sich selbst und führt aus. Am Ende sucht er den
nächsten Prozess; bei leerem Speicher endet die Kaskade.

## Setup

```python
sim = PSimulator()

aktor = PBetriebsmittel(sim); aktor.m_sName = "Aktor"
sim.register_ressource(aktor)

sp = PSpeicherProz(sim); sp.m_sName = "S"
sim.register_speicher_proz(sp)
aktor.attach_speicher(sp)            # bidirektional

assoz = PAssozSpeicher(sim); assoz.m_lSpeicher.append(sp)

knoten = PDpKnKonstant(sim); knoten.m_sName = "K"
knoten.m_iDurchfuehrungszeit = 50
sim.register_knoten(knoten)
knoten.set_assoziation_speicher(assoz)

ausl = PAslEinzel(sim); ausl.m_iBeginTermin = 20
ausl.m_lDlpl = knoten; sim.register_ausloeser(ausl)

sim.start()
```

## Event-Trace

| Zeit | Event | Wirkung | Aktor | Speicher |
|---|---|---|---|---|
| 0 | (Sim-Begin) | Auslöser plant EvtAuslTriggern@20. Aktor rsFrei. Speicher leer. | RS_FREI | [] |
| 20 | EvtAuslTriggern (A) | A.dlpl_ausloesen → K.proz_weitergeben → proz_K1 erzeugt. K.m_lAssozSpeich gesetzt → **assoz.platziere_proz(proz_K1)** → hole_speicher (load-balanced, nur S) → **sp.proz_einfuegen(proz_K1)**: m_lProzesse=[proz_K1], Listener-Notify, **Bus `speicher.einfuegen`** (anzahl=1). Dann Aktor-Notifikation: **aktor.on_proz_eingefuegt(sp, proz_K1)**: m_bAktAsActor=True, owProz=proz_waehlen(proz_K1, sp) → proz_K1 (m_oSpeiProz=sp), **bearbeit_beginnen_aktiv(proz_K1)**: proz_K1.m_oAktor=None → ok, **aktor.ress_verfuegbar(proz_K1)** (Counter++, rsFrei → True), proz_K1.m_oAktor=aktor, **K.bearbeit_beginnen(proz_K1)**: BegCount++=1, proz.ress_verfuegbar (k_lAssozRess leer → True), `_knoten_begin_zeit=20`, listener.on_proz_bearbeit_beginn, **proz_K1.bearbeit_beginnen** (PtProzZeitvorgabe): zeitinhalt=50, m_iBearbeitBeginn=20, super → status PT_BEARB, **aktor.on_akt_beginn(proz_K1)**: sp.m_lProzesse.remove(proz_K1), **sp.on_proz_entnommen**: Bus `speicher.entnommen`, **aktor.ress_belegen(proz_K1)**: rsBelegt, m_oProzCurrent=proz_K1, Bus `ress.belegen`. relations.on_proz_beginn (proz.m_oRelationen leer). EvtBearbeitEnde@70, Bus `proz.bearbeit.start`. | RS_BELEGT | [] |
| 70 | EvtBearbeitEnde (proz_K1) | proz_K1.bearbeit_beenden (PtProzZeitvorgabe): status=PT_ENDE, Bus `proz.bearbeit.ende`, K.on_proz_beendet: AusloesungCount++=1, DLZ+=50, kein KanteAus → A.on_dlpl_beendet (Counter, Dauer=50). super (PtProzess.bearbeit_beenden): **aktor.on_akt_ende(proz_K1)**: on_proz_ende-listener, m_oProzCurrent=None, set_status(RS_FREI) (KEIN Bus `ress.freigeben` — 1:1 zu C++), nächster proz via proz_waehlen() → m_lSpeicher iterieren → sp.m_lProzesse leer → None → bearbeit_beginnen_aktiv(None) wird nicht aufgerufen. relations.on_proz_ende (leer). | RS_FREI | [] |
| ... | Pool leer | — | RS_FREI | [] |
| 86400 | Periode-Ende | m_periodNum=1 | RS_FREI | [] |

## EventBus-Reihenfolge

| Zeit | Topic | Begründung |
|---|---|---|
| 20 | `speicher.einfuegen` | Bus-Emit VOR der Aktor-Notifikation (proz_einfuegen-Order) |
| 20 | `speicher.entnommen` | aktor.on_akt_beginn (synchron in proz.bearbeit_beginnen via super) |
| 20 | `ress.belegen` | aktor.ress_belegen (Aktor belegt sich SELBST) |
| 20 | `proz.bearbeit.start` | EvtBearbeitEnde geplant |
| 70 | `proz.bearbeit.ende` | EvtBearbeitEnde gefeuert |

**KEIN `ress.freigeben` bei t=70**: der Aktor-Pfad in `on_akt_ende` ruft
`set_status(RS_FREI)` direkt, nicht `ress_freigeben` — 1:1 zu C++
PRessBeleg.cpp:1264-1281.

## Wichtige Beobachtungen

1. **Synchrone Kaskade in proz_einfuegen**: Der Aktor sieht den proz
   sofort und entnimmt ihn synchron innerhalb des gleichen
   Sim-Sekundentakts. Der proz ist in `sp.m_lProzesse` nur kurz drin.
   Bus-Emit-Reihenfolge wird durch die Reihenfolge der Operations in
   `proz_einfuegen` gesteuert: `Bus` VOR der Aktor-Schleife.

2. **Counter-Bumps**: `aktor.ress_verfuegbar(proz)` wird einmal vom
   Aktor selbst (in `bearbeit_beginnen_aktiv`) gerufen — erhöht
   `m_iPtkAnfragenGesamt` und `m_iPtkAnfrageErfuellt`. Der Knoten ruft
   sein eigenes `proz.ress_verfuegbar()` für die passiven m_lAssozRess
   (leer in diesem Szenario) — kein doppelter Counter-Bump.

3. **m_oAktor Zwei-Stufen-Setup**: Setzen in
   `bearbeit_beginnen_aktiv` (vor knoten.bearbeit_beginnen, damit
   `proz.bearbeit_beginnen` weiß, dass es einen Aktor gibt). Niemals
   explizit zurückgesetzt in `on_akt_ende` (proz ist fertig); nur in
   `bearbeit_unterbrechen` nach Aktor-Rückgabe.

4. **Pause-Pfad**: Aktor-Pause via PEinsatzzeitPause unterbricht den
   proz wie im V6. Unterschied: `on_akt_unterbr` legt den proz ZURÜCK
   in den Speicher (statt zentrale Warteschlange) und liefert True →
   `PtProzess.bearbeit_unterbrechen` macht KEIN `add_tail` in
   zentraler Warteschlange.

5. **Bidirektionale Verknüpfung**: `attach_speicher` pflegt sowohl
   `aktor.m_lSpeicher` als auch `speicher.m_lRessourcen`. Beide Listen
   sind in C++ als `$link`-Felder definiert.
