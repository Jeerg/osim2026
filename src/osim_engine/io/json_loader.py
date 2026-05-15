"""JSON → Pydantic-Modell-Loader."""

from __future__ import annotations

import json
from pathlib import Path

from osim_engine.model.sim_model import SimModel


def load_model(path: str | Path) -> SimModel:
    """Lädt ein Sim-Modell aus einer JSON-Datei."""
    p = Path(path)
    with p.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return SimModel.model_validate(data)


def dump_model(model: SimModel, path: str | Path) -> None:
    """Schreibt ein Sim-Modell als JSON-Datei (mit Pretty-Print)."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("w", encoding="utf-8") as f:
        json.dump(model.model_dump(mode="json"), f, indent=2, ensure_ascii=False)
