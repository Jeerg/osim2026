"""Listener-Basisklassen für OSimulator.

Provenienz: `OSimBase/OSimObj.odh` (OListener) + `OSimBase/OSimulator.odh`
(OListenerSimulator) + `OSimBase/OSimulator.cpp` (Send*-Methoden).

Python-Mapping siehe `docs/CONTEXT-P1-SUPPLEMENT.md` § 6.1:
    - intrusive linked-list → `list[Listener]` am beobachteten Objekt
    - Attach insert-at-head; Notifikation in dieser Reihenfolge
    - Snapshot-Iteration via `list(listeners)` damit Self-Detach bricht nichts

In V1 sind Listener primär ein Erweiterungs-Mechanismus für die Observability
(EventBus-Bridge); innerhalb der Sim-Engine wird der Tree-Lifecycle (siehe
`Simulator.on_sim_begin`/`on_period_begin`) per direkter Methodenkette
realisiert, nicht via Listener.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from osim_engine.core.simulator import OSimulator


class OListener:
    """Basisklasse für Listener — leer, dient nur als Marker-Typ."""

    pass


class OListenerSimulator(OListener):
    """Listener für `OSimulator`-Lifecycle-Events.

    C++-Original: `class OListenerSimulator : public OListener`
    (`OSimulator.odh` Z. ~200). Override eine oder mehrere `on_*`-Methoden.
    """

    def __init__(self) -> None:
        self.m_sim: "OSimulator | None" = None

    def attach(self, sim: "OSimulator") -> None:
        """Hängt diesen Listener in `sim._sim_listeners` ein (insert-at-head)."""
        assert self.m_sim is None, "Listener bereits an einen Simulator gebunden"
        sim._sim_listeners.insert(0, self)
        self.m_sim = sim

    def detach(self) -> None:
        if self.m_sim is None:
            return
        try:
            self.m_sim._sim_listeners.remove(self)
        except ValueError:
            pass
        self.m_sim = None

    # ---- Override-Points (Default: no-op) -----------------------------
    def on_sim_begin(self, time_begin: int) -> None: ...
    def on_period_begin(self, time_begin: int, time_end: int) -> None: ...
    def on_period_end(self, time_end: int) -> None: ...
    def on_period_break(self, time_end: int) -> None: ...
    def on_period_reset(self) -> None: ...
    def on_sim_ereig(self) -> None: ...
