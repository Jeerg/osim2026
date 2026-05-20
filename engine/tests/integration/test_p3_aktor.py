"""Phase 3: Aktor-Pipeline aktiv.

Bringt die V5.5-Speicher-Infrastruktur zum Leben: PRessBeleg im Aktor-
Modus (m_bAktAsActor=True) entnimmt Prozesse aus angeschlossenen
PSpeicherProz und bearbeitet sie. Knoten → Speicher → Aktor → Bearbeitung
→ on_akt_ende → nächster Prozess.

Test-Szenarien:
    A) 1 Aktor + 1 Speicher + 1 Proz → Aktor zieht und bearbeitet
    B) 1 Aktor + 1 Speicher + 3 Prozesse → Aktor wählt sukzessive
    C) 2 Aktoren auf 1 Speicher → erster nimmt, zweiter idle
    D) Aktor in Pause durch PEinsatzzeitPause → proz unterbrochen,
       on_akt_unterbr legt zurück in Speicher → Resume nach Pause
    E) attach_speicher ist bidirektional
"""

from __future__ import annotations

from osim_engine.observability.sinks.testing import TraceCaptureSink
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator
from osim_engine.resources.assoziation.speicher import PAssozSpeicher
from osim_engine.resources.beleg import PBetriebsmittel, RessStatus
from osim_engine.resources.einsatzzeit import PEinsatzzeitPause, PPauseZyklus
from osim_engine.resources.speicher import PSpeicherProz


def _build_aktor_pipeline(
    *, knoten_dauer: int, ausl_times: tuple[int, ...]
) -> PSimulator:
    """Standard-Setup: Knoten → AssozSpeicher → 1 Speicher → 1 Aktor."""
    sim = PSimulator()

    aktor = PBetriebsmittel(sim); aktor.m_sName = "Aktor"
    sim.register_ressource(aktor)

    sp = PSpeicherProz(sim); sp.m_sName = "S"
    sim.register_speicher_proz(sp)
    aktor.attach_speicher(sp)

    assoz = PAssozSpeicher(sim); assoz.m_sName = "K->S"
    assoz.m_lSpeicher.append(sp)

    knoten = PDpKnKonstant(sim); knoten.m_sName = "K"
    knoten.m_iDurchfuehrungszeit = knoten_dauer
    sim.register_knoten(knoten)
    knoten.set_assoziation_speicher(assoz)

    for i, t in enumerate(ausl_times):
        a = PAslEinzel(sim); a.m_sName = f"A{i + 1}"
        a.m_iBeginTermin = t; a.m_lDlpl = knoten
        sim.register_ausloeser(a)

    return sim


# ----------------------------------------------------------------------
# A) 1 Aktor, 1 Proz
# ----------------------------------------------------------------------


def test_p3_aktor_zieht_und_bearbeitet_proz() -> None:
    """1 Aktor, 1 Speicher, 1 Proz @t=10 dauer=100. Aktor zieht den proz
    aus dem Speicher, belegt sich selbst, bearbeitet 100s, wird frei.
    """
    sim = _build_aktor_pipeline(knoten_dauer=100, ausl_times=(10,))
    sim.start()

    aktor = sim.m_lRessBeleg[0]
    sp = sim.m_lSpeichProz[0]
    knoten = sim.m_lKnoten[0]

    # Aktor war aktiv
    assert aktor.m_bAktAsActor is True
    # Speicher leer am Ende (proz entnommen)
    assert sp.get_proz_anzahl() == 0
    # Aktor wieder frei am Ende
    assert aktor.m_rsStatus == RessStatus.RS_FREI
    # Auslöser hat 1× abgeschlossen
    assert sim.m_lAusl[0].m_iPtkAusloesungCount == 1
    assert sim.m_lAusl[0].m_dPtkDurchlaufzeit == 100
    # Knoten: ein Begin (im Aktor-bearbeit_beginnen_aktiv-Pfad),
    # ein Ausloesung-Ende
    assert knoten.m_iPtkBegAusloesungCount == 1
    assert knoten.m_iPtkAusloesungCount == 1


def test_p3_aktor_eventbus_topic_reihenfolge() -> None:
    """Topic-Reihenfolge: speicher.einfuegen → speicher.entnommen →
    ress.belegen → proz.bearbeit.start → proz.bearbeit.ende.
    """
    sim = _build_aktor_pipeline(knoten_dauer=50, ausl_times=(20,))

    sink = TraceCaptureSink()
    sim.bus.subscribe("speicher.*", sink)
    sim.bus.subscribe("ress.*", sink)
    sim.bus.subscribe("proz.bearbeit.*", sink)
    sim.start()

    topics = [(r.sim_time, r.topic) for r in sink.records]
    # speicher.einfuegen + speicher.entnommen synchron bei t=20,
    # ress.belegen bei t=20 (Aktor belegt sich), proz.bearbeit.start
    # bei t=20, proz.bearbeit.ende bei t=70. KEIN ress.freigeben
    # (Aktor-Pfad ruft set_status direkt, nicht ress_freigeben).
    assert topics == [
        (20, "speicher.einfuegen"),
        (20, "speicher.entnommen"),
        (20, "ress.belegen"),
        (20, "proz.bearbeit.start"),
        (70, "proz.bearbeit.ende"),
    ]


# ----------------------------------------------------------------------
# B) Aktor wählt sukzessive in on_akt_ende
# ----------------------------------------------------------------------


