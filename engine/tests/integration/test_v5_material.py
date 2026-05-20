"""V5: Material/Mengen-Ressource — PRessMenge + PAssozMengeErzgt/Verbr/Abfr.

Test-Szenarien:
    A) Erzgt-Only — Knoten produziert, unbegrenzter Lager → Bestand steigt
    B) Verbr-Only mit Anfangsbestand — Knoten verbraucht ohne Engpass
    C) Verbr-Konflikt mit leerem Lager — Knoten wartet, bricht NIE durch
    D) Erzeuger→Verbraucher — A produziert, B wartet bis A liefert, läuft dann
    E) Bounded Storage — Erzgt wartet bei vollem Lager bis Verbrauch frei macht
    F) Abfr — kein Stock-Effekt, nur Verfügbarkeitsprüfung
    G) Counter-Matrix (AnfragenAb/Zu, AbgelehnteAnfrAb/Zu, KummErzg/Verb)
"""

from __future__ import annotations

from osim_engine.observability.sinks.testing import TraceCaptureSink
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator
from osim_engine.resources.assoziation.menge import (
    PAssozMengeAbfr,
    PAssozMengeErzgt,
    PAssozMengeVerbr,
)
from osim_engine.resources.menge import PRessMenge


# ----------------------------------------------------------------------
# Builders
# ----------------------------------------------------------------------


def _make_lager(sim: PSimulator, *, name: str = "L",
                anfang: int = 0, maximum: int = -1) -> PRessMenge:
    lager = PRessMenge(sim)
    lager.m_sName = name
    lager.m_iBestandAnfang = anfang
    lager.m_iBestandMax = maximum
    sim.register_ress_menge(lager)
    return lager


def _make_knoten(sim: PSimulator, *, name: str, dauer: int) -> PDpKnKonstant:
    k = PDpKnKonstant(sim)
    k.m_sName = name
    k.m_iDurchfuehrungszeit = dauer
    sim.register_knoten(k)
    return k


def _attach_erzgt(knoten, lager: PRessMenge, menge_aus: int = 1) -> PAssozMengeErzgt:
    assoz = PAssozMengeErzgt(lager.p_simulator)
    assoz.m_sName = f"{knoten.m_sName}->erzg_{lager.m_sName}"
    assoz.m_lMengRess = lager
    assoz.m_iMengeAus = menge_aus
    knoten.add_assoziation(assoz)
    return assoz


def _attach_verbr(knoten, lager: PRessMenge, menge_ein: int = 1) -> PAssozMengeVerbr:
    assoz = PAssozMengeVerbr(lager.p_simulator)
    assoz.m_sName = f"{knoten.m_sName}->verbr_{lager.m_sName}"
    assoz.m_lMengRess = lager
    assoz.m_iMengeEin = menge_ein
    knoten.add_assoziation(assoz)
    return assoz


def _attach_ausloeser(sim: PSimulator, *, knoten, name: str, t: int) -> PAslEinzel:
    a = PAslEinzel(sim)
    a.m_sName = name
    a.m_iBeginTermin = t
    a.m_lDlpl = knoten
    sim.register_ausloeser(a)
    return a


# ----------------------------------------------------------------------
# A) Erzgt-Only
# ----------------------------------------------------------------------


def test_v5_erzgt_only_unbegrenzt_bestand_steigt() -> None:
    """1 Knoten (dauer 50) produziert 1 Stück, 3 Auslöser → Bestand = 3."""
    sim = PSimulator()
    lager = _make_lager(sim, name="L", anfang=0, maximum=-1)
    knoten = _make_knoten(sim, name="K", dauer=50)
    _attach_erzgt(knoten, lager, menge_aus=1)
    for i, t in enumerate((10, 200, 400)):
        _attach_ausloeser(sim, knoten=knoten, name=f"A{i + 1}", t=t)

    sim.start()

    assert lager.m_iBestandAktuell == 3
    assert lager.m_iPtkKummErzgMengeGesamt == 3
    assert lager.m_iPtkKummVerbMengeGesamt == 0
    assert lager.m_iPtkAnfragenZu == 3   # 3 Verfügbarkeits-Prüfungen
    assert lager.m_iPtkAbgelehnteAnfrZu == 0


# ----------------------------------------------------------------------
# B) Verbr-Only mit Anfangsbestand
# ----------------------------------------------------------------------


