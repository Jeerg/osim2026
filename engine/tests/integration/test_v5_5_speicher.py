"""V5.5: Entity + Speicher-Infrastruktur.

PEntitaet-Familie, PSpeicherProz, PAssozSpeicher. Da der Aktor-Pfad erst in
Phase 3 aktiv wird, sind die Sim-Effekte hier passiv: Prozesse landen via
`PDpKnZeitvorgabe.proz_weitergeben` im Speicher (statt direkt zu starten)
und bleiben dort bis Phase 3 sie entnimmt.

Test-Szenarien:
    A) PEntitaet-Stubs (Klonen/Abspalten/Zusammenfuehren werfen)
    B) PEntEinzel Default m_iEinheiten=1
    C) PSpeicherProz Container-API (proz_einfuegen, Listener, get_proz_anzahl)
    D) PSpeicherProz.is_waiting / delete_proz
    E) PAssozSpeicher.hole_speicher load-balanced
    F) Integration: Knoten mit Speicher-Assoz → Proz landet im Speicher
    G) Integration: Knoten OHNE Speicher-Assoz → V4-Verhalten unverändert
    H) Lifecycle: PSpeicherProz.on_sim_begin leert m_lProzesse
"""

from __future__ import annotations

import pytest

from osim_engine.observability.sinks.testing import TraceCaptureSink
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.prozess.base import PtStatus
from osim_engine.pps.simulator import PSimulator
from osim_engine.resources.assoziation.speicher import PAssozSpeicher
from osim_engine.resources.entitaet import PEntEinzel, PEntitaet, PEntWeitergabe
from osim_engine.resources.speicher import PSpeicherProz, SpeicherProzListener


# ----------------------------------------------------------------------
# A) PEntitaet-Stubs
# ----------------------------------------------------------------------


def test_v5_5_pentitaet_stubs_werfen() -> None:
    """C++-Stubs: Klonen / Abspalten / Zusammenfuehren werfen."""
    sim = PSimulator()
    ent = PEntEinzel(sim)
    with pytest.raises(NotImplementedError):
        ent.klonen()
    with pytest.raises(NotImplementedError):
        ent.abspalten(1)
    with pytest.raises(NotImplementedError):
        ent.zusammenfuehren(ent)


def test_v5_5_pent_einzel_defaults() -> None:
    """PEntEinzel-Konstruktor setzt m_iEinheiten=1 und Default-Name."""
    sim = PSimulator()
    ent = PEntEinzel(sim)
    assert ent.m_iEinheiten == 1
    assert ent.m_sName == "unbenannt"
    # Override-Bare
    ent2 = PEntEinzel(sim)
    ent2.m_sName = "Auftrag-1"
    assert ent2.m_sName == "Auftrag-1"


def test_v5_5_pent_weitergabe_default() -> None:
    """PEntWeitergabe: m_iEinheiten=0, m_iWeitergabemenge=0 (Defaults)."""
    sim = PSimulator()
    ent = PEntWeitergabe(sim)
    assert ent.m_iEinheiten == 0
    assert ent.m_iWeitergabemenge == 0


# ----------------------------------------------------------------------
# C) PSpeicherProz Container-API
# ----------------------------------------------------------------------


def test_v5_5_speicher_proz_einfuegen_und_listener() -> None:
    """proz_einfuegen erhöht get_proz_anzahl + notifiziert Listener."""
    sim = PSimulator()
    sp = PSpeicherProz(sim)
    sp.m_sName = "S1"
    sim.register_speicher_proz(sp)

    received: list[str] = []

    class _Listener(SpeicherProzListener):
        def on_proz_einfuegen(self, proz) -> None:
            received.append(f"einfuegen:{proz.m_sName}")

        def on_proz_entnommen(self, proz) -> None:
            received.append(f"entnommen:{proz.m_sName}")

    listener = _Listener()
    listener.attach(sp)

    # Künstlicher Prozess
    from osim_engine.pps.prozess.zeitvorgabe import PtProzZeitvorgabe

    knoten = PDpKnKonstant(sim)
    knoten.m_sName = "K"
    knoten.m_iDurchfuehrungszeit = 100

    proz = PtProzZeitvorgabe(sim)
    proz.m_sName = "A1|K"
    proz.m_oKnoten = knoten

    assert sp.get_proz_anzahl() == 0
    sp.proz_einfuegen(proz)
    assert sp.get_proz_anzahl() == 1
    assert received == ["einfuegen:A1|K"]

    sp.on_proz_entnommen(proz)
    assert received == ["einfuegen:A1|K", "entnommen:A1|K"]

    # Detach
    listener.detach()
    sp.proz_einfuegen(proz)
    # Kein neuer Eintrag, da Listener weg
    assert received == ["einfuegen:A1|K", "entnommen:A1|K"]


