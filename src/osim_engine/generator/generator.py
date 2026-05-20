"""PGenerator + Helper — Slice P5-L.

Provenienz: `OSimPro/PSimulator.odh:175-700`.

Modellgenerator: liest .psg-Datei, manipuliert Sim-Modell, startet Läufe.
Slice P5-L liefert die Klassen-Struktur + Stub-Methoden. Datei-I/O-Pfad
(WriteGeneratorFile, InterpretPSimGeneratorFile) als Skelette.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import IntEnum
from typing import TYPE_CHECKING, Any

from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.simulator import PSimulator


class PGenStatus(IntEnum):
    """C++ $enum aus PSimulator.odh:446-452."""
    GS_BEGIN = 1
    GS_RUNNING = 2
    GS_SUSPENDED = 3
    GS_GENERATE_PSG_FILE = 4


@dataclass
class PProp:
    """C++: PSimulator.odh:184-190 — Property-Pair (name, value)."""
    m_name: str = ""
    m_value: str = ""


@dataclass
class PGenObj:
    """C++: PSimulator.odh:192-214 — Generator-Objekt mit Property-Liste."""
    m_ClassName: str = ""
    m_ObjName: str = "NO_NAME"
    m_index: int = -1
    m_PropertyList: list[PProp] = field(default_factory=list)


@dataclass
class PGenLauf:
    """C++: PSimulator.odh:216-234 — ein Simulationslauf."""
    laufnum: int = -1
    m_GenObjList: list[PGenObj] = field(default_factory=list)


@dataclass
class PGenKnz:
    """C++: PSimulator.odh:236-248 — Kennzahl-Definition."""
    m_ClassName: str = ""
    m_ClassID: int = -1
    m_KnzName: str = ""


@dataclass
class PGenInitInfo:
    """C++: PSimulator.odh:254-262."""
    m_iStdKernzeitBeg: int = 0
    m_iStdKernzeitEnd: int = 0
    m_iParallelRessZuschalten: int = 0


@dataclass
class PGenAZIntervall:
    """C++: PSimulator.odh:266-271."""
    m_iBeginn: int = 0
    m_iEnd: int = 0


@dataclass
class PGenAZTag:
    """C++: PSimulator.odh:272-318."""
    m_iTag: int = -1
    m_iTagBegin: int = -1
    m_iTagEnd: int = -1
    m_isBlocked: bool = False
    m_KernzeitBeg: int = -1
    m_KernzeitEnd: int = -1
    m_lIntervalle: list[PGenAZIntervall] = field(default_factory=list)

    def is_blocked(self) -> bool:
        return self.m_isBlocked

    def block(self) -> None:
        self.m_isBlocked = True

    def un_block(self) -> None:
        self.m_isBlocked = False


@dataclass
class PGenAZRscBeleg:
    """C++: PSimulator.odh:320-341."""
    m_oBeleg: Any = None
    m_lTage: list[PGenAZTag] = field(default_factory=list)


@dataclass
class PGenZeitinfo:
    """C++: PSimulator.odh:343-347."""
    beg: int = 0
    end: int = 0
    dauer: int = 0


class PGenTmpAZModell:
    """C++: PSimulator.odh:350-440 — Temporäres Arbeitszeit-Modell."""

    def __init__(self) -> None:
        self.m_oGen: Any = None
        self.m_lAZMList: list[PGenAZRscBeleg] = []
        self.m_aZInfo: list[PGenZeitinfo] = []

    def get_az_tag(self, beleg: Any, tag: int) -> PGenAZTag | None:
        """C++: GetAZTag — Skelett."""
        for rsc in self.m_lAZMList:
            if rsc.m_oBeleg is beleg:
                for t in rsc.m_lTage:
                    if t.m_iTag == tag:
                        return t
        return None

    def get_beg_of_az_tag(self, beleg: Any, tag: int) -> int:
        t = self.get_az_tag(beleg, tag)
        return t.m_iTagBegin if t is not None else -1

    def get_end_of_az_tag(self, beleg: Any, tag: int) -> int:
        t = self.get_az_tag(beleg, tag)
        return t.m_iTagEnd if t is not None else -1

    def block_tag(self, beleg: Any, tag: int) -> None:
        t = self.get_az_tag(beleg, tag)
        if t is not None:
            t.block()

    def un_block_tag(self, beleg: Any, tag: int) -> None:
        t = self.get_az_tag(beleg, tag)
        if t is not None:
            t.un_block()

    def count_breaks(self, beleg: Any, tag: int, amount: bool = True) -> int:
        """C++: CountBreaks — Skelett."""
        return 0

    def get_pause_zeit(self, beleg: Any, tag: int, von: int, bis: int) -> int:
        """C++: GetPauseZeit — Skelett."""
        return 0

    def expand_at_begin(self, beleg: Any, tag: int, simzeit: int) -> bool:
        return False

    def expand_at_end(self, beleg: Any, tag: int, simzeit: int) -> bool:
        return False


class PGenerator(PSimObj):
    """C++: `PGenerator : $public PSimObj` (PSimulator.odh:454-700).

    Modellgenerator. P5-L: Klassen-Struktur + Attribute. Datei-I/O als
    Skelette — die volle Implementierung (WriteGeneratorFile,
    InterpretPSimGeneratorFile, Engpass-Erkennung) ist eigene Spezial-Slice.
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        # Helper-Listen (protected in C++)
        self.m_LaufList: list[PGenLauf] = []
        self.m_ChangedList: list[PGenObj] = []
        self.m_KnzList: list[PGenKnz] = []
        # AZ-Modell-Attribute
        self.m_pPGenInitInfo: PGenInitInfo | None = None
        self.m_AktTmpAZModell: PGenTmpAZModell = PGenTmpAZModell()
        self.m_OldTmpAZList: list[PGenTmpAZModell] = []
        # Public-Attribute
        self.m_ExportClassName: str = ""
        self.m_ExportClassID: int = 0
        self.m_PSimGenFileName: str = ""
        self.m_PSimEvalFileName: str = ""
        self.m_PSimEvalNormalModelFileName: str = ""
        self.m_AnzahlPerioden: int = 1
        self.m_WriteOnlySelectedKnz: bool = False
        self.m_status: int = 0
        self.m_stepwidth: int = 0
        self.m_bGenArbeitsUndBetriebszeiten: bool = False
        self.m_genStatus: int = PGenStatus.GS_BEGIN
        self.m_ErrorNum: int = 0
        self.m_WarningNum: int = 0

    # ------------------------------------------------------------------
    # Methoden — Skelette (volle Implementierung in Spezial-Slice)
    # ------------------------------------------------------------------

    def write_generator_file(self, filename: str) -> None:
        """C++: WriteGeneratorFile — P5-L Stub."""

    def interpret_p_sim_generator_file(self, fi: Any, dump: Any) -> None:
        """C++: InterpretPSimGeneratorFile — P5-L Stub."""

    def start_generation(self) -> None:
        """C++: StartGeneration — P5-L Stub."""

    def suspend_generation(self) -> None:
        """C++: SupendGeneration — P5-L Stub."""

    def reset_simulation(self) -> None:
        """C++: ResetSimulation — P5-L Stub."""

    def start_simulation(self, perioden: int) -> None:
        """C++: StartSimulation — P5-L Stub."""

    def set_property_2_lauf(
        self, lauf_inx: int, class_name: str, obj_inx: int,
        prop_name: str, prop_value: str,
    ) -> None:
        """C++: SetProperty2Lauf — Skelett."""

    def set_property_2_lauf_by_name(
        self, lauf_inx: int, class_name: str, obj_name: str,
        prop_name: str, prop_value: str,
    ) -> None:
        """C++: SetProperty2LaufbyName — Skelett."""
