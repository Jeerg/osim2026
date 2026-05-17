"""PEinsatzzeit — Einsatzzeiten und Pausen für PRessBeleg.

Provenienz: `OSimPro/PEinsatzzeit.odh` + `OSimPro/PEinsatzzeit.cpp`.

V6-Slice "Einsatzzeit": eine `PEinsatzzeit` ist an n `PRessBeleg` gehängt
und gibt zu definierten Zeitpunkten `OnEinsatzBeginn`/`OnEinsatzEnde`-
Notifikationen ab. Daraufhin schaltet `PRessBeleg` zwischen `rsFrei` und
`rsPause`.

V6 implementiert:
    - `PPauseZyklus` (wiederkehrende Pausen, z. B. tägliche Mittagspause)
    - `PEinsatzzeitPause` (Container für Pause-Zyklen)
    - `PEinsatzzeit` als abstrakte Basis

`PEinsatzzeitTag` (Tagesarbeitszeiten mit Wochenplan) bleibt für eine
spätere Slice — die `InsertEvents`-Logik dafür ist komplexer (siehe
`PEinsatzzeit.cpp:299-351`).

Zeit-Einheiten:
    - `m_iPausAnfang`, `m_iPausEnde`, `m_iPeriode` in Stunden (float),
      analog C++ (`Stunde2SZeit(zyk->m_iPeriode)`).
    - Konvertierung zu Sim-Sekunden via `int(stunden * 3600)`.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum
from typing import TYPE_CHECKING, Any

from osim_engine.core.event import OMetaEvent
from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.simulator import PSimulator
    from osim_engine.resources.beleg import PRessBeleg


# ----------------------------------------------------------------------
# Enums (PEinsatzzeit.odh:22-28, PRessBeleg.odh:88-96)
# ----------------------------------------------------------------------


class PEinsatzzeitEvtMode(IntEnum):
    """C++: `PEinsatzzeitEvtMode` (`PEinsatzzeit.odh:22`).

    Wird als Event-Parameter an `EvtPause` übergeben und vom
    `OnPauseEvent`-Dispatcher in `OnEinsatzBeginn` (= `PEM_END` der Pause)
    bzw. `OnEinsatzEnde` (= `PEM_BEGIN` der Pause) übersetzt.
    """

    PEM_BEGIN = 0       # Pause/Einsatz BEGINNT
    PEM_END = 1         # Pause/Einsatz ENDET
    PEM_END_FOR_DAY = 2  # Einsatz endet für diesen Tag (Tag-Variante)
    PEM_INIT = 3        # Initialisierungs-Event (Tag-Variante)


class EinsatzEvtTyp(IntEnum):
    """C++: `EinsatzEvtTyp` (`PRessBeleg.odh:88`)."""

    EET_INIT = 0
    EET_STD = 1
    EET_END_FOR_DAY = 2
    EET_EXT = 3
    EET_EXT_END_FOR_DAY = 4


# ----------------------------------------------------------------------
# Helper — Stunden ↔ Sim-Sekunden
# ----------------------------------------------------------------------


def _stunde_zu_szeit(stunden: float) -> int:
    """Stundenwert in Sim-Sekunden. C++ inline: `int(h * 3600)`."""
    return int(stunden * 3600.0)


# ----------------------------------------------------------------------
# PPauseZyklus — wiederkehrende Pause (Anfang/Ende/Periode in Stunden)
# ----------------------------------------------------------------------


@dataclass
class PPauseZyklus:
    """C++-Äquivalent: `PPauseZyklus` (`PEinsatzzeit.odh:127`).

    Modelliert eine Pause, die alle `m_iPeriode` Stunden auftritt, von
    `m_iPausAnfang` bis `m_iPausEnde` (jeweils relative Position
    innerhalb der Periode).

    Beispiel: tägliche Mittagspause von 12:00 bis 13:00 →
    `m_iPausAnfang=12.0`, `m_iPausEnde=13.0`, `m_iPeriode=24.0`.
    """

    m_iPausAnfang: float = 0.0
    m_iPausEnde: float = 0.0
    m_iPeriode: float = 0.0

    def is_pause(self, akt_stunden: float) -> bool:
        """C++: `PPauseZyklus::IsPause` (PEinsatzzeit.cpp:123-133).

        Faltet `akt_stunden` modulo `m_iPeriode` und prüft, ob in
        Pause-Fenster.
        """
        if self.m_iPeriode <= 0.0:
            return False
        akt = akt_stunden
        while akt >= self.m_iPeriode:
            akt -= self.m_iPeriode
        return self.m_iPausAnfang <= akt < self.m_iPausEnde


# ----------------------------------------------------------------------
# EvtPause — OMetaEvent für Pause-Lifecycle
# ----------------------------------------------------------------------


class EvtPause(OMetaEvent):
    """C++: `$event(3) Pause(PEinsatzzeitEvtMode pem)` (PEinsatzzeit.odh:54).

    Sub-Time 3: Einsatzzeit-Events laufen NACH den Verkehrs-Events
    (Auslöser=1, BearbeitEnde=2). Damit kollidieren sie sauber mit
    Kantenübergängen (auch sub_time=3) nicht — eine Pause zur gleichen
    Sim-Sekunde wie ein Übergang würde nach dem Übergang ausgeführt.
    """

    m_subTime = 3
    m_name = "EvtPause"

    def execute(self, obj: "PEinsatzzeit", para: Any = None) -> None:
        assert isinstance(para, PEinsatzzeitEvtMode), (
            f"EvtPause.para muss PEinsatzzeitEvtMode sein, ist {type(para).__name__}"
        )
        obj.on_pause_event(para)


_EVT_PAUSE = EvtPause()


# ----------------------------------------------------------------------
# PEinsatzzeit — abstract Basis
# ----------------------------------------------------------------------


class PEinsatzzeit(PSimObj):
    """C++-Äquivalent: `PEinsatzzeit` (`PEinsatzzeit.odh:32`). Abstract."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        # m_lRessBeleg — angehängte Belegungs-Ressourcen (1:n)
        self.m_lRessBeleg: list["PRessBeleg"] = []
        # Protokoll
        self.m_dPtkEinsatzzeit: float = 0.0
        self.m_dTmpEinsatzzeit: float = 0.0

    # ------------------------------------------------------------------
    # Lifecycle — PEinsatzzeit.odh:65-103
    # ------------------------------------------------------------------

    def on_sim_reset(self, deep: bool = True) -> None:  # noqa: ARG002
        self.m_dPtkEinsatzzeit = 0.0
        self.m_dTmpEinsatzzeit = 0.0

    def on_rec_init(self, deep: bool = True) -> None:  # noqa: ARG002
        self.m_dPtkEinsatzzeit = 0.0
        self.m_dTmpEinsatzzeit = 0.0

    def on_period_begin(self, deep: bool = True) -> None:  # noqa: ARG002
        """C++: ruft InsertEvents für die anstehende Periode auf."""
        self.insert_events()

    # ------------------------------------------------------------------
    # Helper — anhängen
    # ------------------------------------------------------------------

    def attach_ressource(self, beleg: "PRessBeleg") -> None:
        """Hängt PRessBeleg in m_lRessBeleg und setzt den Rück-Link."""
        self.m_lRessBeleg.append(beleg)
        beleg.m_lEinsatz = self

    # ------------------------------------------------------------------
    # Sim-Methoden — von Subklassen implementiert
    # ------------------------------------------------------------------

    def insert_events(self) -> None:
        """C++: `PEinsatzzeit::InsertEvents` (PEinsatzzeit.cpp:25-27).
        Basis: no-op. Subklassen platzieren ihre EvtPause-Events.
        """

    def create_einsatzzeit_event(self, pem: PEinsatzzeitEvtMode, sim_time: int) -> None:
        """C++: `PEinsatzzeit::CreateEinsatzzeitEvent` (PEinsatzzeit.cpp:33-38)."""
        sim = self.p_simulator
        assert sim.m_periodBegin <= sim_time, (
            f"create_einsatzzeit_event: sim_time={sim_time} < period_begin={sim.m_periodBegin}"
        )
        sim.evt_insert(_EVT_PAUSE, self, sim_time, pem)

    def on_pause_event(self, pem: PEinsatzzeitEvtMode) -> None:
        """C++: `PEinsatzzeit::OnPauseEvent` (PEinsatzzeit.cpp:89-92).
        Basis: no-op. Subklassen dispatchen an `m_lRessBeleg`.
        """


