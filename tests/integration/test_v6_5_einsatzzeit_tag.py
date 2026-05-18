"""V6.5: PEinsatzzeitTag — Tagesarbeitszeit mit Wochenplan.

Schichten pro Tag (PTagesEinsatzzeit, z. B. 8-12 + 13-17), Tag↔Ressource-
Zuordnung (PTagRess), InsertEvents legt PEM_INIT + PEM_BEGIN/PEM_END +
PEM_END_FOR_DAY ab.

Test-Szenarien:
    A) PTagesEinsatzzeit / PTagRess Data-Klassen
    B) IsPTagesEinsatzzeitEndMax (Helper)
    C) Single-Schicht-Tag: Init + Begin + EndForDay
    D) Doppel-Schicht-Tag (Mittagspause): Init + Begin + End + Begin + EndForDay
    E) Multi-Ressource an verschiedenen Tagen (Tag-Filter)
    F) lfd. Prozess wird durch Schichtende unterbrochen (analog V6)
"""

from __future__ import annotations

from osim_engine.observability.sinks.testing import TraceCaptureSink
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator
from osim_engine.resources.assoziation.beleg import PAssozBeleg
from osim_engine.resources.beleg import PBetriebsmittel, RessStatus
from osim_engine.resources.einsatzzeit import (
    EinsatzEvtTyp,
    PEinsatzzeitEvtMode,
    PEinsatzzeitTag,
    PTagesEinsatzzeit,
    PTagRess,
)


# ----------------------------------------------------------------------
# A) Data-Klassen
# ----------------------------------------------------------------------


def test_v6_5_ptageseinsatzzeit_defaults() -> None:
    """PTagesEinsatzzeit Default 0/0 + Override."""
    te = PTagesEinsatzzeit()
    assert te.m_iEinsatzAnfang == 0.0
    assert te.m_iEinsatzEnde == 0.0
    te2 = PTagesEinsatzzeit(m_iEinsatzAnfang=8.0, m_iEinsatzEnde=12.0)
    assert te2.m_iEinsatzAnfang == 8.0
    assert te2.m_iEinsatzEnde == 12.0


def test_v6_5_ptagress_is_einsatz_tag() -> None:
    """PTagRess.is_einsatz_tag prüft Sim-Zeit gegen Tag-Fenster."""
    tr = PTagRess(m_iTag=0, m_oRessBeleg=None)
    # Tag 0 = [0, 86400)
    assert tr.is_einsatz_tag(None, 0) is True
    assert tr.is_einsatz_tag(None, 50_000) is True
    assert tr.is_einsatz_tag(None, 86_399) is True
    assert tr.is_einsatz_tag(None, 86_400) is False  # exklusiv

    tr2 = PTagRess(m_iTag=2, m_oRessBeleg=None)
    # Tag 2 = [172800, 259200)
    assert tr2.is_einsatz_tag(None, 0) is False
    assert tr2.is_einsatz_tag(None, 172_800) is True
    assert tr2.is_einsatz_tag(None, 200_000) is True
    assert tr2.is_einsatz_tag(None, 259_200) is False


# ----------------------------------------------------------------------
# B) IsPTagesEinsatzzeitEndMax
# ----------------------------------------------------------------------


def test_v6_5_end_max_einzelschicht() -> None:
    """Eine Schicht ist immer Max."""
    sim = PSimulator()
    ez = PEinsatzzeitTag(sim)
    s1 = PTagesEinsatzzeit(8.0, 17.0)
    ez.m_lTagesEinsatzzeit.append(s1)
    assert ez._is_p_tageseinsatzzeit_end_max(s1) is True


def test_v6_5_end_max_doppelschicht() -> None:
    """Bei 2 Schichten ist die mit dem höheren m_iEinsatzEnde Max."""
    sim = PSimulator()
    ez = PEinsatzzeitTag(sim)
    s_vor = PTagesEinsatzzeit(8.0, 12.0)
    s_nach = PTagesEinsatzzeit(13.0, 17.0)
    ez.m_lTagesEinsatzzeit.extend([s_vor, s_nach])
    assert ez._is_p_tageseinsatzzeit_end_max(s_vor) is False
    assert ez._is_p_tageseinsatzzeit_end_max(s_nach) is True


# ----------------------------------------------------------------------
# C) Single-Schicht-Tag — Init + Begin + EndForDay
# ----------------------------------------------------------------------


