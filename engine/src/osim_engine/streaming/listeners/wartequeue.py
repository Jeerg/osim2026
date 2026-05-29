"""WartequeueListener — per-Ressource-Warteschlangen-Sampler als ``gantt_wartequeue``-Stream.

Read-Side-Listener (D-1.2 / SPEC §5.3): sampelt nach jedem Belegungs-/
Warteschlangen-relevanten Event je ``r in sim.m_lRessBeleg``
``r.get_zst_wart_prozesse()`` (Count-Modus, C++ GetZstWartProzesse,
PRessBeleg.cpp:1807-1809). Emittiert einen Frame ``{ressource_id, wartende, t}``
im Stream ``gantt_wartequeue``, wenn sich der Wert ggü. dem letzten Sample
je Ressource ändert (Treppenfunktion — die UI interpoliert, SPEC §1.6).

KEIN Wall-Clock-Timer (SPEC §1.6): Sampling ist rein event-getrieben.
Strikt read-only (T-01-14-01 mitigate: kein Schreiben auf Engine-Objekte).

qcContent/Umlage (GetKnzArbeitsinhalt) und Quali-Stream bleiben out of scope.

Self-Registrierung via ``register_listener`` beim Import — KEIN ``attach.py``-
Edit (Registry-Pattern analog einsatz.py:141-147).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.core.listener import OListenerSimulator
from osim_engine.streaming.frame import Frame
from osim_engine.streaming.registry import register_listener

if TYPE_CHECKING:
    from osim_engine.streaming.jsonl_writer import JsonlStreamWriter
    from osim_engine.streaming.seq import SeqCounter


class WartequeueListener(OListenerSimulator):
    """Emittiert gantt_wartequeue-Frames mit der Warteschlangen-Länge je Ressource.

    Sample-Strategie: bei jedem Event die gesamte m_lRessBeleg-Liste durchgehen;
    nur wenn sich der Zähler für eine Ressource ändert, wird ein Frame emittiert
    (Treppenfunktion, Änderungs-getrieben).
    """

    def __init__(self, seq_counter: "SeqCounter", writer: "JsonlStreamWriter") -> None:
        super().__init__()
        self._seq = seq_counter
        self._writer = writer
        # Letzter bekannter Warteschlangen-Wert je Ressource (id(r) → int)
        self._prev_count: dict[int, int] = {}

    def _emit(self, t: int, v: dict) -> None:
        self._writer.write(
            Frame(
                t=t, stream="gantt_wartequeue", seq=self._seq.next(),
                v=v,
            )
        )

    def on_sim_ereig(self) -> None:
        assert self.m_sim is not None
        sim = self.m_sim
        t = sim.evt_curr_time()

        # Per-Ressource-Warteschlangen-Sampling (SPEC §5.3, GRAFIKFENSTER-SPEC §3.2).
        # Strikt read-only: get_zst_wart_prozesse() liest nur len(m_lPtkWartschl).
        for r in getattr(sim, "m_lRessBeleg", ()):
            r_id = id(r)
            curr = r.get_zst_wart_prozesse() if hasattr(r, "get_zst_wart_prozesse") else 0
            prev = self._prev_count.get(r_id)

            if prev is None or curr != prev:
                # Treppenfunktion: nur bei Änderung emittieren
                self._prev_count[r_id] = curr
                self._emit(t, {
                    "ressource_id": getattr(r, "m_sName", None),
                    "wartende": curr,
                    "t": t,
                })


# Selbst-Registrierung beim Import (Registry-Pattern, kein attach.py-Edit).
def _factory(seq_counter, writer):  # noqa: ANN001
    return WartequeueListener(seq_counter, writer)


_factory.__name__ = "WartequeueListener"
register_listener(_factory)