def test_v5_verbr_only_mit_anfangsbestand() -> None:
    """Lager mit Anfangsbestand 5, Knoten verbraucht 1× → Bestand = 4."""
    sim = PSimulator()
    lager = _make_lager(sim, name="L", anfang=5)
    knoten = _make_knoten(sim, name="K", dauer=30)
    _attach_verbr(knoten, lager, menge_ein=1)
    _attach_ausloeser(sim, knoten=knoten, name="A", t=10)

    sim.start()

    assert lager.m_iBestandAktuell == 4
    assert lager.m_iPtkKummVerbMengeGesamt == 1
    assert lager.m_iPtkAnfragenAb == 1
    assert lager.m_iPtkAbgelehnteAnfrAb == 0


# ----------------------------------------------------------------------
# C) Verbr blockiert dauerhaft bei leerem Lager
# ----------------------------------------------------------------------


def test_v5_verbr_leeres_lager_wartet_dauerhaft() -> None:
    """Lager leer, Verbraucher kann nie starten → bleibt in Warteschlange."""
    sim = PSimulator()
    lager = _make_lager(sim, name="L", anfang=0)
    knoten = _make_knoten(sim, name="K", dauer=50)
    _attach_verbr(knoten, lager, menge_ein=1)
    _attach_ausloeser(sim, knoten=knoten, name="A", t=10)

    sim.start()

    assert lager.m_iBestandAktuell == 0
    assert lager.m_iPtkKummVerbMengeGesamt == 0
    assert lager.m_iPtkAnfragenAb == 1
    assert lager.m_iPtkAbgelehnteAnfrAb == 1
    # Prozess hängt noch in Warteschlange
    assert not sim.m_oWarteSchl.is_empty()
    assert knoten.m_iPtkBegAusloesungCount == 1
    assert knoten.m_iPtkProzRefuseCount == 1


# ----------------------------------------------------------------------
# D) Erzeuger → Verbraucher (Konflikt + Auflösung)
# ----------------------------------------------------------------------


def test_v5_erzeuger_verbraucher_b_wartet_bis_a_liefert() -> None:
    """A produziert ab t=10, läuft 50s → liefert bei t=60.
    B startet bei t=20, sieht leeres Lager, wartet. Bei t=60 wird zugebucht
    → ProzWartAusloesen → B startet, läuft 30s bis t=90.
    """
    sim = PSimulator()
    lager = _make_lager(sim, name="L", anfang=0)

    erzeuger = _make_knoten(sim, name="E", dauer=50)
    _attach_erzgt(erzeuger, lager, menge_aus=1)
    _attach_ausloeser(sim, knoten=erzeuger, name="A", t=10)

    verbraucher = _make_knoten(sim, name="V", dauer=30)
    _attach_verbr(verbraucher, lager, menge_ein=1)
    _attach_ausloeser(sim, knoten=verbraucher, name="B", t=20)

    sink = TraceCaptureSink()
    sim.bus.subscribe("ress.*", sink)
    sim.start()

    assert lager.m_iBestandAktuell == 0  # produziert + verbraucht
    assert lager.m_iPtkKummErzgMengeGesamt == 1
    assert lager.m_iPtkKummVerbMengeGesamt == 1
    # B wurde 1× abgelehnt, dann 1× wieder versucht und ist gelaufen
    assert verbraucher.m_iPtkBegAusloesungCount == 2
    assert verbraucher.m_iPtkProzRefuseCount == 1
    # Beide Auslöser haben ihren Auftrag abgeschlossen
    assert sim.m_lAusl[0].m_iPtkAusloesungCount == 1
    assert sim.m_lAusl[1].m_iPtkAusloesungCount == 1
    assert sim.m_oWarteSchl.is_empty()

    # EventBus-Reihenfolge
    events = [(r.sim_time, r.topic) for r in sink.records]
    assert events == [
        (60, "ress.zubuchen"),
        (60, "ress.abbuchen"),
    ]


# ----------------------------------------------------------------------
# E) Bounded storage — Erzgt wartet bei vollem Lager
# ----------------------------------------------------------------------


