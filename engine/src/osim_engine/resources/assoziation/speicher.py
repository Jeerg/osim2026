"""PAssozSpeicher — Knoten ↔ PSpeicherProz-Liste.

Provenienz: `OSimPro/PAssozSpeicher.odh` + `OSimPro/PAssozSpeicher.cpp`.

Strukturell anders als `PAssozBeleg`/`PAssozMenge`: ein Knoten hat
**höchstens eine** `PAssozSpeicher` (in `PDlplKnoten.m_lAssozSpeich`,
nicht in `m_lAssozRess`). Diese Assoz verwaltet eine Liste von
`PSpeicherProz`, in die der Knoten seine entstehenden Prozesse ablegt
(statt sie direkt zu starten).

`hole_speicher(proz)` implementiert eine **load-balanced**-Strategie:
nimmt den Speicher mit der geringsten Prozess-Anzahl (PAssozSpeicher.cpp:36-61).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.resources.assoziation.base import PAssoziation

if TYPE_CHECKING:
    from osim_engine.pps.knoten.base import PDlplKnoten
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator
    from osim_engine.pps.trigger import PtTrigger
    from osim_engine.resources.speicher import PSpeicherProz


class PAssozSpeicher(PAssoziation):
    """C++-Äquivalent: `PAssozSpeicher` (`PAssozSpeicher.odh:21`)."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_lKnoten: "PDlplKnoten | None" = None
        self.m_lSpeicher: list["PSpeicherProz"] = []

    # ------------------------------------------------------------------
    # Sim-Methoden — PAssozSpeicher.cpp:21-61
    # ------------------------------------------------------------------

    def platziere_proz(self, proz: "PtProzess") -> None:
        """C++: `PAssozSpeicher::PlatziereProz` (PAssozSpeicher.cpp:21-30).

        HoleSpeicher → ProzEinfuegen. Vor-Bedingung: m_lSpeicher nicht leer.
        """
        psproz = self.hole_speicher(proz)
        assert psproz is not None, (
            f"PAssozSpeicher {self.m_sName!r}: kein Speicher in m_lSpeicher"
        )
        psproz.proz_einfuegen(proz)

    def hole_speicher(self, proz: "PtProzess") -> "PSpeicherProz | None":
        """C++: `PAssozSpeicher::HoleSpeicher` (PAssozSpeicher.cpp:36-61).

        Load-Balanced: nimmt den Speicher mit der MINIMALEN Prozess-Anzahl.
        Bei Gleichstand: letzter passender (C++ `<=` Vergleich → spätere
        Treffer überschreiben frühere).
        """
        del proz  # C++-Default-Implementation ignoriert den Prozess-Arg
        if not self.m_lSpeicher:
            raise IndexError(
                f"PAssozSpeicher {self.m_sName!r}.hole_speicher: m_lSpeicher leer"
            )

        # Initial: Anzahl im Head
        min_count = self.m_lSpeicher[0].get_proz_anzahl()
        min_speicher: "PSpeicherProz | None" = None
        for sp in self.m_lSpeicher:
            count = sp.get_proz_anzahl()
            if count <= min_count:
                min_count = count
                min_speicher = sp
        return min_speicher

    # ------------------------------------------------------------------
    # Zusätzlich — PAssozSpeicher.cpp:65-109
    # ------------------------------------------------------------------

    def is_waiting(
        self, trigger: "PtTrigger", knoten: "PDlplKnoten"
    ) -> bool:
        """C++: `PAssozSpeicher::IsWaiting` (PAssozSpeicher.cpp:65-84).

        Forward an alle Speicher.
        """
        if not self.m_lSpeicher:
            raise IndexError(
                f"PAssozSpeicher {self.m_sName!r}.is_waiting: m_lSpeicher leer"
            )
        for sp in self.m_lSpeicher:
            if sp.is_waiting(trigger, knoten):
                return True
        return False

    def delete_proz(
        self, trigger: "PtTrigger", knoten: "PDlplKnoten"
    ) -> bool:
        """C++: `PAssozSpeicher::DeleteProz` (PAssozSpeicher.cpp:88-109).

        Forward an alle Speicher. Liefert TRUE wenn IRGENDEIN Speicher
        einen Prozess gelöscht hat.
        """
        if not self.m_lSpeicher:
            raise IndexError(
                f"PAssozSpeicher {self.m_sName!r}.delete_proz: m_lSpeicher leer"
            )
        ret = False
        for sp in self.m_lSpeicher:
            if sp.delete_proz(trigger, knoten):
                ret = True
        return ret

    def remove_psim_obj(self, pobj: Any) -> bool:  # noqa: ARG002
        """C++: `PAssozSpeicher::RemovePSimObj` returns FALSE (Stub)."""
        return False

    def is_empty(self) -> bool:
        """C++: `PAssozSpeicher::IsEmpty` (PAssozSpeicher.cpp:120-123)."""
        return len(self.m_lSpeicher) == 0


class PAssozSpeichBestand(PAssozSpeicher):
    """C++-Äquivalent: `PAssozSpeichBestand` (`PAssozSpeicher.odh:139`).

    Subtyp — `platziere_proz` ist in C++ Stub (`throw OException`).
    Wir auch.
    """

    def platziere_proz(self, proz: "PtProzess") -> None:
        """C++: `PAssozSpeichBestand::PlatziereProz` wirft."""
        raise NotImplementedError(
            "PAssozSpeichBestand.platziere_proz ist 1:1 zum C++-Stub nicht "
            "implementiert."
        )
