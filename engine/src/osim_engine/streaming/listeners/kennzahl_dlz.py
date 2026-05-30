"""KennzahlDlzListener — Durchlaufzeit-Rohdaten als ``kennzahl_dlz``-Stream.

Warum ein eigener Stream statt ``gantt_durchlauf``: der ``gantt_durchlauf``-Stream
trägt start/ende je **Operation/Prozess** (z. B. „WE1: Scannen"). Die OSim-
Durchlaufzeit (Knz „mittlere Durchlaufzeit") ist aber je **Auslösung** definiert —
von der Auslösung bis zur Fertigstellung des Durchlaufplans (PAusloeser.cpp:149-155,
GetKnzMittlDlfz = ``m_dPtkDurchlaufzeit / m_iPtkAusloesungCount``). Diese Größe
akkumuliert der Auslöser selbst in ``on_dlpl_beendet``
(``dauer = EvtCurrTime() - trigger.m_iAuslZeitpunkt``, ausloeser/base.py:109-121).

Dieser Listener liest die Akkumulatoren read-only am Perioden-Ende aus — KEIN
Eingriff in den Sim-Kern (SPEC §5, heilig), keine fragile start/ende-Paarung.
Leitprinzip (KENNZAHLEN-SPEC): Engine loggt ROHDATEN je Auslöser, das UI
berechnet Mittelwerte und Gruppierungen (je Auslöser / je Durchlaufplan / ø).

Ein Frame pro Periode, ``v = {kind:"period", period_num, records:[...]}``. Jeder
record ist ein Auslöser mit abgeschlossener Auslösung (``count > 0``):
    - ``ausloeser``        m_sName des Auslösers (Kategorie-Name Auslöser-Sicht)
    - ``ausloeser_oid``    stabile OID (Farb-/Identitäts-Schlüssel, -1 = kein OID)
    - ``durchlaufplan``    m_sName des Durchlaufplans (Kategorie-Name Plan-Sicht)
    - ``durchlaufplan_oid`` OID des Plans (-1, solange Loader keine Plan-OID setzt)
    - ``dlz_sum``          Σ Durchlaufzeit über die Auslösungen der Periode (s)
    - ``count``            Anzahl abgeschlossener Auslösungen der Periode

period_num: der Sim-Kern hat bei ``on_period_end`` ``m_periodNum`` bereits
hochgezählt — die gerade beendete Periode ist ``m_periodNum-1`` (wie
AuswertungListener). Die Auslöser-Akkumulatoren werden vom Recorder je Periode
über ``on_rec_init`` zurückgesetzt; ``on_period_end`` liest also die Totale der
gerade beendeten Periode.

Self-Registrierung via ``register_listener`` beim Import (Registry-Pattern).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.core.listener import OListenerSimulator
from osim_engine.streaming.frame import Frame
from osim_engine.streaming.registry import register_listener

if TYPE_CHECKING:
    from osim_engine.streaming.jsonl_writer import JsonlStreamWriter
    from osim_engine.streaming.seq import SeqCounter


class KennzahlDlzListener(OListenerSimulator):
    """Emittiert je Periode einen ``kennzahl_dlz``-Frame mit Auslöser-DLZ-Rohdaten."""

    def __init__(self, seq_counter: "SeqCounter", writer: "JsonlStreamWriter") -> None:
        super().__init__()
        self._seq = seq_counter
        self._writer = writer

    # ------------------------------------------------------------------
    # Helpers (read-only, best-effort — nie den Auslöser mutieren)
    # ------------------------------------------------------------------

    @staticmethod
    def _durchlaufplan(ausl):  # noqa: ANN001, ANN205
        """(name, oid) des zugeordneten Durchlaufplans (m_lDlpl)."""
        dlpl = getattr(ausl, "m_lDlpl", None)
        if dlpl is None:
            return None, -1
        return getattr(dlpl, "m_sName", None), int(getattr(dlpl, "oid", -1) or -1)

    def _collect_records(self) -> list[dict]:
        sim = self.m_sim
        records: list[dict] = []
        for ausl in getattr(sim, "m_lAusl", []) or []:
            name = getattr(ausl, "m_sName", None)
            if name is None:  # leere Slots (m_durch == NULL) überspringen
                continue
            # ALLE benannten Auslöser emittieren — auch count==0 (nie gefeuerte).
            # Das UI braucht die volle Objektmenge, um den ø-Balken exakt wie OSim
            # zu bilden: Default (NoZeroInEval=0) teilt durch GetCount() = ALLE
            # Auslöser (PAusloeserLList::PtkMittlDlfz, PAusloeser.cpp:687-693).
            # count==0 → GetKnzMittlDlfz == 0.0 (PAusloeser.cpp:151-152).
            count = int(getattr(ausl, "m_iPtkAusloesungCount", 0) or 0)
            dlz_sum = float(getattr(ausl, "m_dPtkDurchlaufzeit", 0.0) or 0.0)
            dlpl_name, dlpl_oid = self._durchlaufplan(ausl)
            records.append(
                {
                    "ausloeser": name,
                    "ausloeser_oid": int(getattr(ausl, "oid", -1) or -1),
                    "durchlaufplan": dlpl_name,
                    "durchlaufplan_oid": dlpl_oid,
                    "dlz_sum": dlz_sum,
                    "count": count,
                }
            )
        return records

    # ------------------------------------------------------------------
    # Period-End-Flush
    # ------------------------------------------------------------------

    def on_period_end(self, time_end: int) -> None:
        assert self.m_sim is not None
        sim = self.m_sim
        period_num = max(0, getattr(sim, "m_periodNum", 1) - 1)
        t = sim.evt_curr_time()

        v = {
            "kind": "period",
            "period_num": period_num,
            "records": self._collect_records(),
        }
        self._writer.write(
            Frame(t=t, stream="kennzahl_dlz", seq=self._seq.next(), v=v)
        )
        self._writer.flush()

    def on_period_break(self, time_end: int) -> None:
        self.on_period_end(time_end)


# Selbst-Registrierung beim Import (Registry-Pattern, kein attach.py-Edit).
def _factory(seq_counter, writer):  # noqa: ANN001
    return KennzahlDlzListener(seq_counter, writer)


_factory.__name__ = "KennzahlDlzListener"
register_listener(_factory)
