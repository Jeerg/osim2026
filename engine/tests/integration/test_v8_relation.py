"""V8: PtRelation — Multi-Assoz + Multi-Knoten-Ressourcen-Bindung.

PtRelation/PtRelationBeleg/PtRelationMenge sind seit V4/V5 implementiert.
V8 verifiziert die übergreifenden Szenarien, die V4 und V5 bewusst einfach
hielten:
    A) Multi-Assoz an einem Knoten — Maschine UND Material gleichzeitig
    B) Multi-Assoz mit Teil-Ausfall — sauberer Rollback der Relationen
    C) Multi-Knoten-Plan — gleiche Ressource für mehrere Knoten
       (jeder Knoten bindet unabhängig, C++-konform)

Zusätzlich dokumentiert via `pytest.mark.xfail` einen bekannten C++-Bug:
m_lErlZubuchung-Reservierungs-Leak bei bounded Erzgt + Refuse.
"""

from __future__ import annotations

import pytest

from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.durchlaufplan import PDurchlaufplan
from osim_engine.pps.kante.uebergang import PDpKaUebergang
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator
from osim_engine.resources.assoziation.beleg import PAssozBeleg
from osim_engine.resources.assoziation.menge import (
    PAssozMengeErzgt,
    PAssozMengeVerbr,
)
from osim_engine.resources.beleg import PBetriebsmittel, RessStatus
from osim_engine.resources.menge import PRessMenge


# ----------------------------------------------------------------------
# A) Multi-Assoz an einem Knoten — Maschine + Material
# ----------------------------------------------------------------------


def _build_machine_plus_material(
    *, lager_anfang: int, knoten_dauer: int = 100, ausl_t: int = 10
) -> PSimulator:
    sim = PSimulator()

    maschine = PBetriebsmittel(sim)
    maschine.m_sName = "M"
    sim.register_ressource(maschine)

    lager = PRessMenge(sim)
    lager.m_sName = "L"
    lager.m_iBestandAnfang = lager_anfang
    sim.register_ress_menge(lager)

    knoten = PDpKnKonstant(sim)
    knoten.m_sName = "K"
    knoten.m_iDurchfuehrungszeit = knoten_dauer
    sim.register_knoten(knoten)

    # Reihenfolge: erst Maschine, dann Material (für Rollback-Tests relevant)
    a_m = PAssozBeleg(sim); a_m.m_sName = "K->M"
    a_m.m_lRessourcen.append(maschine)
    knoten.add_assoziation(a_m)

    a_l = PAssozMengeVerbr(sim); a_l.m_sName = "K->L"
    a_l.m_lMengRess = lager
    a_l.m_iMengeEin = 1
    knoten.add_assoziation(a_l)

    a = PAslEinzel(sim); a.m_sName = "A"
    a.m_iBeginTermin = ausl_t
    a.m_lDlpl = knoten
    sim.register_ausloeser(a)

    return sim


def test_v8_multi_assoz_machine_and_material_both_available() -> None:
    """Happy path: Maschine frei + Material vorhanden → Knoten läuft.
    Beim Bearbeit-Beginn: Maschine belegt, Material abgebucht.
    Beim Bearbeit-Ende: Maschine frei, Material bleibt abgebucht.
    """
    sim = _build_machine_plus_material(lager_anfang=3)
    sim.start()

    maschine = sim.m_lRessBeleg[0]
    lager = sim.m_lRessMenge[0]
    knoten = sim.m_lKnoten[0]

    assert knoten.m_iPtkBegAusloesungCount == 1
    assert knoten.m_iPtkProzRefuseCount == 0
    assert knoten.m_iPtkAusloesungCount == 1
    assert maschine.m_rsStatus == RessStatus.RS_FREI
    assert maschine.m_iPtkAnfrageErfuellt == 1
    assert lager.m_iBestandAktuell == 2  # 3 - 1
    assert lager.m_iPtkKummVerbMengeGesamt == 1