def test_v5_bounded_storage_erzgt_wartet_bei_vollem_lager() -> None:
    """Lager max=1, anfang=1. Erzeuger E1 will sofort produzieren, kann aber
    nicht (voll). Verbr V verbraucht später, dann läuft E1.
    """
    sim = PSimulator()
    lager = _make_lager(sim, name="L", anfang=1, maximum=1)

    erzeuger = _make_knoten(sim, name="E", dauer=10)
    _attach_erzgt(erzeuger, lager, menge_aus=1)
    _attach_ausloeser(sim, knoten=erzeuger, name="AE", t=10)

    verbraucher = _make_knoten(sim, name="V", dauer=10)
    _attach_verbr(verbraucher, lager, menge_ein=1)
    _attach_ausloeser(sim, knoten=verbraucher, name="AV", t=100)

    sim.start()

    # Erzeuger wurde bei t=10 abgelehnt (Lager voll), verbraucher bei t=100
    # konnte zugreifen und beim Abbuchen wurde Erzeuger neu gestartet.
    assert lager.m_iBestandAktuell == 1
    assert lager.m_iPtkAnfragenZu == 2   # E1 zwei Versuche
    assert lager.m_iPtkAbgelehnteAnfrZu == 1
    assert lager.m_iPtkAnfragenAb == 1
    assert lager.m_iPtkAbgelehnteAnfrAb == 0
    # Beide Knoten haben am Ende ihren Lauf abgeschlossen
    assert sim.m_lAusl[0].m_iPtkAusloesungCount == 1  # E
    assert sim.m_lAusl[1].m_iPtkAusloesungCount == 1  # V
    assert sim.m_oWarteSchl.is_empty()


# ----------------------------------------------------------------------
# F) PAssozMengeAbfr — nur prüfen, nicht entnehmen
# ----------------------------------------------------------------------


def test_v5_abfr_nimmt_kein_material_weg() -> None:
    """Lager anfang=3, Abfrage-Knoten will 2 Stück — nur prüfen.
    Lager bleibt bei 3.
    """
    sim = PSimulator()
    lager = _make_lager(sim, name="L", anfang=3)
    knoten = _make_knoten(sim, name="K", dauer=20)

    assoz = PAssozMengeAbfr(sim)
    assoz.m_sName = "K->abfr"
    assoz.m_lMengRess = lager
    assoz.m_iMengeAbfr = 2
    knoten.add_assoziation(assoz)

    _attach_ausloeser(sim, knoten=knoten, name="A", t=10)
    sim.start()

    assert lager.m_iBestandAktuell == 3  # unverändert
    assert lager.m_iPtkAnfragenAb == 1   # 1× geprüft (abbuchen=True-Modus)
    assert lager.m_iPtkAbgelehnteAnfrAb == 0
    assert lager.m_iPtkKummVerbMengeGesamt == 0


def test_v5_abfr_lehnt_bei_zu_wenig_bestand_ab() -> None:
    """Lager anfang=1, Abfrage-Knoten will 2 Stück → abgelehnt."""
    sim = PSimulator()
    lager = _make_lager(sim, name="L", anfang=1)
    knoten = _make_knoten(sim, name="K", dauer=20)

    assoz = PAssozMengeAbfr(sim)
    assoz.m_sName = "K->abfr"
    assoz.m_lMengRess = lager
    assoz.m_iMengeAbfr = 2
    knoten.add_assoziation(assoz)

    _attach_ausloeser(sim, knoten=knoten, name="A", t=10)
    sim.start()

    assert lager.m_iBestandAktuell == 1
    assert lager.m_iPtkAnfragenAb == 1
    assert lager.m_iPtkAbgelehnteAnfrAb == 1
    assert knoten.m_iPtkProzRefuseCount == 1


# ----------------------------------------------------------------------
# G) Counter mit mehreren Aufträgen
# ----------------------------------------------------------------------


def test_v5_counter_drei_verbr_aufträge_eins_abgelehnt() -> None:
    """Lager anfang=2. 3 Verbraucher-Aufträge → 2 erfolgreich, 1 wartet."""
    sim = PSimulator()
    lager = _make_lager(sim, name="L", anfang=2)
    knoten = _make_knoten(sim, name="K", dauer=50)
    _attach_verbr(knoten, lager, menge_ein=1)
    for i, t in enumerate((10, 20, 30)):
        _attach_ausloeser(sim, knoten=knoten, name=f"A{i + 1}", t=t)

    sim.start()

    # 2 Aufträge sind durchgelaufen, der dritte hängt in der Warteschlange
    assert lager.m_iBestandAktuell == 0
    assert lager.m_iPtkKummVerbMengeGesamt == 2
    # Anfragen: A1 ok (=1), A2 ok (=1) — A3 trifft auf leeres Lager (=1 abgelehnt)
    # Plus: bei jedem on_proz_beendet wird proz_wart_ausloesen gerufen → A3
    # wird im Re-Try erneut geprüft (auch bei leerem Lager).
    assert lager.m_iPtkAnfragenAb >= 3
    assert lager.m_iPtkAbgelehnteAnfrAb >= 1
    assert not sim.m_oWarteSchl.is_empty()
