"""PtProzDurchlaufplan — Wurzel-Prozess eines Plan-Laufs.

Provenienz: `OSimPro/PtProzess.odh` Sektion `PtProzDurchlaufplan` (Z. 237-256)
+ `OSimPro/PtProzess.cpp` (Z. 670-757).

Der Plan-Prozess ist der `m_oProzOber` für alle Knoten-Prozesse innerhalb eines
Plan-Laufs. Hält die Liste der aktiven PtVerknuepfung-Objekte (Join-Counter
an Kanten mit >1 Vorgängern).

Wird vom PDurchlaufplan.dlpl_ausloesen erzeugt.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.pps.prozess.base import PtProzess

if TYPE_CHECKING:
    from osim_engine.pps.kante.base import PDlplKante
    from osim_engine.pps.simulator import PSimulator
    from osim_engine.pps.verknuepfung import PtVerknuepfung


class PtProzDurchlaufplan(PtProzess):
    """C++-Äquivalent: `PtProzDurchlaufplan` (`PtProzess.odh`:237)."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_oVerknuepfungen: list["PtVerknuepfung"] = []

    def bearbeit_beginnen(self) -> None:
        """C++: ruft nur PtProzess::BearbeitBeginnen (PtProzess.cpp:679)."""
        super().bearbeit_beginnen()

    def bearbeit_beenden(self) -> None:
        """C++: prüft dass keine Unterprozesse mehr existieren, ruft Basis,
        dann Prozess zerstören.

        In Python entfällt das aktive `Delete()` (GC), aber die Konsistenz-
        prüfung (PtProzess.cpp:686-702 `SucheUnterprozesseInPList()>1`)
        wird in V3.1 nachgereicht — silent-Fehlverhalten in Phase 2+
        bei Ressourcen-Konflikten wäre sonst schwer zu debuggen
        (SELF-REVIEW-CODE.md M1).
        """
        anz_subs = self._suche_unterprozesse_in_p_list()
        if anz_subs > 1:
            raise RuntimeError(
                f"PtProzDurchlaufplan {self.m_sName!r} hat noch {anz_subs} "
                f"Unter-Prozesse beim bearbeit_beenden — Plan ist inkonsistent. "
                f"Knoten-Listen: "
                + ", ".join(
                    f"{kn.m_sName}({len(kn.m_lProzesse)})"
                    for kn in self.p_simulator.m_lKnoten
                    if kn.m_lProzesse
                )
            )
        super().bearbeit_beenden()

    def _suche_unterprozesse_in_p_list(self) -> int:
        """Zählt Unter-Prozesse dieses Plans in allen Knoten/Kanten/Warteschlangen.

        C++-Äquivalent: PtProzess::SucheUnterprozesseInPList — durchsucht
        alle Prozess-Listen des Simulators und zählt jene, deren
        m_oProzOber-Kette auf `self` führt.
        """
        count = 0
        sim = self.p_simulator

        def _is_descendant(proz: "PtProzess") -> bool:
            cur: "PtProzess | None" = proz
            while cur is not None:
                if cur is self:
                    return True
                cur = cur.m_oProzOber  # type: ignore[assignment]
            return False

        # Knoten-Listen durchsuchen (Top-Level und in Plänen)
        from osim_engine.pps.durchlaufplan import PDurchlaufplan
        all_knoten: list = []
        all_kanten: list = []
        for kn in sim.m_lKnoten:
            all_knoten.append(kn)
        for plan in sim.m_lDlpl:
            if isinstance(plan, PDurchlaufplan):
                all_knoten.extend(plan.m_lKnoten)
                all_kanten.extend(plan.m_lKanten)

        for kn in all_knoten:
            for p in kn.m_lProzesse:
                if _is_descendant(p):
                    count += 1
        for ka in all_kanten:
            for p in ka.m_lProzesse:
                if _is_descendant(p):
                    count += 1
        # Auch self in seiner eigenen m_lProzesse-Liste am Plan-Container
        # zählt als Unter-Prozess (analog zu C++)
        # → die Plan-Container haben self als einzigen "Prozess" in
        # PDurchlaufplan.m_lProzesse während des Laufs. Das ist der
        # Wurzel-Prozess selbst, kein Unter-Prozess.

        return count

    def on_unter_proz_beginn(self, proz: "PtProzess") -> None:
        """C++: leerer Hook (PtProzess.cpp:710)."""
        pass

    def on_unter_proz_ende(self, proz: "PtProzess") -> None:
        """C++: leerer Hook (PtProzess.cpp:715)."""
        pass

    # ------------------------------------------------------------------
    # Verknüpfungs-Verwaltung (PtProzess.cpp:724-756)
    # ------------------------------------------------------------------

    def find_verknpf(self, kante: "PDlplKante") -> "PtVerknuepfung | None":
        for v in self.m_oVerknuepfungen:
            if v.m_oKante is kante:
                return v
        return None

    def remove_verknpf(self, verknpf: "PtVerknuepfung") -> None:
        try:
            self.m_oVerknuepfungen.remove(verknpf)
        except ValueError:
            raise RuntimeError("PtVerknuepfung nicht in Liste")

    def add_verknpf(self, verknpf: "PtVerknuepfung") -> None:
        self.m_oVerknuepfungen.append(verknpf)