def _build_tag_scenario(
    *,
    schichten: list[tuple[float, float]],
    tag: int = 0,
) -> tuple[PSimulator, PBetriebsmittel, PEinsatzzeitTag]:
    """Helper: 1 PBetriebsmittel + PEinsatzzeitTag mit Schichten am `tag`."""
    sim = PSimulator()
    ress = PBetriebsmittel(sim); ress.m_sName = "M"
    sim.register_ressource(ress)

    ez = PEinsatzzeitTag(sim); ez.m_sName = "EZ-Tag"
    for anf, ende in schichten:
        ez.m_lTagesEinsatzzeit.append(
            PTagesEinsatzzeit(m_iEinsatzAnfang=anf, m_iEinsatzEnde=ende)
        )
    sim.register_einsatzzeit(ez)
    ez.attach_tag_ress(tag=tag, beleg=ress)
    return sim, ress, ez


def test_v6_5_single_schicht_eventbus() -> None:
    """1 Schicht 8-17 am Tag 0 → Events: INIT@0, BEGIN@28800, END_FOR_DAY@61200."""
    sim, ress, _ez = _build_tag_scenario(schichten=[(8.0, 17.0)])

    sink = TraceCaptureSink()
    sim.bus.subscribe("ress.einsatz.*", sink)
    sim.start()

    events = [(r.sim_time, r.topic) for r in sink.records]
    # INIT @ 0 → ress.einsatz.ende, BEGIN @ 28800 → ress.einsatz.beginn,
    # END_FOR_DAY @ 61200 → ress.einsatz.ende
    assert events == [
        (0, "ress.einsatz.ende"),       # INIT
        (28800, "ress.einsatz.beginn"), # 8h
        (61200, "ress.einsatz.ende"),   # 17h END_FOR_DAY
    ]

    # Endzustand: Ressource ist in Pause (Schicht-Ende war zuletzt)
    assert ress.m_rsStatus == RessStatus.RS_PAUSE


# ----------------------------------------------------------------------
# D) Doppel-Schicht-Tag (Mittagspause)
# ----------------------------------------------------------------------


def test_v6_5_doppel_schicht_mittagspause() -> None:
    """Schichten 8-12 + 13-17 am Tag 0 → 5 Events."""
    sim, ress, _ez = _build_tag_scenario(
        schichten=[(8.0, 12.0), (13.0, 17.0)]
    )

    sink = TraceCaptureSink()
    sim.bus.subscribe("ress.einsatz.*", sink)
    sim.start()

    events = [(r.sim_time, r.topic) for r in sink.records]
    assert events == [
        (0, "ress.einsatz.ende"),       # INIT
        (28800, "ress.einsatz.beginn"), # 8h BEGIN
        (43200, "ress.einsatz.ende"),   # 12h END (Mittagspause)
        (46800, "ress.einsatz.beginn"), # 13h BEGIN
        (61200, "ress.einsatz.ende"),   # 17h END_FOR_DAY
    ]
    assert ress.m_rsStatus == RessStatus.RS_PAUSE


def test_v6_5_doppel_schicht_status_zwischen_pause_frei() -> None:
    """Während Mittagspause Status RS_PAUSE, danach RS_FREI."""
    sim, ress, ez = _build_tag_scenario(schichten=[(8.0, 12.0), (13.0, 17.0)])

    captured: list[tuple[int, int]] = []

    # Listener-basierte Status-Capture
    from osim_engine.resources.beleg import RessBelegListener

    class _StatusCapture(RessBelegListener):
        def on_einsatz_beginn(self) -> None:
            assert self.m_oBeleg is not None
            captured.append((self.m_oBeleg.p_simulator.evt_curr_time(),
                             int(self.m_oBeleg.m_rsStatus)))

        def on_einsatz_ende(self) -> None:
            assert self.m_oBeleg is not None
            captured.append((self.m_oBeleg.p_simulator.evt_curr_time(),
                             int(self.m_oBeleg.m_rsStatus)))

    listener = _StatusCapture()
    listener.attach(ress)
    sim.start()

    # Wir prüfen Status-Snapshots VOR set_status — die Listener werden vor
    # set_status aufgerufen. Daher zeigt jeder Eintrag den Status DAVOR.
    assert len(captured) == 5
    # Letzter Status nach END_FOR_DAY ist RS_PAUSE
    assert ress.m_rsStatus == RessStatus.RS_PAUSE


# ----------------------------------------------------------------------
# E) Multi-Ressource an verschiedenen Tagen (Tag-Filter)
# ----------------------------------------------------------------------