def test_p3_aktor_kaskade_drei_prozesse_hintereinander() -> None:
    """3 Aufträge @t=10,20,30 dauer=50. Erster wird sofort vom Aktor
    gezogen. A2/A3 landen im Speicher, weil Aktor noch belegt. Bei
    on_akt_ende des ersten holt sich Aktor den nächsten aus dem Speicher.
    """
    sim = _build_aktor_pipeline(knoten_dauer=50, ausl_times=(10, 20, 30))
    sim.start()

    aktor = sim.m_lRessBeleg[0]
    sp = sim.m_lSpeichProz[0]

    # Alle 3 abgeschlossen, Speicher am Ende leer
    for a in sim.m_lAusl:
        assert a.m_iPtkAusloesungCount == 1
    assert sp.get_proz_anzahl() == 0
    assert aktor.m_rsStatus == RessStatus.RS_FREI
    assert aktor.m_iPtkAnfrageErfuellt == 3


# ----------------------------------------------------------------------
# C) 2 Aktoren auf 1 Speicher
# ----------------------------------------------------------------------


def test_p3_zwei_aktoren_auf_einem_speicher() -> None:
    """2 Aktoren teilen sich einen Speicher. Beim Einfügen werden beide
    via on_proz_eingefuegt notifiziert; der erste ist schneller (linear)
    und holt den proz. Der zweite findet beim BearbeitBeginnen
    proz.m_oAktor != None und macht nichts.
    """
    sim = PSimulator()

    a1 = PBetriebsmittel(sim); a1.m_sName = "A1"; sim.register_ressource(a1)
    a2 = PBetriebsmittel(sim); a2.m_sName = "A2"; sim.register_ressource(a2)

    sp = PSpeicherProz(sim); sp.m_sName = "S"
    sim.register_speicher_proz(sp)
    a1.attach_speicher(sp)
    a2.attach_speicher(sp)

    assoz = PAssozSpeicher(sim); assoz.m_lSpeicher.append(sp)

    knoten = PDpKnKonstant(sim); knoten.m_sName = "K"
    knoten.m_iDurchfuehrungszeit = 100
    sim.register_knoten(knoten)
    knoten.set_assoziation_speicher(assoz)

    ausl = PAslEinzel(sim); ausl.m_iBeginTermin = 10
    ausl.m_lDlpl = knoten
    sim.register_ausloeser(ausl)

    sim.start()

    # A1 (erster in speicher.m_lRessourcen) hat den Proz übernommen
    assert a1.m_iPtkAnfrageErfuellt == 1
    # A2 wurde auch notifiziert, hat aber proz.m_oAktor != None gefunden →
    # bearbeit_beginnen_aktiv returnt False ohne ress_verfuegbar zu rufen
    assert a2.m_iPtkAnfrageErfuellt == 0
    assert a2.m_rsStatus == RessStatus.RS_FREI


# ----------------------------------------------------------------------
# D) Aktor-Pause via PEinsatzzeitPause: proz unterbrochen + Resume
# ----------------------------------------------------------------------


def test_p3_aktor_pause_unterbricht_und_resumiert_aus_speicher() -> None:
    """Aktor wird durch PEinsatzzeitPause unterbrochen. proz.bearbeit_
    unterbrechen ruft m_oAktor.on_akt_unterbr → proz wandert ZURÜCK
    in den Speicher (statt zentrale Warteschlange). Nach Pause-Ende
    feuert on_einsatz_beginn → m_bAktAsActor=True → Aktor holt sich
    den proz wieder.
    """
    sim = _build_aktor_pipeline(knoten_dauer=5000, ausl_times=(35_000,))

    aktor = sim.m_lRessBeleg[0]
    sp = sim.m_lSpeichProz[0]

    # Pause hängen wir an den Aktor direkt
    ez = PEinsatzzeitPause(sim)
    ez.m_lPausen.append(
        PPauseZyklus(m_iPausAnfang=10.0, m_iPausEnde=11.0, m_iPeriode=24.0)
    )
    sim.register_einsatzzeit(ez)
    ez.attach_ressource(aktor)

    sim.start()

    # Auftrag durchgelaufen
    assert sim.m_lAusl[0].m_iPtkAusloesungCount == 1
    # Resume hat funktioniert — zentrale Warteschlange leer
    assert sim.m_oWarteSchl.is_empty()
    # Speicher am Ende leer
    assert sp.get_proz_anzahl() == 0
    # Auslöser-Dauer = Bearbeitung (5000) + Pause (3600) = 8600
    assert sim.m_lAusl[0].m_dPtkDurchlaufzeit == 8600


# ----------------------------------------------------------------------
# E) attach_speicher bidirektional
# ----------------------------------------------------------------------


def test_p3_attach_speicher_bidirektional() -> None:
    """attach_speicher pflegt beide Listen + ist idempotent."""
    sim = PSimulator()
    aktor = PBetriebsmittel(sim); aktor.m_sName = "A"
    sim.register_ressource(aktor)

    sp = PSpeicherProz(sim); sp.m_sName = "S"
    sim.register_speicher_proz(sp)

    aktor.attach_speicher(sp)
    assert sp in aktor.m_lSpeicher
    assert aktor in sp.m_lRessourcen

    # Idempotent — Doppel-Attach erzeugt keine Duplikate
    aktor.attach_speicher(sp)
    assert aktor.m_lSpeicher.count(sp) == 1
    assert sp.m_lRessourcen.count(aktor) == 1
