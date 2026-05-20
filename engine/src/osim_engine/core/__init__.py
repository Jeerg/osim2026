"""OSimBase-Layer der osim-engine.

Enthält:
    - `event`: OMetaEvent + Event + MAX_EVENT_TIME-Konstante
    - `distribution`: OVerteil (PAWLICEK-LCG + 4 Verteilungs-Kernfunktionen),
      Modul-Singleton `s_verteil` als 1:1-Treue zu C++ `OSimulator::s_verteil`
    - `verteilung`: OVerteilung-Hierarchie (7 Subtypen)
    - `event_pool`: EventPool mit heapq + Lazy-Delete-Tombstones,
      Sortier-Schema `(time << 2) | subTime`

Phase 1 Slice C0-S (Stochastik-Fundament).
"""
