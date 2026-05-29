"""AuswertungListener — Period-KPIs als ``kpi_auswertung``-Stream (SPEC §6.3).

Bündelt alle 11 ``ISimulatorViewerAusw*``-Varianten (D-3.3) in EINEM Stream
über einen ``kind``-Diskriminator. Der Listener hält je kind einen
Insights-Aggregator (aus ``insights/classes.py``, P5-N/D-3.2) und arbeitet
**incremental** (D-3.1 / SPEC §7.3):

    - ``on_sim_ereig`` zieht je Event O(1)-Counter-Updates der betroffenen
      Aggregatoren (best-effort read-only, kein Kernel-Eingriff, SPEC §5).
    - ``on_period_end`` emittiert für JEDE der 11 kinds genau einen Frame
      ``stream="kpi_auswertung"`` mit ``v={"kind", "period_num", **snapshot}``,
      ruft danach ``reset_period()`` auf allen Aggregatoren (period-only, D-3.4)
      und ``writer.flush()``.

``period_num``: der Engine-Kern hat bei ``listener.on_period_end`` bereits
``m_periodNum`` hochgezählt (``simulator.py`` Z. 129/140). Die GERADE beendete
Periode ist daher ``m_periodNum - 1`` — die erste period-end-Flush trägt 0.

Die 11 kinds, deren Quell-Slice heute Skelett ist (pers/schicht/kalkulation/
wschlange/nbearbeit u.a.), liefern partial-Snapshots mit Null-Defaults; der
Stream wird in ``meta.json`` (01-04) entsprechend als ``partial`` markiert.
Der Frame-Vertrag steht ab sofort vollständig.

Self-Registrierung via ``register_listener`` beim Import — KEINE Änderung an
``attach.py`` oder ``listeners/__init__.py`` (Registry-Pattern aus 01-01).
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
_PT_BEARB = 1  # PtStatus.PT_BEARB (pps/prozess/base.py)


class AuswertungListener(OListenerSimulator):
    """Emittiert period-end-Aggregate für alle 11 KPI-kinds (D-3.3)."""

    def __init__(self, seq_counter: "SeqCounter", writer: "JsonlStreamWriter") -> None:
        super().__init__()
        self._seq = seq_counter
        self._writer = writer

        # Je kind ein Insights-Aggregator (D-3.2). kauf/eigen sind Subkinds der
        # Auftrags-Sicht (IAuftrag-Mechanik), gesamt ist der ISimulator-Roll-up.
        self._prod_auftrag = IFertigungsauftrag()
        self._best_auftrag = IBestellauftrag()
        self._kauf = IBestellauftrag()
        self._eigen = IFertigungsauftrag()
        self._betr = IBetriebsmittel()
        self._pers = IPerson()
        self._schicht = IArbeitszeit()
        self._kalkulation = IGonzo()
        self._wschlange = IProzess()
        self._nbearbeit = IProzess()
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

        # Prozesse, deren Start bereits gezählt wurde (Identität über id(),
        # kein Status-Mutieren — analog GanttListener).
        self._started: set[int] = set()
        self._start_time: dict[int, int] = {}
        self._period_len_set = False

    # ------------------------------------------------------------------
    # Incremental Counter-Updates pro Event (D-3.1, O(1))
    # ------------------------------------------------------------------

    def on_sim_ereig(self) -> None:
        assert self.m_sim is not None
        sim = self.m_sim

        # Periodenlänge einmalig an die zeitanteils-basierten Aggregatoren
        # durchreichen (für auslastung_pct = teil / period_len * 100).
        if not self._period_len_set:
            plen = getattr(sim, "m_periodLen", 0)
            self._betr.set_period_len(plen)
            self._pers.set_period_len(plen)
            self._period_len_set = True

        pool = getattr(sim, "_evt_pool", None)
        if pool is None or not pool.curr_exists():
            return
        event = pool.get_curr()
        if event is None:
            return

        proz = event.m_obj
        meta = event.m_meta
        meta_name = getattr(meta, "m_name", "")
        t = sim.evt_curr_time()

        status = getattr(proz, "m_eStatus", None)
        is_bearb = getattr(status, "value", status) == _PT_BEARB

        # start: neuer Prozess in Bearbeitung → Auftrags-/Gesamt-Durchsatz.
        if proz is not None and is_bearb and id(proz) not in self._started:
            self._started.add(id(proz))
            start_time = getattr(proz, "m_iBearbeitBeginn", t)
            self._start_time[id(proz)] = start_time
            self._prod_auftrag.update_auftrag_start()
            self._eigen.update_auftrag_start()
            self._gesamt.update_auftrag_gesamt()

        # ende: Bearbeitungs-Ende → Durchlaufzeit + Betriebsmittel-Belegung.
        if meta_name == _BEARBEIT_ENDE and proz is not None:
            start_time = self._start_time.get(id(proz))
            dauer = (t - start_time) if start_time is not None else 0
            # P5-D Skelett: konkreter verspaetet-Status noch nicht ableitbar →
            # konservativ False (partial; geschärft mit P5-D-Slice-Closure).
            self._prod_auftrag.update_auftrag_ende(durchlaufzeit=dauer, verspaetet=False)
            self._eigen.update_auftrag_ende(durchlaufzeit=dauer, verspaetet=False)
            self._gesamt.update_auftrag_fertig()
            if dauer > 0:
                self._betr.update_bearbeitung(dauer)

    # ------------------------------------------------------------------
    # Period-End-Flush aller 11 KPI-kinds (D-3.1 / D-3.3 / D-3.4)
    # ------------------------------------------------------------------

    def on_period_end(self, time_end: int) -> None:
        assert self.m_sim is not None
        sim = self.m_sim
        # m_periodNum wurde im Kern bereits vorgerückt → beendete Periode == -1.
        period_num = max(0, getattr(sim, "m_periodNum", 1) - 1)
        t = sim.evt_curr_time()

        for kind, agg in self._kinds:
            v = {"kind": kind}
            v.update(agg.snapshot(period_num))  # enthält period_num
            self._writer.write(
                Frame(t=t, stream="kpi_auswertung", seq=self._seq.next(), v=v)
            )

        # period-only-Aggregation: Counter für die nächste Periode zurücksetzen.
        for _kind, agg in self._kinds:
            agg.reset_period()
        # Start-Tracking ist period-übergreifend (laufende Aufträge bleiben),
        # aber abgeschlossene Prozesse müssen den Period-Boundary nicht erneut
        # auslösen — das Set bleibt erhalten, weil id() pro Lauf eindeutig ist.

        self._writer.flush()

    def on_period_break(self, time_end: int) -> None:
        # Bei Suspend ebenfalls einen partial-Period-Snapshot flushen.
        self.on_period_end(time_end)


# Selbst-Registrierung beim Import (Registry-Pattern, kein attach.py-Edit).
def _factory(seq_counter, writer):  # noqa: ANN001
    return AuswertungListener(seq_counter, writer)


_factory.__name__ = "AuswertungListener"
register_listener(_factory)
