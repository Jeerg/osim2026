"""V6: Einsatzzeiten/Pausen — PEinsatzzeitPause für PRessBeleg.

Test-Szenarien:
    A) Pause-Only — kein Auftrag, Ressource schaltet rsFrei → rsPause → rsFrei
       zur richtigen Zeit
    B) Pause unterbricht laufenden Prozess; nach Pause-Ende resumiert er mit
       dem korrekten Restzeitinhalt
    C) Counter-Matrix nach Pause-mit-Proz
    D) Backwards-Compat — Ressource ohne PEinsatzzeit verhält sich wie V4
    E) Zwei Pausen pro Periode

Zeit-Konvention: m_iPausAnfang/Ende/Periode in Stunden; PSimulator.m_periodLen
in Sekunden (Default 86400 = 1 Tag).
"""

from __future__ import annotations

from osim_engine.observability.sinks.testing import TraceCaptureSink
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator
from osim_engine.resources.assoziation.beleg import PAssozBeleg
from osim_engine.resources.beleg import PBetriebsmittel, RessStatus
from osim_engine.resources.einsatzzeit import PEinsatzzeitPause, PPauseZyklus


# ----------------------------------------------------------------------
# Builders
# ----------------------------------------------------------------------


def _make_pause_einsatzzeit(
    sim: PSimulator,
    *,
    name: str,
    anfang_h: float,
    ende_h: float,
    periode_h: float = 24.0,
) -> PEinsatzzeitPause:
    ez = PEinsatzzeitPause(sim)
    ez.m_sName = name
    zyk = PPauseZyklus(
        m_iPausAnfang=anfang_h, m_iPausEnde=ende_h, m_iPeriode=periode_h
    )
    ez.m_lPausen.append(zyk)
    sim.register_einsatzzeit(ez)
    return ez


def _make_one_ress_with_pause(
    *, anfang_h: float, ende_h: float
) -> tuple[PSimulator, PBetriebsmittel, PEinsatzzeitPause]:
    sim = PSimulator()
    ress = PBetriebsmittel(sim)
    ress.m_sName = "M"
    sim.register_ressource(ress)

    ez = _make_pause_einsatzzeit(sim, name="EZ", anfang_h=anfang_h, ende_h=ende_h)
    ez.attach_ressource(ress)
    return sim, ress, ez


def _make_one_node_with_pause(
    *,
    knoten_dauer: int,
    ausl_t: int,
    pause_anfang_h: float,
    pause_ende_h: float,
) -> tuple[PSimulator, PBetriebsmittel, PDpKnKonstant, PEinsatzzeitPause]:
    sim, ress, ez = _make_one_ress_with_pause(
        anfang_h=pause_anfang_h, ende_h=pause_ende_h
    )

    knoten = PDpKnKonstant(sim)
    knoten.m_sName = "K"
    knoten.m_iDurchfuehrungszeit = knoten_dauer
    sim.register_knoten(knoten)

    assoz = PAssozBeleg(sim)
    assoz.m_sName = "K->M"
    assoz.m_lRessourcen.append(ress)
    knoten.add_assoziation(assoz)

    ausl = PAslEinzel(sim)
    ausl.m_sName = "A"
    ausl.m_iBeginTermin = ausl_t
    ausl.m_lDlpl = knoten
    sim.register_ausloeser(ausl)

    return sim, ress, knoten, ez


# ----------------------------------------------------------------------
# A) Pause-Only
# ----------------------------------------------------------------------


def test_v6_pause_only_status_schaltet_zur_richtigen_zeit() -> None:
    """Pause 10h-11h innerhalb 24h-Periode → t=36000 rsPause, t=39600 rsFrei."""
    sim, ress, _ez = _make_one_ress_with_pause(anfang_h=10.0, ende_h=11.0)

    sink = TraceCaptureSink()
    sim.bus.subscribe("ress.einsatz.*", sink)
    sim.start()

    # Am Sim-Ende ist die Pause vorbei, Ressource wieder frei
    assert ress.m_rsStatus == RessStatus.RS_FREI

    # Reihenfolge der Topics
    events = [(r.sim_time, r.topic) for r in sink.records]
    assert events == [
        (36000, "ress.einsatz.ende"),     # Pause beginnt = Einsatz endet
        (39600, "ress.einsatz.beginn"),   # Pause endet = Einsatz beginnt
    ]


# ----------------------------------------------------------------------
# B) Pause unterbricht laufenden Prozess
# ----------------------------------------------------------------------


