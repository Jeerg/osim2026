"""PSimulator — PPS-Top-Level-Simulator.

Provenienz: `OSimPro/PSimulator.odh` + `OSimPro/PSimulator.cpp`.

Erweitert `OSimulator` um die 12 PPS-Listen (in V1 nur 4 aktiv), den
`PGeneratorStub`, und die OnSimBegin/OnSimReset/OnRecInit-Hooks für
PPS-spezifisches Setup.

V1 — aktive Listen:
    - m_lAusl       list[PAusloeser]
    - m_lDlpl       list[PDurchlaufplan]   (leer — V1 hat keinen Plan)
    - m_oWarteSchl  PProzessDLL            (zentrale Warteschlange)
    - m_lKlassen    list[PKlasse]          (leer)
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.core.simulator import OSimulator
from osim_engine.pps.prozess_dll import PProzessDLL

if TYPE_CHECKING:
    from osim_engine.pps.ausloeser.base import PAusloeser
    from osim_engine.pps.knoten.base import PDlplKnoten
    from osim_engine.resources.beleg import PRessBeleg
    from osim_engine.resources.einsatzzeit import PEinsatzzeit
    from osim_engine.resources.menge import PRessMenge
    from osim_engine.resources.speicher import PSpeicherProz


class PGeneratorStub:
    """Backwards-Kompat-Stub. Seit Slice P5-L durch echte `PGenerator`-Klasse
    ersetzt (siehe `osim_engine.generator.PGenerator`).

    Bleibt als Alias erhalten, damit V1-Spike-Code nicht bricht. Wird in
    `PSimulator.__init__` durch das echte `PGenerator`-Objekt ersetzt
    (siehe unten).
    """

    pass


class PSimulator(OSimulator):
    """C++-Äquivalent: `PSimulator` (`PSimulator.odh`)."""

    def __init__(self) -> None:
        super().__init__()

        # ---- 12 Listen aus PSimulator.odh ----
        # In V1 aktiv:
        self.m_lAusl: list["PAusloeser"] = []
        self.m_lDlpl: list = []                    # PDurchlaufplan — V1 leer
        self.m_oWarteSchl: PProzessDLL = PProzessDLL()
        self.m_lKlassen: list = []                  # PKlasse — V1 leer
        # V4 aktiv (passive Belegungs-Ressourcen):
        self.m_lRessBeleg: list["PRessBeleg"] = []
        # V5 aktiv (Bestands-Ressourcen):
        self.m_lRessMenge: list["PRessMenge"] = []
        # V5.5 aktiv (Prozess-Speicher / Aktor-Warteliste):
        self.m_lSpeichProz: list["PSpeicherProz"] = []
        # V6 aktiv (Einsatzzeiten/Pausen):
        self.m_lEinsatz: list["PEinsatzzeit"] = []
        self.m_lExtVert: list = []
        self.m_lZelSystem: list = []
        self.m_lEntInfo: list = []
        self.m_lEntStrategie: list = []
        self.m_lEntFeld: list = []

        # PGenerator (Slice P5-L: echte Klasse statt Stub)
        from osim_engine.generator import PGenerator
        self.m_oGenerator: Any = PGenerator(self)

        # Konfigurations-Flags
        self.m_bIsEntAktiv: bool = False
        self.m_bPtkWartschl: bool = False
        self.m_bPtkBelegungList: bool = False
        self.m_bPtkAnfragenList: bool = False
        self.m_bTmpConKnotenList: bool = False
        self.m_bTmpUmlFaktorList: bool = False
        self.m_iProduktionBezugsPeriode: int = 86400
        self.m_iProduktionEnde: int = -1
        self.m_bIsProduktionEnde: bool = False

        # Knoten — V1 hält Top-Level-Knoten direkt im Simulator
        # (in V2/V3 sind sie unter PDurchlaufplan einsortiert)
        self.m_lKnoten: list["PDlplKnoten"] = []

    # ------------------------------------------------------------------
    # Children-Verwaltung (Tree-Lifecycle)
    # ------------------------------------------------------------------

    def register_ausloeser(self, ausl: "PAusloeser") -> None:
        """Hängt einen Auslöser in m_lAusl + ins Tree-Lifecycle."""
        self.m_lAusl.append(ausl)
        self._children.append(ausl)

    def register_knoten(self, knoten: "PDlplKnoten") -> None:
        """Hängt einen Knoten direkt in m_lKnoten + ins Tree-Lifecycle.

        V1-Pragma: in V1 hat der Auslöser den Knoten direkt als m_lDlpl.
        V2+: stattdessen register_plan() verwenden — der Plan kapselt seine
        eigenen Knoten via add_knoten() und übernimmt das Lifecycle-
        Forwarding.
        """
        self.m_lKnoten.append(knoten)
        self._children.append(knoten)

    def register_plan(self, plan) -> None:
        """Hängt einen PDurchlaufplan in m_lDlpl + ins Tree-Lifecycle.

        Die inneren Knoten/Kanten des Plans werden NICHT separat im
        Simulator registriert — der Plan-Container leitet on_*-Hooks
        an seine inneren Container weiter.
        """
        self.m_lDlpl.append(plan)
        self._children.append(plan)

    def register_ressource(self, ress: "PRessBeleg") -> None:
        """Hängt eine PRessBeleg in m_lRessBeleg + ins Tree-Lifecycle.

        V4-Pragma: PRessBeleg hat eigene on_sim_begin/on_sim_reset/on_rec_init
        (siehe `resources/beleg.py`). Die Lifecycle-Hooks laufen automatisch
        über `self._children`.

        Assoziationen (PAssozBeleg) werden separat über `register_assoziation`
        am Knoten gehängt — sie sind nicht direkt Simulator-Children.
        """
        self.m_lRessBeleg.append(ress)
        self._children.append(ress)

    def register_ress_menge(self, ress: "PRessMenge") -> None:
        """Hängt eine PRessMenge in m_lRessMenge + ins Tree-Lifecycle.

        V5-Pragma: PRessMenge.on_sim_begin setzt Bestand auf Anfangsbestand,
        on_rec_init nullt die Protokoll-Counter. Forwarding über
        `self._children`.
        """
        self.m_lRessMenge.append(ress)
        self._children.append(ress)

    def register_einsatzzeit(self, einsatz: "PEinsatzzeit") -> None:
        """Hängt eine PEinsatzzeit in m_lEinsatz + ins Tree-Lifecycle.

        V6-Pragma: PEinsatzzeit.on_period_begin ruft `insert_events`, das
        die EvtPause-Events für die kommende Periode in den Pool legt.
        Die `attach_ressource()`-Beziehung muss bereits aufgebaut sein,
        bevor sim.start() läuft.
        """
        self.m_lEinsatz.append(einsatz)
        self._children.append(einsatz)

    def register_speicher_proz(self, speicher: "PSpeicherProz") -> None:
        """Hängt einen PSpeicherProz in m_lSpeichProz + ins Tree-Lifecycle.

        V5.5-Pragma: PSpeicherProz.on_sim_begin leert m_lProzesse
        (PSpeicherProz.odh:74-83). Lifecycle-Forwarding über
        `self._children`. Die Aktor-Schiene (PRessBeleg in
        `speicher.m_lRessourcen`) wird in Phase 3 aktiv.
        """
        self.m_lSpeichProz.append(speicher)
        self._children.append(speicher)

    # ------------------------------------------------------------------
    # Lifecycle-Hooks
    # ------------------------------------------------------------------

    def on_sim_begin(self, sim: "OSimulator | None" = None, deep: bool = True) -> None:
        """PSimulator.cpp `OnSimBegin`: leert Warteschlange + Standard-Logik."""
        # Warteschlange leeren (C++: m_oWarteSchl->RemoveAll)
        self.m_oWarteSchl.clear()
        # Basis-Logik (Children-Notifikation, LCG-Keim umschalten)
        super().on_sim_begin(self if sim is None else sim, deep=deep)

    def on_sim_reset(self, deep: bool = True) -> None:
        self.m_oWarteSchl.clear()
        super().on_sim_reset(deep=deep)

    def on_rec_init(self, deep: bool = True) -> None:
        """PSimulator.cpp `OnRecInit`: Protokoll-Counter zurücksetzen.

        Im C++ werden hier die KPI-Listen für Wartschlangen-/Belegungs-/
        Anfragen-Protokollierung initialisiert. In V1 nur Children-Propagation.
        """
        super().on_rec_init(deep=deep)
