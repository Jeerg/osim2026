"""PtRelation, PtRelationBeleg — transiente Belegungs-Relationen.

Provenienz: `OSimPro/PtRelation.odh` + `OSimPro/PtRelation.cpp`.

Eine `PtRelation` koppelt einen `PtProzess` mit der `PAssozRessource`, die ihn
reserviert hat. Beim `bearbeit_beginnen` / `bearbeit_beenden` des Prozesses
ruft die Relation den Assoz-Ende-Hook, der wiederum die konkrete Ressource
(`PRessBeleg`) informiert.

`PtRelationBeleg` hält zusätzlich die ausgewählte `PRessBeleg`, damit
`PAssozBeleg.on_proz_*` das richtige Element belegt/freigibt.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator
    from osim_engine.resources.assoziation.base import PAssozRessource
    from osim_engine.resources.beleg import PRessBeleg
    from osim_engine.resources.menge import PRessMenge


class PtRelation(PSimObj):
    """C++-Äquivalent: `PtRelation` (`PtRelation.odh`)."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_oAssoz: "PAssozRessource | None" = None
        self.m_oProzess: "PtProzess | None" = None

    # ------------------------------------------------------------------
    # PtRelation.cpp:24-39 — alle drei Methoden delegieren an m_oAssoz
    # ------------------------------------------------------------------

    def on_proz_beginn(self, proz: "PtProzess") -> None:  # noqa: ARG002
        assert self.m_oAssoz is not None
        self.m_oAssoz.on_proz_beginn(self)

    def on_proz_ende(self, proz: "PtProzess") -> None:  # noqa: ARG002
        assert self.m_oAssoz is not None
        self.m_oAssoz.on_proz_ende(self)

    def on_proz_unterbr(self, proz: "PtProzess") -> None:  # noqa: ARG002
        assert self.m_oAssoz is not None
        self.m_oAssoz.on_proz_unterbr(self)


class PtRelationBeleg(PtRelation):
    """C++-Äquivalent: `PtRelationBeleg` (`PtRelation.odh:50`)."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_oRessBeleg: "PRessBeleg | None" = None


class PtRelationMenge(PtRelation):
    """C++-Äquivalent: `PtRelationMenge` (`PtRelation.odh:60`).

    Hält den Rück-Link auf die `PRessMenge`, damit `PAssozMenge*.on_proz_*`
    direkt zubuchen/abbuchen kann ohne erneuten Lookup.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_oRessMenge: "PRessMenge | None" = None
