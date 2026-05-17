"""PDlplKante — Kante zwischen Knoten im Plan-Graphen.

Provenienz: `OSimPro/PDlplKante.odh` + `OSimPro/PDlplKante.cpp`.
Siehe `docs/CONTEXT-P1-pps-knoten.md` Sektion "PDlplKante".

Kante = Verbindung zwischen Vorgänger-Knoten und Nachfolger-Knoten.
Die zentrale Methode ist `proz_weitergeben(proz, ent)`, die je nach
Start-/End-/Innen-Kante und Join-Counter-Status den Prozess routet.

Routing-Logik (PDlplKante.cpp:115-185):
    1. Counter inkrementieren
    2. Listener notifizieren
    3. IF IsStartKante:
        - IF IsEndKante: Kurzschluss → m_lNachfolger.head.on_dlpl_beendet
        - ELSE: an alle Nachfolger-Knoten weitergeben
    4. ELSE:
        - Wenn m_lVorgaenger > 1: PtVerknuepfung-Join-Counter prüfen
            - Falls noch nicht erfüllt: return
            - Falls erfüllt: Verknüpfung entfernen, weiter
        - IF IsEndKante: m_lNachfolger.head.on_dlpl_beendet(proz_ober, ent)
        - ELSE: an alle Nachfolger-Knoten weitergeben (proz_ober statt proz!)
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.knoten.base import PDlplKnoten
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator
    from osim_engine.pps.verknuepfung import PtVerknuepfung


class KanteListener:
    """Listener für PDlplKante-Notifikationen.

    Python-Mapping von `PListenerDlplKante` (SUPPLEMENT § 6.1).
    Override `on_proz_weitergeben` für UI-/Observability-Hooks.
    """

    def __init__(self) -> None:
        self.m_oKante: "PDlplKante | None" = None

    def attach(self, kante: "PDlplKante") -> None:
        assert self.m_oKante is None
        kante._listeners.insert(0, self)
        self.m_oKante = kante

    def detach(self) -> None:
        if self.m_oKante is None:
            return
        try:
            self.m_oKante._listeners.remove(self)
        except ValueError:
            pass
        self.m_oKante = None

    def on_proz_weitergeben(self, proz: "PtProzess") -> None: ...


class PDlplKante(PSimObj):
    """C++-Äquivalent: `PDlplKante` (`PDlplKante.odh:24`)."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_lVorgaenger: list["PDlplKnoten"] = []
        self.m_lNachfolger: list["PDlplKnoten"] = []
        self.m_lKnotenOber: "PDlplKnoten | None" = None
        self.m_lVerknpfng: list["PtVerknuepfung"] = []
        self.m_lProzesse: list["PtProzess"] = []

        # Protokoll-Counter
        self.m_iPtkUebergangCount: int = 0

        # Transiente Hilfs-Attribute (für KPI-Berechnungen in V3+)
        self.m_iHelp: int = 0
        self.m_dHelp: float = 0.0
        self.m_iMinHelp: int = 0
        self.m_dMinHelp: float = 0.0

        self._listeners: list[KanteListener] = []

    def on_rec_init(self, deep: bool = True) -> None:
        self.m_iPtkUebergangCount = 0

    # ------------------------------------------------------------------
    # KPI-Methoden (V3)
    # ------------------------------------------------------------------

    def get_knz_min_dlfz(self, z_klass: Any = None) -> float:
        """Minimale Durchlaufzeit der Kante. Basis: 0 (keine Übergangs-Zeit).

        Subklassen wie PDpKaUebergang/PDpKaVerteilung überschreiben.
        """
        return 0.0

    def get_knz_sum_zeit(self, z_klass: Any = None) -> float:
        return 0.0

    # ------------------------------------------------------------------
    # Start-/End-Kante (PDlplKante.cpp:93-108)
    # ------------------------------------------------------------------

    def is_start_kante(self) -> bool:
        """Startkante: Vorgänger ist der Plan selbst (m_lKnotenOber)."""
        if not self.m_lVorgaenger:
            return False
        return self.m_lVorgaenger[0] is self.m_lKnotenOber

    def is_end_kante(self) -> bool:
        """Endkante: Nachfolger ist der Plan selbst."""
        if not self.m_lNachfolger:
            return False
        return self.m_lNachfolger[0] is self.m_lKnotenOber

    # ------------------------------------------------------------------
    # Routing — PDlplKante.cpp:115-185
    # ------------------------------------------------------------------

    def proz_weitergeben(self, proz: "PtProzess", ent: Any) -> None:
        from osim_engine.pps.verknuepfung import PtVerknuepfung
        # Lokal-Import vermeidet Zirkularität: PDurchlaufplan importiert PDlplKante
        from osim_engine.pps.durchlaufplan import PDurchlaufplan

        self.m_iPtkUebergangCount += 1

        # Listener notifizieren
        for listener in list(self._listeners):
            listener.on_proz_weitergeben(proz)

        # EventBus
        self.p_simulator.bus.emit("kante.weitergeben",
                                  kante=self.m_sName,
                                  proz_id=proz.m_sName)

        if self.is_start_kante():
            if self.is_end_kante():
                # Kurzschluss: Plan ohne Knoten
                head_plan = self.m_lNachfolger[0]
                assert isinstance(head_plan, PDurchlaufplan)
                head_plan.on_dlpl_beendet(proz, ent)
            else:
                # an alle Nachfolger-Knoten weitergeben
                for kn in self.m_lNachfolger:
                    kn.proz_weitergeben(proz, ent)
        else:
            # Join-Counter (wenn mehrere Vorgänger)
            if len(self.m_lVorgaenger) > 1:
                proz_ober = proz.m_oProzOber
                assert proz_ober is not None
                verknpf = proz_ober.find_verknpf(self)  # type: ignore[attr-defined]

                if verknpf is not None:
                    # existiert bereits → dekrementieren
                    erfuellt = verknpf.proz_weitergeben(proz)
                    if not erfuellt:
                        return
                    proz_ober.remove_verknpf(verknpf)  # type: ignore[attr-defined]
                else:
                    # noch keine Verknüpfung → neu anlegen mit count-1
                    verknpf = PtVerknuepfung(self.p_simulator)
                    verknpf.m_oKante = self
                    verknpf.m_iAnzProz = len(self.m_lVorgaenger) - 1
                    proz_ober.add_verknpf(verknpf)  # type: ignore[attr-defined]
                    return

            if self.is_end_kante():
                # Plan-Ende: an PDurchlaufplan.on_dlpl_beendet weitergeben
                head_plan = self.m_lNachfolger[0]
                assert isinstance(head_plan, PDurchlaufplan)
                head_plan.on_dlpl_beendet(proz.m_oProzOber, ent)
            else:
                # weiter an alle Nachfolger — **mit proz_ober** statt proz!
                for kn in self.m_lNachfolger:
                    kn.proz_weitergeben(proz.m_oProzOber, ent)