def test_v8_multi_assoz_material_missing_rollback_relations() -> None:
    """Maschine frei, Material leer → ress_verfuegbar False, on_bearbeit_abgelehnt
    räumt alle Relationen auf. M bleibt rsFrei (wurde nie belegen-aufgerufen).

    Wichtig zu beachten (1:1 C++):
    - `maschine.m_iPtkAnfragenGesamt` UND `m_iPtkAnfrageErfuellt` zählen die
      `RessVerfuegbar`-Aufrufe — wenn M frei war beim Check, gilt das als
      erfüllte Anfrage, auch wenn der Knoten am Ende refused wird.
    - `m_rsStatus` bleibt RS_FREI, weil `ress_belegen` nie gerufen wurde
      (das passiert erst beim `bearbeit_beginnen`, nicht beim `ress_verfuegbar`).
    """
    sim = _build_machine_plus_material(lager_anfang=0)
    sim.start()

    maschine = sim.m_lRessBeleg[0]
    lager = sim.m_lRessMenge[0]
    knoten = sim.m_lKnoten[0]

    assert knoten.m_iPtkBegAusloesungCount == 1
    assert knoten.m_iPtkProzRefuseCount == 1
    assert knoten.m_iPtkAusloesungCount == 0
    # Maschine: Anfrage erfolgreich (rsFrei zum Check-Zeitpunkt), aber nie belegen
    assert maschine.m_rsStatus == RessStatus.RS_FREI
    assert maschine.m_iPtkAnfragenGesamt == 1
    assert maschine.m_iPtkAnfrageErfuellt == 1  # C++-Semantik: Check erfolgreich
    # Material: 1 Anfrage abgelehnt
    assert lager.m_iBestandAktuell == 0
    assert lager.m_iPtkAnfragenAb == 1
    assert lager.m_iPtkAbgelehnteAnfrAb == 1
    # Proz hängt in Warteschlange (wird nie bedient — Lager bleibt leer)
    assert not sim.m_oWarteSchl.is_empty()
    # Relationen müssen geleert sein
    proz = sim.m_oWarteSchl.get_head()
    assert proz is not None
    assert proz.m_oRelationen == []


def test_v8_multi_assoz_first_assoz_fails_no_relations_created() -> None:
    """Wenn die ERSTE Assoz fehlschlägt, werden gar keine Relationen erzeugt."""
    sim = PSimulator()

    maschine = PBetriebsmittel(sim); maschine.m_sName = "M"
    sim.register_ressource(maschine)

    # Vorbelegen — zweite Ressource damit M von Anfang an belegt ist
    other = PBetriebsmittel(sim); other.m_sName = "Other"
    sim.register_ressource(other)

    lager = PRessMenge(sim); lager.m_sName = "L"
    lager.m_iBestandAnfang = 5
    sim.register_ress_menge(lager)

    knoten_blocker = PDpKnKonstant(sim); knoten_blocker.m_sName = "KB"
    knoten_blocker.m_iDurchfuehrungszeit = 10_000  # blockiert M lange
    sim.register_knoten(knoten_blocker)
    ab = PAssozBeleg(sim); ab.m_lRessourcen.append(maschine)
    knoten_blocker.add_assoziation(ab)
    auslb = PAslEinzel(sim); auslb.m_iBeginTermin = 0
    auslb.m_lDlpl = knoten_blocker
    sim.register_ausloeser(auslb)

    # Knoten K: Maschine M (belegt durch KB ab t=0) + Material (verfügbar)
    knoten = PDpKnKonstant(sim); knoten.m_sName = "K"
    knoten.m_iDurchfuehrungszeit = 100
    sim.register_knoten(knoten)
    a_m = PAssozBeleg(sim); a_m.m_lRessourcen.append(maschine)
    knoten.add_assoziation(a_m)
    a_l = PAssozMengeVerbr(sim); a_l.m_lMengRess = lager; a_l.m_iMengeEin = 1
    knoten.add_assoziation(a_l)

    ausl = PAslEinzel(sim); ausl.m_iBeginTermin = 100  # nach KB-Start
    ausl.m_lDlpl = knoten
    sim.register_ausloeser(ausl)

    sim.start()

    # KB läuft 10000s ab t=0. K probiert bei t=100: Maschine belegt → assoz_M
    # liefert False, assoz_L wird NICHT mehr gefragt (Kurzschluss bei first-fail).
    # K landet in Warteschlange. Sobald KB bei 10000 fertig ist → ProzWart →
    # K-Re-Try: assoz_M True → assoz_L wird gefragt (1×) → True → abbuchen.
    # Also Material insgesamt 1× gefragt (im Re-Try, NICHT initial).
    assert sim.m_oWarteSchl.is_empty()
    assert lager.m_iBestandAktuell == 4
    assert lager.m_iPtkAnfragenAb == 1   # nur im Re-Try, initial-Check brach bei M ab
    assert lager.m_iPtkAbgelehnteAnfrAb == 0
    assert knoten.m_iPtkAusloesungCount == 1


# ----------------------------------------------------------------------
# B) Multi-Knoten-Plan mit geteilter Ressource
# ----------------------------------------------------------------------