def test_v5_5_speicher_get_bestand_wirft() -> None:
    """C++-Stub get_bestand wirft."""
    sim = PSimulator()
    sp = PSpeicherProz(sim)
    sim.register_speicher_proz(sp)
    with pytest.raises(NotImplementedError):
        sp.get_bestand()


# ----------------------------------------------------------------------
# D) PSpeicherProz is_waiting + delete_proz
# ----------------------------------------------------------------------


def test_v5_5_speicher_is_waiting_und_delete() -> None:
    """is_waiting findet (trigger,knoten)-Match; delete_proz entfernt korrekt."""
    sim = PSimulator()
    sp = PSpeicherProz(sim)
    sim.register_speicher_proz(sp)

    from osim_engine.pps.prozess.zeitvorgabe import PtProzZeitvorgabe
    from osim_engine.pps.trigger import PtTrigger

    knoten = PDpKnKonstant(sim)
    knoten.m_sName = "K"
    knoten.m_iDurchfuehrungszeit = 100

    ausl = PAslEinzel(sim)
    ausl.m_sName = "A"
    trigger = PtTrigger(sim, ausloeser=ausl)
    trigger.m_sName = "A.trig0"

    proz = PtProzZeitvorgabe(sim)
    proz.m_sName = "A|K"
    proz.m_oKnoten = knoten
    proz.m_oTrigger = trigger
    proz.m_eStatus = PtStatus.PT_WART  # Speicher-Konvention

    sp.proz_einfuegen(proz)

    # Match
    assert sp.is_waiting(trigger, knoten) is True

    # Mismatch via fremden Knoten
    other_knoten = PDpKnKonstant(sim)
    other_knoten.m_sName = "K-other"
    assert sp.is_waiting(trigger, other_knoten) is False

    # Delete erfolgreich
    assert sp.delete_proz(trigger, knoten) is True
    assert sp.get_proz_anzahl() == 0
    assert sp.is_waiting(trigger, knoten) is False
    # Erneutes Delete: nichts mehr zu löschen
    assert sp.delete_proz(trigger, knoten) is False


# ----------------------------------------------------------------------
# E) PAssozSpeicher.hole_speicher load-balanced
# ----------------------------------------------------------------------


def test_v5_5_assoz_speicher_hole_speicher_load_balanced() -> None:
    """Drei Speicher mit unterschiedlicher Belegung — kleinster wird gewählt."""
    sim = PSimulator()

    # Drei Speicher
    sps: list[PSpeicherProz] = []
    for i in range(3):
        sp = PSpeicherProz(sim)
        sp.m_sName = f"S{i + 1}"
        sim.register_speicher_proz(sp)
        sps.append(sp)

    assoz = PAssozSpeicher(sim)
    assoz.m_sName = "A->S"
    assoz.m_lSpeicher.extend(sps)

    from osim_engine.pps.prozess.zeitvorgabe import PtProzZeitvorgabe

    knoten = PDpKnKonstant(sim)
    knoten.m_sName = "K"
    knoten.m_iDurchfuehrungszeit = 100

    def _make_proz(name: str) -> PtProzZeitvorgabe:
        p = PtProzZeitvorgabe(sim)
        p.m_sName = name
        p.m_oKnoten = knoten
        p.m_eStatus = PtStatus.PT_WART
        return p

    # Initial alle leer → letzter (S3) gewinnt (C++ `<=`-Vergleich)
    chosen = assoz.hole_speicher(_make_proz("P0"))
    assert chosen is sps[2]

    # S2 künstlich befüllen
    sps[1].proz_einfuegen(_make_proz("X"))
    # Jetzt sind S1 und S3 mit 0, S2 mit 1. → letzter mit 0 = S3
    chosen = assoz.hole_speicher(_make_proz("P1"))
    assert chosen is sps[2]

    # S3 zwei Mal befüllen — jetzt: S1=0, S2=1, S3=2 → S1 ist Minimum
    sps[2].proz_einfuegen(_make_proz("Y1"))
    sps[2].proz_einfuegen(_make_proz("Y2"))
    chosen = assoz.hole_speicher(_make_proz("P2"))
    assert chosen is sps[0]


