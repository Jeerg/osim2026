"""PAssozRessEnt + PAssozELogikEnt — Entscheider-aware Assoz-Subtypen.

Provenienz: `OSimPro/PAssozRessEnt.{odh,cpp}` (147 + 419 Zeilen). Slice P5-G.

Beide Klassen erben von `PAssozBeleg` (anders als `EPAszEntFeld`, das
direkt von `PAssozRessource` erbt). Der wesentliche Unterschied zur Basis:
in `RessVerfuegbar` wird zuerst geprüft, ob eine `PEntscheider`-Instanz
in `m_lRessourcen` liegt — falls ja, ruft `entscheider.EntscheidePER`
und nutzt das Ergebnis statt der ersten verfügbaren Ressource.

In Slice P5-G ist `PEntscheider` selbst noch nicht portiert; die
Klassen funktionieren als reine PAssozBeleg-Subtypen mit identischem
Sim-Verhalten (Fallback-Pfad).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.resources.assoziation.beleg import PAssozBeleg
from osim_engine.resources.relation import PtRelationBeleg

if TYPE_CHECKING:
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator
    from osim_engine.resources.relation import PtRelation


class PAssozRessEnt(PAssozBeleg):
    """C++-Äquivalent: `PAssozRessEnt : $public PAssozBeleg`
    (`PAssozRessEnt.odh:25-50`, `.cpp:21-111`).

    Wie PAssozBeleg, aber mit Entscheider-Vorrangs-Pfad in `ress_verfuegbar`.
    """

    def ress_verfuegbar(self, proz: "PtProzess") -> bool:
        """C++: `PAssozRessEnt::RessVerfuegbar` (cpp:21-76).

        1. Iteriere m_lRessourcen, finde ein `PEntscheider`-Objekt.
        2. Wenn gefunden: rufe `entscheider.entscheide_per(m_lRessourcen, proz, m_lKnoten)`
           und nutze das Ergebnis als ausgewählte Belegungs-Ressource.
        3. Sonst Fallback: erste verfügbare Ressource (= PAssozBeleg-Verhalten).
        """
        entscheider = None
        for resbel in self.m_lRessourcen:
            # PEntscheider ist in P5-G noch nicht portiert. Wir verwenden
            # duck-typing: Klassen mit `entscheide_per`-Methode gelten als
            # Entscheider.
            if hasattr(resbel, "entscheide_per"):
                entscheider = resbel
                break

        if entscheider is not None:
            o_ress_beleg = entscheider.entscheide_per(
                self.m_lRessourcen, proz, self.m_lKnoten
            )
            if o_ress_beleg is None:
                return False
            if o_ress_beleg.ress_verfuegbar(proz):
                rel = PtRelationBeleg(self.p_simulator)
                rel.m_oAssoz = self
                rel.m_oProzess = proz
                rel.m_oRessBeleg = o_ress_beleg
                proz.m_oRelationen.append(rel)
                return True
            return False

        # Fallback: kein Entscheider → wie PAssozBeleg
        return super().ress_verfuegbar(proz)

    def on_proz_unterbr(self, rel: "PtRelation") -> None:
        """C++: cpp:98-101 — wirft OException."""
        raise NotImplementedError(
            "PAssozRessEnt.on_proz_unterbr — C++ wirft OException (cpp:100)"
        )

    def get_proz_kost(self, k_klass: Any = None) -> float:
        """C++: cpp:107-111 — wirft OException."""
        raise NotImplementedError(
            "PAssozRessEnt.get_proz_kost — C++ wirft OException (cpp:109)"
        )


class PAssozELogikEnt(PAssozBeleg):
    """C++-Äquivalent: `PAssozELogikEnt : $public PAssozBeleg`
    (`PAssozRessEnt.odh:90-115`, `.cpp:232-...`).

    Strukturell identisch zu PAssozRessEnt; die Unterschiede liegen in
    der Verbindung zu PDpKnAlternativELogik-Knoten (siehe P5-H).
    """

    def ress_verfuegbar(self, proz: "PtProzess") -> bool:
        """C++: `PAssozELogikEnt::RessVerfuegbar` (cpp:232-...).

        Identisch zum PAssozRessEnt-Pfad: Entscheider-Vorrang + Fallback.
        """
        entscheider = None
        for resbel in self.m_lRessourcen:
            if hasattr(resbel, "entscheide_per"):
                entscheider = resbel
                break

        if entscheider is not None:
            o_ress_beleg = entscheider.entscheide_per(
                self.m_lRessourcen, proz, self.m_lKnoten
            )
            if o_ress_beleg is None:
                return False
            if o_ress_beleg.ress_verfuegbar(proz):
                rel = PtRelationBeleg(self.p_simulator)
                rel.m_oAssoz = self
                rel.m_oProzess = proz
                rel.m_oRessBeleg = o_ress_beleg
                proz.m_oRelationen.append(rel)
                return True
            return False

        return super().ress_verfuegbar(proz)

    def on_proz_unterbr(self, rel: "PtRelation") -> None:
        """C++: wirft OException."""
        raise NotImplementedError(
            "PAssozELogikEnt.on_proz_unterbr — C++ wirft OException"
        )

    def get_proz_kost(self, k_klass: Any = None) -> float:
        """C++: wirft OException."""
        raise NotImplementedError(
            "PAssozELogikEnt.get_proz_kost — C++ wirft OException"
        )
