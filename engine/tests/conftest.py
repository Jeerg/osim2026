"""pytest-Fixtures für osim-engine.

Wichtigste Fixture: `reset_lcg` (autouse) sorgt dafür, dass der globale
Modul-Singleton `s_verteil` vor jedem Test in den Standard-Zustand
zurückgesetzt wird. Damit bleibt jeder Test deterministisch und
unabhängig von der Reihenfolge.

Siehe `docs/CONTEXT-P1-SUPPLEMENT.md` § 6.3 (Modul-Singleton-Entscheidung).
"""

from __future__ import annotations

import pytest

from osim_engine.core import distribution as dist_module
from osim_engine.core.distribution import STD_KEIM


@pytest.fixture(autouse=True)
def reset_lcg() -> None:
    """Setzt s_verteil vor jedem Test auf Default-Keim, Antithetisch aus."""
    dist_module.s_verteil._keim_intern = STD_KEIM
    dist_module.s_verteil._external_ref = None
    dist_module.s_verteil._anti = 0
    yield
    # Cleanup: nochmal zurücksetzen für Sauberkeit
    dist_module.s_verteil._keim_intern = STD_KEIM
    dist_module.s_verteil._external_ref = None
    dist_module.s_verteil._anti = 0