def test_v5_5_assoz_speicher_platziere_proz_in_min_speicher() -> None:
    """platziere_proz nutzt hole_speicher + proz_einfuegen."""
    sim = PSimulator()

    sp1 = PSpeicherProz(sim); sp1.m_sName = "S1"
    sp2 = PSpeicherProz(sim); sp2.m_sName = "S2"
    sim.register_speicher_proz(sp1)
    sim.register_speicher_proz(sp2)

    assoz = PAssozSpeicher(sim)
    assoz.m_lSpeicher.extend([sp1, sp2])

    from osim_engine.pps.prozess.zeitvorgabe import PtProzZeitvorgabe

    knoten = PDpKnKonstant(sim); knoten.m_sName = "K"
    knoten.m_iDurchfuehrungszeit = 100

    p1 = PtProzZeitvorgabe(sim); p1.m_sName = "P1"; p1.m_oKnoten = knoten
    assoz.platziere_proz(p1)
    # `<=`-Vergleich → S2 wird gewählt
    assert sp1.get_proz_anzahl() == 0
    assert sp2.get_proz_anzahl() == 1


def test_v5_5_assoz_speicher_is_empty_und_is_waiting() -> None:
    """is_empty / is_waiting / delete_proz delegieren an Speicher-Liste."""
    sim = PSimulator()
    assoz = PAssozSpeicher(sim)
    assert assoz.is_empty() is True

    sp = PSpeicherProz(sim); sp.m_sName = "S"
    sim.register_speicher_proz(sp)
    assoz.m_lSpeicher.append(sp)
    assert assoz.is_empty() is False

    # is_waiting auf leeren Speicher → False
    from osim_engine.pps.trigger import PtTrigger
    ausl = PAslEinzel(sim); ausl.m_sName = "A"
    trigger = PtTrigger(sim, ausloeser=ausl)
    knoten = PDpKnKonstant(sim); knoten.m_sName = "K"
    assert assoz.is_waiting(trigger, knoten) is False


# ----------------------------------------------------------------------
# F) Integration: Knoten mit Speicher-Assoz
# ----------------------------------------------------------------------


def test_v5_5_knoten_mit_speicher_assoz_proz_landet_im_speicher() -> None:
    """Knoten K hat m_lAssozSpeich → Auslöser-Triggerung legt Proz im
    Speicher ab. EvtBearbeitEnde wird NICHT geplant (kein Aktor).
    Proz bleibt im Speicher (Status PT_WART).
    """
    sim = PSimulator()

    sp = PSpeicherProz(sim); sp.m_sName = "S"
    sim.register_speicher_proz(sp)

    assoz = PAssozSpeicher(sim); assoz.m_sName = "K->S"
    assoz.m_lSpeicher.append(sp)

    knoten = PDpKnKonstant(sim); knoten.m_sName = "K"
    knoten.m_iDurchfuehrungszeit = 100
    sim.register_knoten(knoten)
    knoten.set_assoziation_speicher(assoz)

    ausl = PAslEinzel(sim); ausl.m_sName = "A"
    ausl.m_iBeginTermin = 10
    ausl.m_lDlpl = knoten
    sim.register_ausloeser(ausl)

    sink = TraceCaptureSink()
    sim.bus.subscribe("speicher.*", sink)
    sim.bus.subscribe("proz.bearbeit.*", sink)
    sim.start()

    # Proz wurde erzeugt (Counter) und im Speicher abgelegt
    assert knoten.m_iPtkProzessCount == 1
    # Aber: kein BearbeitBeginnen, kein BegAusloesungCount
    assert knoten.m_iPtkBegAusloesungCount == 0
    assert knoten.m_iPtkAusloesungCount == 0
    # Knoten m_lProzesse ist leer (Proz ging direkt in Speicher)
    assert len(knoten.m_lProzesse) == 0
    # Speicher hält den Proz
    assert sp.get_proz_anzahl() == 1
    proz = sp.m_lProzesse[0]
    assert proz.m_eStatus == PtStatus.PT_WART
    assert proz.m_oKnoten is knoten

    # EventBus: speicher.einfuegen, KEIN proz.bearbeit.start
    topics = [r.topic for r in sink.records]
    assert "speicher.einfuegen" in topics
    assert "proz.bearbeit.start" not in topics

    # Auslöser hat ZWAR ausgelöst (Counter ++), aber on_dlpl_beendet nie gerufen
    assert ausl.m_iPtkBegAusloesungCount == 1
    assert ausl.m_iPtkAusloesungCount == 0


