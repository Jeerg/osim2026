"""PDpKaVerteilung — Kante mit verteilter Übergangszeit.

Provenienz: `OSimPro/PDlplKante.odh` Sektion `PDpKaVerteilung` (Z. 367-419)
+ `OSimPro/PDlplKante.cpp` Sektion (Z. 925-992).

Wie `PDpKaUebergang`, nur dass die Übergangszeit pro Aufruf aus einer
Verteilung (`m_lVerteil`) gezogen wird statt fest zu sein.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.pps.kante.base import PDlplKante
from osim_engine.pps.kante.uebergang import _EVT_UEBERGANG_ENDE, PDpKaUebergang

if TYPE_CHECKING:
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator


class PDpKaVerteilung(PDpKaUebergang):
    """C++-Äquivalent: `PDpKaVerteilung` (`PDlplKante.odh`:367).

    Erbt das Spiegelprozess-Pattern von PDpKaUebergang, überschreibt nur die
    Übergangszeit-Berechnung.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_iAktVerteilungszeit: int = 0
        self.m_iKummVerteilungszeit: int = 0
        self.m_iAnzUebergaenge: int = 0
        self.m_lVerteil: Any = None  # OVerteilung — von außen gesetzt

    def on_rec_init(self, deep: bool = True) -> None:
        # PDlplKante.on_rec_init (Basis-Counter), nicht PDpKaUebergang's
        PDlplKante.on_rec_init(self, deep=deep)
        self.m_iKummVerteilungszeit = 0
        self.m_iAnzUebergaenge = 0

    def proz_weitergeben(self, proz: "PtProzess", ent: Any) -> None:
        sim = self.p_simulator
        self.m_iAnzUebergaenge += 1

        # Verteilte Zeit ziehen (lazy)
        if not getattr(sim, "pre_compute_kante_verteilung", False):
            assert self.m_lVerteil is not None, "PDpKaVerteilung ohne m_lVerteil"
            self.m_iAktVerteilungszeit = 0
            while self.m_iAktVerteilungszeit <= 0:
                self.m_iAktVerteilungszeit = int(self.m_lVerteil.hole_zufallswert())

        if not self.is_start_kante():
            spiegel = self._make_spiegel(proz, ent, "PDpKaVerteilung")
            target = spiegel
        else:
            target = proz

        sim.evt_insert(
            _EVT_UEBERGANG_ENDE, self,
            sim.evt_curr_time() + self.m_iAktVerteilungszeit,
            para=target,
        )
        self.m_lProzesse.append(target)

        sim.bus.emit("kante.uebergang.start",
                     kante=self.m_sName,
                     proz_id=target.m_sName,
                     ubg_zeit=self.m_iAktVerteilungszeit)

    def evt_uebergang_ende(self, proz: "PtProzess") -> None:
        """Bei Trigger des EvtUebergangEnde-Events. Variant für Verteilungs-Zeit."""
        if proz not in self.m_lProzesse:
            raise RuntimeError("EvtUebergangEnde (Verteilung): Prozess nicht in Liste")
        self.m_lProzesse.remove(proz)
        self.m_iKummVerteilungszeit += self.m_iAktVerteilungszeit

        self.p_simulator.bus.emit("kante.uebergang.ende",
                                  kante=self.m_sName,
                                  proz_id=proz.m_sName)

        # An Basis-Routing weitergeben (PDlplKante.proz_weitergeben, NICHT
        # PDpKaUebergang's überschriebene Version!)
        PDlplKante.proz_weitergeben(self, proz, proz.m_oEntitaet)

        if not self.is_start_kante():
            del proz