# ----------------------------------------------------------------------
# PEinsatzzeitPause — Container für Pause-Zyklen
# ----------------------------------------------------------------------


class PEinsatzzeitPause(PEinsatzzeit):
    """C++-Äquivalent: `PEinsatzzeitPause` (`PEinsatzzeit.odh:159`).

    Liste von `PPauseZyklus`. `InsertEvents` rastert die kommende
    Sim-Periode in `period`-große Schritte und legt für jeden Schritt ein
    `EvtPause(PEM_BEGIN)` und ein `EvtPause(PEM_END)` ab.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_lPausen: list[PPauseZyklus] = []
        # m_isPause: aktueller Zustand (geteilt für alle attached Belege)
        self.m_isPause: bool = False

    def on_sim_reset(self, deep: bool = True) -> None:
        super().on_sim_reset(deep=deep)
        self.m_isPause = False

    def on_rec_init(self, deep: bool = True) -> None:
        super().on_rec_init(deep=deep)
        self.m_isPause = False

    # ------------------------------------------------------------------
    # Pause-Zustands-Abfrage
    # ------------------------------------------------------------------

    def is_pause(self, akt_stunden: float) -> bool:
        """C++: `PEinsatzzeitPause::IsPause` (PEinsatzzeit.cpp:185-197).
        TRUE wenn IRGENDEIN m_lPausen-Zyklus Pause meldet.
        """
        for zyk in self.m_lPausen:
            if zyk.is_pause(akt_stunden):
                return True
        return False

    # ------------------------------------------------------------------
    # InsertEvents — Pausen-Ereignisse für die anstehende Periode
    # ------------------------------------------------------------------

    def insert_events(self) -> None:
        """C++: `PEinsatzzeitPause::InsertEvents` (PEinsatzzeit.cpp:146-177).

        Iteriert für jeden Pause-Zyklus alle Vorkommen, deren Beginn oder
        Ende in `[akt_period_beginn, next_period_beginn)` fällt, und legt
        je ein `EvtPause(PEM_BEGIN)` / `EvtPause(PEM_END)` ab.
        """
        sim = self.p_simulator
        akt_period_beginn = sim.m_periodLen * sim.m_periodNum
        next_period_beginn = sim.m_periodLen * (sim.m_periodNum + 1)

        for zyk in self.m_lPausen:
            period_sec = _stunde_zu_szeit(zyk.m_iPeriode)
            if period_sec <= 0:
                continue

            i_begin = akt_period_beginn // period_sec
            i_end = next_period_beginn // period_sec + 1

            for i in range(i_begin, i_end + 1):
                ev_begin = i * period_sec + _stunde_zu_szeit(zyk.m_iPausAnfang)
                ev_end = i * period_sec + _stunde_zu_szeit(zyk.m_iPausEnde)

                if akt_period_beginn <= ev_begin < next_period_beginn:
                    self.create_einsatzzeit_event(PEinsatzzeitEvtMode.PEM_BEGIN, ev_begin)
                if akt_period_beginn <= ev_end < next_period_beginn:
                    self.create_einsatzzeit_event(PEinsatzzeitEvtMode.PEM_END, ev_end)

    # ------------------------------------------------------------------
    # Event-Handler
    # ------------------------------------------------------------------

    def on_pause_event(self, pem: PEinsatzzeitEvtMode) -> None:
        """C++: `PEinsatzzeitPause::OnPauseEvent` (PEinsatzzeit.cpp:202-244).

        Hier liegt die Asymmetrie zwischen "Pause" und "Einsatz":
            - PEM_BEGIN = Pause beginnt = Einsatz endet → ressBeleg.on_einsatz_ende
            - PEM_END   = Pause endet   = Einsatz beginnt → ressBeleg.on_einsatz_beginn
        """
        akt_stunden = self.p_simulator.evt_curr_time() / 3600.0

        if pem == PEinsatzzeitEvtMode.PEM_BEGIN:
            if self.m_isPause:
                return  # bereits in Pause (überlappende Zyklen)
            self.m_isPause = True
            for beleg in list(self.m_lRessBeleg):
                beleg.on_einsatz_ende(EinsatzEvtTyp.EET_STD, self)

        elif pem == PEinsatzzeitEvtMode.PEM_END:
            if not self.m_isPause:
                return
            # Es könnte sein, dass eine ANDERE Pause aktuell ist
            if self.is_pause(akt_stunden):
                return
            self.m_isPause = False
            for beleg in list(self.m_lRessBeleg):
                beleg.on_einsatz_beginn(EinsatzEvtTyp.EET_STD, self)