def test_v6_pause_unterbricht_und_proz_resumed_mit_restzeit() -> None:
    """K startet bei 35000, würde bei 40000 enden (Dauer 5000).
    Pause 36000-39600 (dauer 3600) → K wird bei 36000 unterbrochen
    (Rest 4000), bei 39600 resumed, endet bei 39600+4000=43600.
    """
    sim, ress, knoten, _ez = _make_one_node_with_pause(
        knoten_dauer=5000,
        ausl_t=35000,
        pause_anfang_h=10.0,
        pause_ende_h=11.0,
    )

    sink = TraceCaptureSink()
    sim.bus.subscribe("ress.*", sink)
    sim.bus.subscribe("proz.bearbeit.*", sink)
    sim.start()

    # Ressource am Ende wieder frei
    assert ress.m_rsStatus == RessStatus.RS_FREI
    # Auslöser hat 1× abgeschlossen
    assert sim.m_lAusl[0].m_iPtkAusloesungCount == 1
    # Warteschlange leer
    assert sim.m_oWarteSchl.is_empty()
    # Knoten DLZ: AKTIVE Bearbeitungszeit (C++ PtkIntervall-Semantik):
    # Intervall 1: 35000..36000 = 1000s
    # Intervall 2: 39600..43600 = 4000s
    # Pause (3600s) wird NICHT in m_dPtkDurchlaufzeit gezählt.
    assert knoten.m_iPtkAusloesungCount == 1
    assert knoten.m_dPtkDurchlaufzeit == 5000.0

    # Reihenfolge der Topics (ress + proz.bearbeit)
    interesting = [
        (r.sim_time, r.topic)
        for r in sink.records
        if r.topic in (
            "proz.bearbeit.start", "proz.bearbeit.unterbr", "proz.bearbeit.ende",
            "ress.belegen", "ress.freigeben",
            "ress.einsatz.ende", "ress.einsatz.beginn",
        )
    ]
    assert interesting == [
        (35000, "ress.belegen"),
        (35000, "proz.bearbeit.start"),
        (36000, "ress.einsatz.ende"),
        (36000, "proz.bearbeit.unterbr"),
        (39600, "ress.einsatz.beginn"),
        (39600, "ress.belegen"),
        (39600, "proz.bearbeit.start"),
        (43600, "proz.bearbeit.ende"),
        (43600, "ress.freigeben"),
    ]


# ----------------------------------------------------------------------
# C) Counter-Matrix
# ----------------------------------------------------------------------


def test_v6_counter_nach_pause_mit_proz() -> None:
    """Counter-Konsistenz: 1 Auftrag, 1 Re-Try nach Pause."""
    sim, ress, knoten, _ez = _make_one_node_with_pause(
        knoten_dauer=5000,
        ausl_t=35000,
        pause_anfang_h=10.0,
        pause_ende_h=11.0,
    )
    sim.start()

    # Knoten: 1 initialer Versuch + 1 Resume = 2
    assert knoten.m_iPtkBegAusloesungCount == 2
    # Refuse: 0 — Unterbrechung läuft nicht über ress_verfuegbar
    assert knoten.m_iPtkProzRefuseCount == 0
    # Ressource: 2 Anfragen, beide erfüllt
    assert ress.m_iPtkAnfragenGesamt == 2
    assert ress.m_iPtkBeiAnfrageAnwesend == 2
    assert ress.m_iPtkAnfrageErfuellt == 2


# ----------------------------------------------------------------------
# D) Backwards-Compat — ohne PEinsatzzeit verhält sich wie V4
# ----------------------------------------------------------------------


def test_v6_ohne_einsatzzeit_verhaelt_sich_wie_v4() -> None:
    """Ohne PEinsatzzeit-Registrierung läuft Knoten wie in V4 durch."""
    sim = PSimulator()
    ress = PBetriebsmittel(sim)
    ress.m_sName = "M"
    sim.register_ressource(ress)

    knoten = PDpKnKonstant(sim)
    knoten.m_sName = "K"
    knoten.m_iDurchfuehrungszeit = 100
    sim.register_knoten(knoten)

    assoz = PAssozBeleg(sim)
    assoz.m_lRessourcen.append(ress)
    knoten.add_assoziation(assoz)

    ausl = PAslEinzel(sim)
    ausl.m_iBeginTermin = 50
    ausl.m_lDlpl = knoten
    sim.register_ausloeser(ausl)

    sim.start()

    assert knoten.m_iPtkBegAusloesungCount == 1
    assert knoten.m_iPtkProzRefuseCount == 0
    assert sim.m_lAusl[0].m_iPtkAusloesungCount == 1
    assert ress.m_rsStatus == RessStatus.RS_FREI


# ----------------------------------------------------------------------
# E) Zwei Pausen pro Periode
# ----------------------------------------------------------------------


def test_v6_zwei_pausen_pro_periode() -> None:
    """Periode 12h (43200s), Pause 8h-9h (28800-32400) → 2 Vorkommen pro Tag.

    Sim-Periode default 86400, also 2 Pause-Vorkommen:
    - 28800-32400
    - 72000-75600
    """
    sim, ress, _ez = _make_one_ress_with_pause(anfang_h=8.0, ende_h=9.0)
    # Periode auf 12h umstellen
    sim.m_lEinsatz[0].m_lPausen[0].m_iPeriode = 12.0

    sink = TraceCaptureSink()
    sim.bus.subscribe("ress.einsatz.*", sink)
    sim.start()

    events = [(r.sim_time, r.topic) for r in sink.records]
    assert events == [
        (28800, "ress.einsatz.ende"),
        (32400, "ress.einsatz.beginn"),
        (72000, "ress.einsatz.ende"),
        (75600, "ress.einsatz.beginn"),
    ]
    assert ress.m_rsStatus == RessStatus.RS_FREI
