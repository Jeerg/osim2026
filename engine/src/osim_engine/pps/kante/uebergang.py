"""PDpKaUebergang — Kante mit fester Übergangszeit.

Provenienz: `OSimPro/PDlplKante.odh` Sektion `PDpKaUebergang` (Z. 286-320)
+ `OSimPro/PDlplKante.cpp` Sektion (Z. 766-843).

Spiegelprozess-Pattern (siehe SUPPLEMENT § 4):
    - Bei Nicht-Startkante: Original-Prozess wird gleich gelöscht
        → Spiegelprozess (Klon) anlegen, EvtUebergangEnde planen
    - Bei Startkante: kein Klon nötig, Original-Prozess wird gehalten
    - EvtUebergangEnde feuert nach m_iUebergangszeit:
        - Spiegel aus m_lProzesse entfernen
        - PDlplKante.proz_weitergeben (Basis) routet weiter
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.core.event import OMetaEvent
from osim_engine.pps.kante.base import PDlplKante

if TYPE_CHECKING:
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator


class EvtUebergangEnde(OMetaEvent):
    """$event(3) — Übergangs-Ende-Slot. Sub-Time 3."""
    m_subTime = 3
    m_name = "EvtUebergangEnde"

    def execute(self, obj: "PDpKaUebergang", para: "PtProzess") -> None:
        obj.evt_uebergang_ende(para)


_EVT_UEBERGANG_ENDE = EvtUebergangEnde()


class PDpKaUebergang(PDlplKante):
    """C++-Äquivalent: `PDpKaUebergang` (`PDlplKante.odh`:286).

    Feste Übergangszeit `m_iUebergangszeit`. Spiegelprozess-Pattern erhält
    den Prozess über die Dauer des Übergangs.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_iUebergangszeit: int = 0
        self.m_iKummUebergangszeit: int = 0

    def on_rec_init(self, deep: bool = True) -> None:
        super().on_rec_init(deep=deep)
        self.m_iKummUebergangszeit = 0

    def proz_weitergeben(self, proz: "PtProzess", ent: Any) -> None:
        sim = self.p_simulator

        if not self.is_start_kante():
            spiegel = self._make_spiegel(proz, ent, "PDpKaUebergang")
            target = spiegel
        else:
            target = proz

        sim.evt_insert(
            _EVT_UEBERGANG_ENDE, self,
            sim.evt_curr_time() + self.m_iUebergangszeit,
            para=target,
        )
        self.m_lProzesse.append(target)

        sim.bus.emit("kante.uebergang.start",
                     kante=self.m_sName,
                     proz_id=target.m_sName,
                     ubg_zeit=self.m_iUebergangszeit)

    def evt_uebergang_ende(self, proz: "PtProzess") -> None:
        """Bei Trigger des EvtUebergangEnde-Events."""
        if proz not in self.m_lProzesse:
            raise RuntimeError("EvtUebergangEnde: Prozess nicht in m_lProzesse")
        self.m_lProzesse.remove(proz)
        self.m_iKummUebergangszeit += self.m_iUebergangszeit

        self.p_simulator.bus.emit("kante.uebergang.ende",
                                  kante=self.m_sName,
                                  proz_id=proz.m_sName)

        # An Basis-Routing weitergeben (NICHT rekursiv self.proz_weitergeben!)
        PDlplKante.proz_weitergeben(self, proz, proz.m_oEntitaet)

        # Spiegelprozess freigeben (in Python: GC; aber explizit klar machen)
        if not self.is_start_kante():
            del proz   # Hint für Garbage Collector

    def get_knz_min_dlfz(self, z_klass=None) -> float:
        """Übergangs-Kante: Min-DLZ = m_iUebergangszeit.

        C++ PDlplKante.cpp:834-837.
        """
        return float(self.m_iUebergangszeit)

    def get_knz_sum_zeit(self, z_klass=None) -> float:
        """C++ PDlplKante.cpp:840-843."""
        return float(self.m_iKummUebergangszeit)

    def _make_spiegel(self, proz: "PtProzess", ent: Any, suffix: str) -> "PtProzess":
        """Klont einen Prozess fürs Spiegelprozess-Pattern.

        Wörtlich aus PDlplKante.cpp:782-790. Alle Refs werden übernommen,
        Status und Name werden propagiert.
        """
        cls = type(proz)
        spiegel = cls(self.p_simulator)
        for attr in ("m_eStatus", "m_oAktor", "m_oKnoten",
                     "m_oTrigger", "m_oProzOber", "m_oEntitaet"):
            setattr(spiegel, attr, getattr(proz, attr))
        spiegel.m_sName = f"{proz.m_sName}(Gespiegelt|{suffix})"

        if spiegel.m_oEntitaet is None:
            spiegel.m_oEntitaet = ent
        if spiegel.m_oEntitaet is not ent:
            raise RuntimeError(
                f"PDpKaUebergang Spiegel-Entitäts-Mismatch: "
                f"proz.m_oEntitaet={proz.m_oEntitaet} ent={ent}"
            )
        return spiegel
