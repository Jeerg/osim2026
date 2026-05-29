"""run-id-Generierung, run-dir-Auflösung und meta.json-Schreiber.

Operative Defaults (01-CONTEXT.md):
    - D-OP-1: run-id = ISO-Timestamp-Slug + 4-stellige Sequence
              (``2026-05-28T14-33-12-0001``)
    - D-OP-2: run-dir-Default ``./runs/``, Override per ``OSIM_RUN_DIR`` env
              oder explizitem Argument (CLI ``--run-dir`` reicht das durch)
    - D-OP-3: ``drop_count`` aus dem Writer landet in meta.json

Sicherheit (T-01-01): ``resolve_run_dir`` löst den Pfad zu absolut auf und
lehnt ``..``-Traversal mit ``ValueError`` ab, bevor Verzeichnisse entstehen.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def make_run_id(seq: int = 1) -> str:
    """Baut die run-id im Format ``JJJJ-MM-TTTHH-MM-SS-NNNN`` (D-OP-1)."""
    stamp = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
    return f"{stamp}-{seq:04d}"


def resolve_run_dir(explicit: str | None = None) -> Path:
    """Löst das run-Verzeichnis auf (D-OP-2).

    Priorität: explizit > ``OSIM_RUN_DIR`` env > ``./runs``.

    T-01-01: Der gewählte Pfad wird zu absolut aufgelöst; enthält er ein
    ``..``-Segment, wird ``ValueError`` geworfen, bevor das Verzeichnis
    angelegt wird (Tampering-Abwehr für benutzer-/env-gesteuerte Pfade).
    """
    raw = explicit or os.environ.get("OSIM_RUN_DIR") or "./runs"
    # Traversal-Abwehr vor jeder Pfad-Normalisierung: ein explizites
    # ".."-Segment ist nie legitim für ein run-Verzeichnis.
    if ".." in Path(raw).parts:
        raise ValueError(f"run-dir darf kein '..'-Segment enthalten: {raw!r}")
    return Path(raw).resolve()


def write_meta(
    run_dir: str | Path,
    run_id: str,
    schema_version: str = "1.0",
    sim_config: dict[str, Any] | None = None,
    drop_count: int = 0,
    streams: dict[str, Any] | None = None,
) -> Path:
    """Schreibt ``meta.json`` (SPEC §6.4).

    Felder: ``run_id``, ``engine_version`` (best-effort aus
    ``importlib.metadata``), ``schema_version``, ``sim_config``,
    ``started_at`` (ISO-8601), ``drop_count``, ``streams`` (Status-Block,
    Default leer — wird in 01-04 gefüllt, D-2.2).
    """
    import json

    run_path = Path(run_dir)
    run_path.mkdir(parents=True, exist_ok=True)

    engine_version = _engine_version()
    meta: dict[str, Any] = {
        "run_id": run_id,
        "engine_version": engine_version,
        "schema_version": schema_version,
        "sim_config": sim_config or {},
        "started_at": datetime.now(timezone.utc).astimezone().isoformat(),
        "drop_count": drop_count,
        "streams": streams or {},
    }
    meta_path = run_path / "meta.json"
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return meta_path


def _engine_version() -> str:
    """Best-effort Engine-Version aus den Paket-Metadaten."""
    try:
        from importlib.metadata import version

        return version("osim-engine")
    except Exception:  # pragma: no cover - best effort, kein Hard-Fail
        return "0.0.0+unknown"