def _build_plan_two_nodes_shared_machine(
    *, k1_dauer: int = 100, k2_dauer: int = 200
) -> PSimulator:
    """Plan P: K1 → K2, beide brauchen Maschine M."""
    sim = PSimulator()

    maschine = PBetriebsmittel(sim); maschine.m_sName = "M"
    sim.register_ressource(maschine)

    plan = PDurchlaufplan(sim); plan.m_sName = "P"

    k1 = PDpKnKonstant(sim); k1.m_sName = "P.K1"; k1.m_iDurchfuehrungszeit = k1_dauer
    k2 = PDpKnKonstant(sim); k2.m_sName = "P.K2"; k2.m_iDurchfuehrungszeit = k2_dauer
    plan.add_knoten(k1); plan.add_knoten(k2)

    # Beide Knoten brauchen M
    for k in (k1, k2):
        a_m = PAssozBeleg(sim); a_m.m_sName = f"{k.m_sName}->M"
        a_m.m_lRessourcen.append(maschine)
        k.add_assoziation(a_m)

    # Plan-Topologie
    def _ka(n: str) -> PDpKaUebergang:
        ka = PDpKaUebergang(sim); ka.m_sName = f"P.{n}"
        ka.m_iUebergangszeit = 0
        plan.add_kante(ka)
        return ka

    kS, k12, kE = _ka("S"), _ka("12"), _ka("E")
    plan.set_start_kante(kS)
    kS.m_lNachfolger.append(k1); k1.m_lKanteEin = kS
    k1.m_lKanteAus = k12; k12.m_lVorgaenger.append(k1)
    k12.m_lNachfolger.append(k2); k2.m_lKanteEin = k12
    k2.m_lKanteAus = kE; kE.m_lVorgaenger.append(k2)
    plan.set_end_kante(kE)

    sim.register_plan(plan)

    a = PAslEinzel(sim); a.m_sName = "A"; a.m_iBeginTermin = 10
    a.m_lDlpl = plan
    sim.register_ausloeser(a)

    return sim


def test_v8_multi_knoten_plan_sequential_uses_same_machine() -> None:
    """Plan K1→K2, beide auf M. Sequenziell:
    t=10: K1 belegt M
    t=110: K1 frei, K2 belegt M (= dieselbe)
    t=310: K2 frei.
    Beide hängten ihre Relation an dieselbe Maschine.
    """
    sim = _build_plan_two_nodes_shared_machine()
    sim.start()

    maschine = sim.m_lRessBeleg[0]
    plan = sim.m_lDlpl[0]
    k1, k2 = plan.m_lKnoten

    # Beide Knoten haben M je 1× belegt
    assert k1.m_iPtkAusloesungCount == 1
    assert k2.m_iPtkAusloesungCount == 1
    assert maschine.m_iPtkAnfrageErfuellt == 2  # K1 + K2
    assert maschine.m_iPtkAnfragenGesamt == 2
    assert maschine.m_rsStatus == RessStatus.RS_FREI

    # Auslöser hat 1× abgeschlossen, gesamt-Dauer ist 300
    a = sim.m_lAusl[0]
    assert a.m_iPtkAusloesungCount == 1
    assert a.m_dPtkDurchlaufzeit == 300