def test_v6_5_tag_filter_zwei_ressourcen_verschiedene_tage() -> None:
    """Periode auf 2 Tage erweitern, je Tag eine andere Ressource."""
    sim = PSimulator()
    # Periode auf 2 Tage erweitern
    sim.m_periodLen = 2 * 86400

    m1 = PBetriebsmittel(sim); m1.m_sName = "M1"; sim.register_ressource(m1)
    m2 = PBetriebsmittel(sim); m2.m_sName = "M2"; sim.register_ressource(m2)

    ez = PEinsatzzeitTag(sim); ez.m_sName = "EZ"
    ez.m_lTagesEinsatzzeit.append(PTagesEinsatzzeit(8.0, 17.0))
    sim.register_einsatzzeit(ez)
    ez.attach_tag_ress(tag=0, beleg=m1)  # M1 am Tag 0
    ez.attach_tag_ress(tag=1, beleg=m2)  # M2 am Tag 1

    sink = TraceCaptureSink()
    sim.bus.subscribe("ress.einsatz.*", sink)
    sim.start()

    # Filter nach ressource — M1 sollte nur Tag-0-Events bekommen,
    # M2 nur Tag-1-Events.
    events_m1 = [(r.sim_time, r.topic) for r in sink.records
                 if r.data["ressource"] == "M1"]
    events_m2 = [(r.sim_time, r.topic) for r in sink.records
                 if r.data["ressource"] == "M2"]

    # Tag 0: INIT@0, BEGIN@28800, END_FOR_DAY@61200
    assert events_m1 == [
        (0, "ress.einsatz.ende"),
        (28800, "ress.einsatz.beginn"),
        (61200, "ress.einsatz.ende"),
    ]
    # Tag 1: INIT@86400, BEGIN@115200, END_FOR_DAY@147600
    assert events_m2 == [
        (86400, "ress.einsatz.ende"),
        (28800 + 86400, "ress.einsatz.beginn"),
        (61200 + 86400, "ress.einsatz.ende"),
    ]


# ----------------------------------------------------------------------
# F) lfd. Prozess wird durch Schichtende unterbrochen + Resume
# ----------------------------------------------------------------------


def test_v6_5_proz_unterbrochen_bei_mittagspause_resume_nachmittag() -> None:
    """Knoten K dauer=10000s, Auslöser bei t=42000 (= 11.67h).

    Schichten 8-12 + 13-17. Bei 12h (43200) Mittagspause → K unterbrochen,
    Rest = 10000-(43200-42000) = 10000-1200 = 8800. Bei 13h (46800) resume,
    läuft bis 46800+8800 = 55600.
    """
    sim, ress, _ez = _build_tag_scenario(
        schichten=[(8.0, 12.0), (13.0, 17.0)]
    )
    # Im Tag-Modus startet Ressource via INIT@0 auf RS_PAUSE.
    # Bei 28800 (8h) wird sie auf RS_FREI gesetzt.

    knoten = PDpKnKonstant(sim); knoten.m_sName = "K"
    knoten.m_iDurchfuehrungszeit = 10_000
    sim.register_knoten(knoten)

    assoz = PAssozBeleg(sim); assoz.m_lRessourcen.append(ress)
    knoten.add_assoziation(assoz)

    ausl = PAslEinzel(sim); ausl.m_sName = "A"
    ausl.m_iBeginTermin = 42_000  # 11.67h, also IN der ersten Schicht
    ausl.m_lDlpl = knoten
    sim.register_ausloeser(ausl)

    sim.start()

    # K hat 10000s zu tun: 1200 in Vormittag (42000-43200), 8800 nach
    # Mittagspause (46800-55600). Gesamt-Dauer 13600 (inkl. 3600 Pause).
    assert knoten.m_iPtkAusloesungCount == 1
    assert knoten.m_iPtkBegAusloesungCount == 2  # initial + resume
    assert knoten.m_iPtkProzRefuseCount == 0
    # DLZ ohne Pause (C++ PtkIntervallBegin/End-Semantik)
    assert knoten.m_dPtkDurchlaufzeit == 10_000.0
    # Auslöser-DLZ inkl. Pause: 55600-42000=13600
    assert sim.m_lAusl[0].m_dPtkDurchlaufzeit == 13_600
    # Endzustand: Ressource in Pause (END_FOR_DAY@61200 hat sie auf rsPause gesetzt)
    assert ress.m_rsStatus == RessStatus.RS_PAUSE
    assert sim.m_oWarteSchl.is_empty()
