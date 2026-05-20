"""PDpKnExtern — Knoten für externe Steuerung (C++-Stub).

Provenienz: `OSimPro/PDlplKnoten.odh:485-493` + `OSimPro/PDlplKnoten.cpp:2756-2764`.

**1:1-Befund:** Im C++-Original ist `PDpKnExtern::ProzWeitergeben`
unimplementiert (`throw OException`). Die Klasse ist im DLL-Register
(`DllOSimPro.cpp`) angemeldet, aber kein bestehender Pfad ruft sie auf.

Die Idee dahinter (laut Klassen-Hierarchie + verwandter
`PEntExtern`/`PtProzExtern`-Stubs): Knoten, dessen Bearbeitung von
EXTERN (z. B. UI-Steuerung, externe Sensor-Quelle) angestoßen wird —
nicht via Auslöser-/Plan-Kaskade. Da der Pfad nie implementiert wurde,
ist die genaue Mechanik nicht aus der C++-Quelle ableitbar.

Eine echte Implementation wäre eine Diss-basierte Erweiterung
(Jonsson 2003) und ist NICHT Gegenstand der 1:1-Portierung.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from osim_engine.pps.knoten.base import PDlplKnoten

if TYPE_CHECKING:
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator


class PDpKnExtern(PDlplKnoten):
    """C++-Äquivalent: `PDpKnExtern` (`PDlplKnoten.odh:487`). Stub.

    `proz_weitergeben` ist in C++ `throw OException` → hier
    `NotImplementedError`.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)

    def proz_weitergeben(self, proz_ober: "PtProzess | None", ent: Any) -> None:
        """C++: `PDpKnExtern::ProzWeitergeben` (PDlplKnoten.cpp:2761-2764) —
        wirft OException.
        """
        del proz_ober, ent
        raise NotImplementedError(
            "PDpKnExtern.proz_weitergeben ist im C++-Original ein Stub "
            "(throw OException). Eine echte Implementation extern "
            "gesteuerter Knoten ist nicht Gegenstand der 1:1-Portierung."
        )
