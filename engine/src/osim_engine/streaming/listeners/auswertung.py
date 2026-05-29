"""AuswertungListener — Period-KPIs als ``kpi_auswertung``-Stream (SPEC §6.3).

GAP-CLOSURE 01-11 — **OSim2004-Feldtreue**: bündelt die 11
``ISimulatorViewerAusw*``-Varianten (D-3.3) in EINEM Stream über einen
``kind``-Diskriminator, mit den EXAKTEN OSim-Feldsätzen je Analyse (1:1 gegen
die ``.cpp`` gepinnt, keine erfundene Generik mehr).

Honest-slice-Schnitt (User-Hartregel: nichts erfinden):

NOW-BUILDABLE (echte Werte aus dem laufenden Engine-State, read-only):
    - ``prod_auftrag`` — je Auslöser (= Fertigungsauftrag im headless-Port) eine
      Zeile (Teil/Menge/Soll-Beginn-Tag/Beschreibung).
    - ``nbearbeit`` — Auslöser-Aufträge, deren Prozess noch nicht abgearbeitet
      ist (Filter analog fsEinlast: kein PT_ENDE).
    - ``wschlange`` — je wartendem Prozess in ``sim.m_oWarteSchl`` eine Zeile
      (Betriebsmittel/Teil/Restmenge/Wartestatus).

GATED (echte OSim-Feldnamen + null + missing_slice — KEINE erfundenen Zahlen):
    - ``best_auftrag`` — der headless-Port hat KEIN Bestellauftrags-/Lager-
      Modell (m_bestell). Statt zu erfinden: leere records + missing_slice.
    - ``pers``/``betr``/``kauf``/``eigen``/``kalkulation``/``gesamt`` — Kosten-/
      Bestands-/Sales-/Arbeitszeit-Slices (P5-D/P5-M + Kosten-Slice) heute
      Skelett → die snapshot()-Felder tragen null + missing_slice (Task 1).

``on_period_end`` baut die now-buildable Records read-only aus dem sim-State,
emittiert für JEDE der 11 kinds genau einen Frame ``stream="kpi_auswertung"``
mit ``v={"kind", "period_num", **snapshot}``, ruft ``reset_period()`` (period-
only, D-3.4) und ``writer.flush()``.

``period_num``: der Engine-Kern hat bei ``listener.on_period_end`` bereits
``m_periodNum`` hochgezählt — die GERADE beendete Periode ist ``m_periodNum-1``.

Self-Registrierung via ``register_listener`` beim Import — KEINE Änderung an
``attach.py`` oder ``listeners/__init__.py`` (Registry-Pattern aus 01-01).
KEIN Eingriff in ``core/simulator.py`` (SPEC §5, HEILIG).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.core.listener import OListenerSimulator
from osim_engine.insights import (
    IArbeitszeit,
    IBestellauftrag,
    IBetriebsmittel,
    IFertigungsauftrag,
    IGonzo,
    ILagerEigen,
    ILagerKauf,
    INBearbeit,
    IPerson,
    IProzess,
    ISimulator,
)
from osim_engine.streaming.frame import Frame
from osim_engine.streaming.registry import register_listener

if TYPE_CHECKING:
    from osim_engine.streaming.jsonl_writer import JsonlStreamWriter
    from osim_engine.streaming.seq import SeqCounter

_BEARBEIT_ENDE = "EvtBearbeitEnde"
_PT_BEARB = 1  # PtStatus.PT_BEARB
_PT_ENDE = 2  # PtStatus.PT_ENDE
_PT_WART = 3  # PtStatus.PT_WART
_PT_UNT = 4  # PtStatus.PT_UNT

# best_auftrag ist im headless-Port quellenlos (kein m_bestell-Modell).
_BEST_AUFTRAG_MISSING_SLICE = "Bestell-/Lager-Slice"


class AuswertungListener(OListenerSimulator):
    """Emittiert period-end-Aggregate für alle 11 KPI-kinds (D-3.3)."""

    def __init__(self, seq_counter: "SeqCounter", writer: "JsonlStreamWriter") -> None:
        super().__init__()
        self._seq = seq_counter
        self._writer = writer

        # Je kind ein Insights-Aggregator (D-3.2) mit echtem OSim-Feldsatz.
        self._prod_auftrag = IFertigungsauftrag()
        self._best_auftrag = IBestellauftrag()  # gated (kein Port-Quell-Modell)
        self._nbearbeit = INBearbeit()
        self._wschlange = IProzess()
        self._betr = IBetriebsmittel()
        self._pers = IPerson()
        self._schicht = IArbeitszeit()
        self._kalkulation = IGonzo()
        self._kauf = ILagerKauf()
        self._eigen = ILagerEigen()
        self._gesamt = ISimulator()

        # Geordnete kind → Aggregator-Map (feste Reihenfolge = Frame-Reihenfolge).
        self._kinds: tuple[tuple[str, object], ...] = (
            ("prod_auftrag", self._prod_auftrag),
            ("best_auftrag", self._best_auftrag),
            ("betr", self._betr),
            ("pers", self._pers),
            ("schicht", self._schicht),
            ("kalkulation", self._kalkulation),
            ("wschlange", self._wschlange),
            ("nbearbeit", self._nbearbeit),
            ("kauf", self._kauf),
            ("eigen", self._eigen),
            ("gesamt", self._gesamt),
        )

        # Durchsatz-Tracking für den gesamt-Roll-up (now-buildable Zusatz).
        self._started: set[int] = set()

    # ------------------------------------------------------------------
    # Incremental Durchsatz-Counter pro Event (D-3.1, O(1), gesamt-Zusatz)
    # ------------------------------------------------------------------

    def on_sim_ereig(self) -> None:
        assert self.m_sim is not None
        sim = self.m_sim

        pool = getattr(sim, "_evt_pool", None)
        if pool is None or not pool.curr_exists():
            return
        event = pool.get_curr()
        if event is None:
            return

        proz = event.m_obj
        meta = event.m_meta
        meta_name = getattr(meta, "m_name", "")

        status = getattr(proz, "m_eStatus", None)
        is_bearb = getattr(status, "value", status) == _PT_BEARB

        if proz is not None and is_bearb and id(proz) not in self._started:
            self._started.add(id(proz))
            self._gesamt.update_auftrag_gesamt()

        if meta_name == _BEARBEIT_ENDE and proz is not None:
            self._gesamt.update_auftrag_fertig()

    # ------------------------------------------------------------------
    # Read-only Sammler für die now-buildable Records (SPEC §5)
    # ------------------------------------------------------------------

    @staticmethod
    def _name(obj, default=None):  # noqa: ANN001, ANN205
        return getattr(obj, "m_sName", default)

    def _collect_prod_und_nbearbeit(self) -> None:
        """prod_auftrag + nbearbeit aus den Auslösern (= Fertigungsaufträge im
        headless-Port) read-only sammeln. Quelle: ``sim.m_lAusl`` (analog C++
        m_fauftr je IInfo). nbearbeit = Aufträge, deren Prozess noch nicht
        abgearbeitet ist (kein PT_ENDE — analog fsEinlast)."""
        sim = self.m_sim
        for ausl in getattr(sim, "m_lAusl", []) or []:
            teil = self._name(ausl)
            if teil is None:  # leere Einträge überspringen (m_durch==NULL)
                continue
            soll_beginn = getattr(ausl, "m_iBeginTermin", 0) or 0
            # Menge: Anzahl ausgelöster Entitäten (best-effort über m_lEntitaet).
            entitaeten = getattr(ausl, "m_lEntitaet", None)
            menge = len(entitaeten) if entitaeten is not None else 1
            knoten = getattr(ausl, "m_lDlpl", None)
            beschreibung = self._name(knoten, "") or ""

            self._prod_auftrag.add_prod_auftrag(
                teil=teil,
                menge=int(menge),
                soll_beginn_tag=int(soll_beginn),
                beschreibung=beschreibung,
            )

            # nbearbeit: nicht abgearbeitet (kein abgeschlossener Counter).
            abge = getattr(ausl, "m_iAbgeCounter", 0) or 0
            ausgeloest = getattr(ausl, "m_iTrigCounter", 0) or 0
            if ausgeloest == 0 or abge < ausgeloest:
                self._nbearbeit.add_nbearbeit(
                    teil=teil, menge=int(menge), beginntermin=int(soll_beginn)
                )

    def _collect_wschlange(self) -> None:
        """wschlange aus der zentralen Prozess-Warteschlange read-only sammeln.
        Quelle: ``sim.m_oWarteSchl`` (PProzessDLL; analog C++
        m_betr->m_wart_schl je Betriebsmittel)."""
        sim = self.m_sim
        wschl = getattr(sim, "m_oWarteSchl", None)
        if wschl is None:
            return
        try:
            prozesse = list(wschl)
        except TypeError:
            return
        for proz in prozesse:
            knoten = getattr(proz, "m_oKnoten", None)
            bm_name = self._name(knoten, "") or ""
            # zu produz. Teil: über Trigger/Auslöser (best-effort).
            trigger = getattr(proz, "m_oTrigger", None)
            ausl = getattr(trigger, "m_oAusloeser", None) if trigger is not None else None
            teil = self._name(ausl, "") or self._name(knoten, "") or ""
            restmenge = getattr(proz, "m_iRestMenge", None)
            if restmenge is None:
                restmenge = 0
            status = getattr(proz, "m_eStatus", None)
            status_val = getattr(status, "value", status)
            if status_val == _PT_UNT:
                wartestatus = IProzess.UNTERBROCHEN
            else:
                wartestatus = IProzess.WARTET_VOR_BM
            self._wschlange.add_wschlange(
                bm_name=bm_name,
                teil=teil,
                restmenge=int(restmenge),
                wartestatus=wartestatus,
            )

    # ------------------------------------------------------------------
    # Period-End-Flush aller 11 KPI-kinds (D-3.1 / D-3.3 / D-3.4)
    # ------------------------------------------------------------------

    def on_period_end(self, time_end: int) -> None:
        assert self.m_sim is not None
        sim = self.m_sim
        period_num = max(0, getattr(sim, "m_periodNum", 1) - 1)
        t = sim.evt_curr_time()

        # now-buildable Records read-only aus dem sim-State sammeln.
        self._collect_prod_und_nbearbeit()
        self._collect_wschlange()

        for kind, agg in self._kinds:
            v = {"kind": kind}
            v.update(agg.snapshot(period_num))  # enthält period_num
            # best_auftrag ist quellenlos im Port → records bleiben leer, aber
            # ein expliziter missing_slice-Marker statt erfundener Zahlen.
            if kind == "best_auftrag":
                v["missing_slice"] = _BEST_AUFTRAG_MISSING_SLICE
            self._writer.write(
                Frame(t=t, stream="kpi_auswertung", seq=self._seq.next(), v=v)
            )

        # period-only-Aggregation: Record-Sammler/Counter zurücksetzen.
        for _kind, agg in self._kinds:
            agg.reset_period()

        self._writer.flush()

    def on_period_break(self, time_end: int) -> None:
        self.on_period_end(time_end)


# Selbst-Registrierung beim Import (Registry-Pattern, kein attach.py-Edit).
def _factory(seq_counter, writer):  # noqa: ANN001
    return AuswertungListener(seq_counter, writer)


_factory.__name__ = "AuswertungListener"
register_listener(_factory)
