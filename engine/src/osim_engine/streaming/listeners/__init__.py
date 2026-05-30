"""Listener-Package — Import löst die Selbst-Registrierung aller Listener aus.

Defensiver Import über eine feste Namensliste: Jedes Listener-Modul ruft beim
Import ``register_listener(...)`` auf. Da die sechs Listener im Lauf der Phase
entstehen (Wave 1: lifecycle/gantt; Wave 2: auswertung/einsatz/schicht/
reporting), werden noch fehlende Module still übersprungen.

Damit muss KEIN Wave-2-Plan diese Datei editieren (kein Shared-Write) — ein
neues Listener-Modul wird allein durch Eintrag in ``_LISTENER_MODULES`` bzw.
durch sein bloßes Vorhandensein aktiv, sobald das Paket importiert wird.
"""

from __future__ import annotations

import importlib
import logging

logger = logging.getLogger(__name__)

# Feste Reihenfolge der Sub-Stream-Listener-Module (SPEC §7.1).
# wartequeue (gantt_wartequeue) wurde in 01-14 hinzugefügt.
_LISTENER_MODULES: tuple[str, ...] = (
    "lifecycle",
    "gantt",
    "auswertung",
    "einsatz",
    "schicht",
    "reporting",
    "wartequeue",
    "kennzahl_dlz",
)


def _load_listener_modules() -> None:
    """Importiert alle vorhandenen Listener-Module (löst Registrierung aus)."""
    for name in _LISTENER_MODULES:
        try:
            importlib.import_module(f"{__name__}.{name}")
        except ModuleNotFoundError:
            # Wave-2-Modul noch nicht gebaut — partial-Stream-Strategie (D-2.1).
            logger.debug("Listener-Modul %r noch nicht vorhanden — übersprungen", name)


_load_listener_modules()