# ----------------------------------------------------------------------
# G) Backwards-Compat: ohne Speicher-Assoz unverändert
# ----------------------------------------------------------------------


def test_v5_5_knoten_ohne_speicher_assoz_v4_verhalten() -> None:
    """Knoten ohne m_lAssozSpeich → klassischer V1/V4-Pfad."""
    sim = PSimulator()

    knoten = PDpKnKonstant(sim); knoten.m_sName = "K"
    knoten.m_iDurchfuehrungszeit = 50
    sim.register_knoten(knoten)

    ausl = PAslEinzel(sim); ausl.m_iBeginTermin = 0
    ausl.m_lDlpl = knoten
    sim.register_ausloeser(ausl)

    sim.start()

    assert knoten.m_iPtkBegAusloesungCount == 1
    assert knoten.m_iPtkAusloesungCount == 1
    assert ausl.m_iPtkAusloesungCount == 1


# ----------------------------------------------------------------------
# H) Lifecycle
# ----------------------------------------------------------------------


def test_v5_5_speicher_on_sim_begin_leert_lprozesse() -> None:
    """C++-konform: on_sim_begin leert m_lProzesse aller registrierten Speicher."""
    sim = PSimulator()

    sp = PSpeicherProz(sim); sp.m_sName = "S"
    sim.register_speicher_proz(sp)

    # Pre-fill (würde so im echten Modell nicht passieren, aber wir testen Lifecycle)
    from osim_engine.pps.prozess.zeitvorgabe import PtProzZeitvorgabe
    knoten = PDpKnKonstant(sim); knoten.m_sName = "K"
    knoten.m_iDurchfuehrungszeit = 100

    pre = PtProzZeitvorgabe(sim); pre.m_sName = "leftover"; pre.m_oKnoten = knoten
    sp.m_lProzesse.append(pre)
    assert sp.get_proz_anzahl() == 1

    # Auslöser damit start() überhaupt was tut
    ausl = PAslEinzel(sim); ausl.m_iBeginTermin = 0
    ausl.m_lDlpl = knoten
    sim.register_knoten(knoten)
    sim.register_ausloeser(ausl)

    sim.start()
    # on_sim_begin wurde gerufen → m_lProzesse leer
    assert sp.get_proz_anzahl() == 0


# ----------------------------------------------------------------------
# I) PEntEinzel als Marker durch die Pipeline
# ----------------------------------------------------------------------


def test_v5_5_pent_einzel_marker_durch_pipeline() -> None:
    """PEntEinzel an PAusloeser.m_lEntitaet → landet als Proz.m_oEntitaet."""
    sim = PSimulator()

    knoten = PDpKnKonstant(sim); knoten.m_sName = "K"
    knoten.m_iDurchfuehrungszeit = 50
    sim.register_knoten(knoten)

    ent = PEntEinzel(sim); ent.m_sName = "Auftrag-42"

    ausl = PAslEinzel(sim); ausl.m_sName = "A"
    ausl.m_iBeginTermin = 10
    ausl.m_lDlpl = knoten
    ausl.m_lEntitaet = ent
    sim.register_ausloeser(ausl)

    # Listener am Knoten, der die Entität bei Bearbeit-Beginn ablesen kann
    captured: list[PEntitaet | None] = []

    from osim_engine.pps.knoten.base import KnotenListener

    class _L(KnotenListener):
        def on_proz_bearbeit_beginn(self, proz) -> None:
            captured.append(proz.m_oEntitaet)

    listener = _L()
    listener.attach(knoten)

    sim.start()

    assert captured == [ent]
    assert isinstance(captured[0], PEntEinzel)
    assert captured[0].m_sName == "Auftrag-42"
    assert captured[0].m_iEinheiten == 1