def test_v8_multi_knoten_plan_k2_wartet_wenn_m_extern_belegt() -> None:
    """Plan K1→K2 auf M, plus extern PASlEinzel der M bei K1-Ende ergreift."""
    sim = _build_plan_two_nodes_shared_machine(k1_dauer=50, k2_dauer=100)
    # Externer Knoten der M ab t=60 für 200s belegt
    plan = sim.m_lDlpl[0]
    maschine = sim.m_lRessBeleg[0]

    kx = PDpKnKonstant(sim); kx.m_sName = "X"; kx.m_iDurchfuehrungszeit = 200
    sim.register_knoten(kx)
    ax = PAssozBeleg(sim); ax.m_lRessourcen.append(maschine)
    kx.add_assoziation(ax)
    aux = PAslEinzel(sim); aux.m_sName = "AX"; aux.m_iBeginTermin = 60
    aux.m_lDlpl = kx
    sim.register_ausloeser(aux)

    sim.start()

    # K1: t=10..60 (50s). M belegt bei 10, frei bei 60.
    # Externer Knoten X versucht bei 60: M ist gerade freigegeben — wer kommt
    # zuerst dran? sub_time-Reihenfolge: EvtBearbeitEnde (sub=2) feuert bei 60,
    # ress_freigeben passiert in EvtBearbeitEnde, dann EvtAuslTriggern (sub=1)
    # für AX bei 60 — aber bei gleicher Zeit gilt sub_time-Order.
    # Bei sub_time=2 (EvtBearbeitEnde) zuerst, dann sub_time=1 (EvtAusl@60).
    # Aber sub_time=1 < 2! Also AX-Trigger feuert ZUERST bei 60 (sub=1) →
    # K1 ist noch belegt (EvtBearbeitEnde@60 sub=2 nicht durchlaufen) → X
    # refused, in Warteschlange. Dann K1.EvtBearbeitEnde sub=2 → freigeben.
    # ProzWartAusloesen → snapshot=[X], aber auch K2 will starten?
    # Eigentlich startet K2 erst im on_proz_beendet via Kante.
    # Routing-Reihenfolge: on_proz_beendet → kante.proz_weitergeben → K2 →
    # K2.bearbeit_beginnen → M war noch belegt (rsBelegt!) — Warteschlange.
    # Dann super → ress_freigeben → ProzWartAusloesen → snapshot=[X, K2-proz]
    # → X kommt zuerst (war zuerst in Warteschlange).
    # Detail bleibt fragil, prüfe nur Endergebnis.

    plan_k1, plan_k2 = plan.m_lKnoten
    assert plan_k1.m_iPtkAusloesungCount == 1
    assert plan_k2.m_iPtkAusloesungCount == 1
    # Externer Knoten X auch durchgelaufen
    assert kx.m_iPtkAusloesungCount == 1
    assert maschine.m_rsStatus == RessStatus.RS_FREI
    assert sim.m_oWarteSchl.is_empty()


# ----------------------------------------------------------------------
# C) Bekannte C++-Limitierung: m_lErlZubuchung-Leak
# ----------------------------------------------------------------------


@pytest.mark.xfail(
    reason="Bekannter C++-Bug (PRessMenge.cpp:27-75): wenn PAssozMengeErzgt "
    "auf bounded Lager TRUE meldet (Reservierung in m_lErlZubuchung) und "
    "eine NACHFOLGENDE Assoz dann FALSE liefert, räumt on_bearbeit_abgelehnt "
    "die Relation auf — aber die m_lErlZubuchung-Reservierung bleibt stale. "
    "C++ hat exakt dasselbe Verhalten. Fix wäre Abweichung von 1:1-Treue."
)
def test_v8_bounded_erzgt_leak_known_limitation() -> None:
    """Demonstriert die Limitierung. Test schlägt absichtlich fehl (xfail).
    Wenn die Erwartung mal erfüllt wird (Fix), wird der Test grün und wir
    sollten den xfail entfernen.
    """
    sim = PSimulator()

    # Bounded Lager mit Anfangs-Bestand 0, Max 5
    lager = PRessMenge(sim); lager.m_sName = "L"
    lager.m_iBestandAnfang = 0
    lager.m_iBestandMax = 5
    sim.register_ress_menge(lager)

    # Maschine permanent belegt durch Blocker
    maschine = PBetriebsmittel(sim); maschine.m_sName = "M"
    sim.register_ressource(maschine)

    blocker = PDpKnKonstant(sim); blocker.m_sName = "KB"
    blocker.m_iDurchfuehrungszeit = 100_000
    sim.register_knoten(blocker)
    ab = PAssozBeleg(sim); ab.m_lRessourcen.append(maschine)
    blocker.add_assoziation(ab)
    auslb = PAslEinzel(sim); auslb.m_iBeginTermin = 0
    auslb.m_lDlpl = blocker
    sim.register_ausloeser(auslb)

    # Knoten K: PRIMÄR Erzgt(L, M=1) (success → Reservierung) +
    # SEKUNDÄR Beleg(M) (Maschine ist belegt → fail).
    k = PDpKnKonstant(sim); k.m_sName = "K"; k.m_iDurchfuehrungszeit = 50
    sim.register_knoten(k)

    a_e = PAssozMengeErzgt(sim); a_e.m_lMengRess = lager; a_e.m_iMengeAus = 1
    k.add_assoziation(a_e)
    a_m = PAssozBeleg(sim); a_m.m_lRessourcen.append(maschine)
    k.add_assoziation(a_m)

    ausl = PAslEinzel(sim); ausl.m_iBeginTermin = 50  # nach Blocker
    ausl.m_lDlpl = k
    sim.register_ausloeser(ausl)

    sim.start()

    # Erwartung NACH dem Bug-Fix: nach Refuse darf keine Reservierung übrig sein
    assert len(lager.m_lErlZubuchung) == 0, (
        f"Stale Reservierung im Lager: {len(lager.m_lErlZubuchung)} Einträge"
    )
