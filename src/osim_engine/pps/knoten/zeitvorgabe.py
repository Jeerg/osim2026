"""PDpKnZeitvorgabe-Familie — Knoten mit Durchführungszeit-Vorgabe.

Provenienz: `OSimPro/PDpKnZeitvorgabe.odh` + `OSimPro/PDpKnZeitvorgabe.cpp`.
Siehe `docs/CONTEXT-P1-SUPPLEMENT.md` § 1 für die volle Sektion.

V1 implementiert PDpKnZeitvorgabe (abstract) + PDpKnKonstant.
PDpKnVerteilung folgt in V2.
"""

from __future__ import annotations

from abc import abstractmethod
from typing import TYPE_CHECKING, Any

from osim_engine.pps.knoten.base import PDlplKnoten

if TYPE_CHECKING:
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator


class PDpKnZeitvorgabe(PDlplKnoten):
    """Abstract: PDlplKnoten mit Durchführungszeit-Vorgabe.

    C++-Äquivalent: `class PDpKnZeitvorgabe : public PDlplKnoten`
    (PDpKnZeitvorgabe.odh:19).
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_iZeitRedBeiProzEnde: int = 0
        self.m_fZeitstressparameter: float = 0.0
        self.m_iErmuedungsparameter: int = 0
        self.m_iPtkKumDurchfuehrungszeit: int = 0
        self.m_iPtkDurchfuehrungszeitCount: int = 0
        self.m_lKlassZeit: Any = None  # PKlasseZeit (P4)

    @abstractmethod
    def get_durchfuehrungszeit(self, proz: "PtProzess") -> int:
        """Pure virtual. C++: `int GetDurchfuehrungszeit(oprPtProzess) = 0`."""
        ...

    def on_rec_init(self, deep: bool = True) -> None:
        super().on_rec_init(deep=deep)
        self.m_iPtkKumDurchfuehrungszeit = 0
        self.m_iPtkDurchfuehrungszeitCount = 0

    def proz_weitergeben(self, proz_ober: "PtProzess | None", ent: Any) -> None:
        """Instanziiert PtProzZeitvorgabe und führt es durch BearbeitBeginnen.

        Wörtlich aus PDpKnZeitvorgabe.cpp:31-69 (siehe SUPPLEMENT § 1.2),
        ohne den P3-Pfad für m_lAssozSpeich.
        """
        from osim_engine.pps.prozess.zeitvorgabe import PtProzZeitvorgabe

        proz = PtProzZeitvorgabe(self.p_simulator)
        proz.m_oKnoten = self
        proz.m_oTrigger = proz_ober.m_oTrigger if proz_ober is not None else None
        proz.m_oProzOber = proz_ober
        proz.m_oEntitaet = ent

        ober_name = proz_ober.m_sName if proz_ober is not None else "<root>"
        proz.m_sName = f"{ober_name}|{self.m_sName}"
        proz.m_iErzeugungzeitpunkt = self.p_simulator.evt_curr_time()

        self.m_iPtkProzessCount += 1

        # Trigger notifizieren
        if proz.m_oTrigger is not None:
            proz.m_oTrigger.on_prz_created(proz)

        # P3-Pfad (m_lAssozSpeich) entfällt in V1 — direkt in Knoten-Liste
        self.add_prozess(proz)

        # EventBus
        self.p_simulator.bus.emit("proz.create",
                                  proz_id=proz.m_sName,
                                  knoten=self.m_sName,
                                  trigger_id=(proz.m_oTrigger.m_sName
                                              if proz.m_oTrigger else None))

        if not self.bearbeit_beginnen(proz):
            # Fehlschlag → in zentrale Warteschlange (V1 noch trivial, in V2
            # wird das per Re-Try beim nächsten Ressourcen-Freigabe-Event aktiv)
            self.p_simulator.m_oWarteSchl.add_tail(proz)


class PDpKnKonstant(PDpKnZeitvorgabe):
    """Konstante Durchführungszeit. C++: `PDpKnKonstant` (PDpKnZeitvorgabe.odh:97).

    Wörtlich aus PDpKnZeitvorgabe.cpp:172-187.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_iDurchfuehrungszeit: int = 0

    def get_durchfuehrungszeit(self, proz: "PtProzess") -> int:
        sim = self.p_simulator
        if sim.m_bIsProduktionEnde and self.m_iZeitRedBeiProzEnde > 0:
            red_wert = 1 - self.m_iZeitRedBeiProzEnde / 100
            return int(self.m_iDurchfuehrungszeit * red_wert)
        self.m_iPtkKumDurchfuehrungszeit += self.m_iDurchfuehrungszeit
        self.m_iPtkDurchfuehrungszeitCount += 1
        return self.m_iDurchfuehrungszeit
