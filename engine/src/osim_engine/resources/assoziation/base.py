"""PAssoziation + PAssozRessource — Basen der Knoten↔Ressource-Verbindungen.

Provenienz: `OSimPro/PAssoziation.odh` + `OSimPro/PAssozRessource.{odh,cpp}`.

`PAssoziation` ist nur Namens-Träger (siehe `PAssoziation.cpp` — fast leer).

`PAssozRessource` ist abstrakt: jede Assoziation gehört einem `PDlplKnoten`
an und stellt `ress_verfuegbar(proz)` und die `on_proz_*`-Hooks bereit. Default-
Impl wirft (analog C++ `throw new OException;`) — Subklassen wie `PAssozBeleg`
liefern die echte Logik.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.knoten.base import PDlplKnoten
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator
    from osim_engine.resources.relation import PtRelation


class PAssoziation(PSimObj):
    """C++-Äquivalent: `PAssoziation` (`PAssoziation.odh`)."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        # m_sName wird in PSimObj initialisiert.


class PAssozRessource(PAssoziation):
    """C++-Äquivalent: `PAssozRessource` (`PAssozRessource.odh:26`). Abstract."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_lKnoten: "PDlplKnoten | None" = None
        self.m_lOberAssoz: "PAssozRessource | None" = None
        self.m_lUnterAssoz: list["PAssozRessource"] = []

    # ------------------------------------------------------------------
    # Sim-Methoden — Default: throw / Auswertungs-Defaults aus
    # PAssozRessource.cpp:24-57
    # ------------------------------------------------------------------

    def ress_verfuegbar(self, proz: "PtProzess") -> bool:  # noqa: ARG002
        raise NotImplementedError(
            "PAssozRessource.ress_verfuegbar muss von Subklasse implementiert werden"
        )

    def ress_anwesend(self, proz: "PtProzess") -> bool:  # noqa: ARG002
        return True

    def on_proz_beginn(self, rel: "PtRelation") -> None: ...
    def on_proz_ende(self, rel: "PtRelation") -> None: ...
    def on_proz_unterbr(self, rel: "PtRelation") -> None: ...

    # ------------------------------------------------------------------
    # Auswertungs-Defaults (C++ Cpp:65-99, V4 leer)
    # ------------------------------------------------------------------

    def get_ein_rsc_kosten(self, k_klass: Any = None) -> float:  # noqa: ARG002
        return 0.0

    def get_ein_min_rsc_kosten(self, k_klass: Any = None) -> float:  # noqa: ARG002
        return 0.0

    def get_belegungszeit(self) -> float:
        return 0.0

    def on_prz_kosten_berechnet(self) -> None: ...

    # ------------------------------------------------------------------
    # Listen-Helfer (PAssozRessource.odh:47-49) — Defaults
    # ------------------------------------------------------------------

    def is_in_list(self, pobj: Any) -> bool:  # noqa: ARG002
        return False

    def remove_psim_obj(self, pobj: Any) -> bool:  # noqa: ARG002
        return False

    def is_empty(self) -> bool:
        return True
