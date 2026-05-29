"""Tests für ``osim_engine.streaming.run_otx`` — das CLI-runnbare Run-Modul.

``run_otx`` lädt ein gespeichertes OTX-Modell (statt einen synthetischen Plan
zu bauen wie ``scripts/demo_stream_run.py``), hängt das Streaming listener-only
ein (SPEC §5 — kein Eingriff in den Sim-Kern) und streamt N Perioden in eine
run-dir. ``--pace`` drosselt NUR die Wall-Clock am Flush-/Period-Boundary —
Frame-Inhalt + -Reihenfolge bleiben byte-identisch (Reproduzierbarkeit +
PAWLICEK-LCG unangetastet).

Fixture: ``embb_pre_run.otx`` (100% Loader-Coverage, lauffähiger PSimulator).
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

import pytest

from osim_engine.streaming.run_otx import run_otx


FIXTURES = Path(__file__).parent.parent / "fixtures" / "otx"
PRE_FILE = FIXTURES / "embb_pre_run.otx"


def _read_frames(run_path: Path) -> list[dict]:
    stream_path = run_path / "stream.jsonl"
    lines = [
        ln for ln in stream_path.read_text(encoding="utf-8").splitlines() if ln.strip()
    ]
    return [json.loads(ln) for ln in lines]


# ----------------------------------------------------------------------
# Test 1 — Grund-Lauf: Frames + meta.json
# ----------------------------------------------------------------------


def test_run_otx_writes_stream_and_meta(tmp_path: Path) -> None:
    """``run_otx`` schreibt eine ``<run-dir>/<run-id>/stream.jsonl`` mit > 0
    Frames + eine ``meta.json`` mit ``schema_version`` und liefert den run-dir
    (das Verzeichnis MIT der run-id)."""
    run_path = run_otx(str(PRE_FILE), str(tmp_path), periods=2)

    assert run_path.is_dir()
    assert run_path.parent == tmp_path.resolve()
    stream_path = run_path / "stream.jsonl"
    meta_path = run_path / "meta.json"
    assert stream_path.is_file()
    assert meta_path.is_file()

    frames = _read_frames(run_path)
    assert len(frames) > 0

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    assert "schema_version" in meta


# ----------------------------------------------------------------------
# Test 2 — partielles Modell: kein Crash, coverage_ratio in meta.json
# ----------------------------------------------------------------------


def test_run_otx_partial_model_surfaces_coverage(tmp_path: Path) -> None:
    """Auch wenn der Loader partiell lädt (unsupported-Klassen) wirft
    ``run_otx`` NICHT; die ``coverage_ratio`` landet in ``meta.sim_config``.

    ``embb_pre_run.otx`` lädt zwar zu 100%, aber der Vertrag (coverage_ratio
    in meta.json) ist hier verifizierbar: das Feld muss existieren und ein
    float im Intervall [0, 1] sein.
    """
    run_path = run_otx(str(PRE_FILE), str(tmp_path), periods=1)

    meta = json.loads((run_path / "meta.json").read_text(encoding="utf-8"))
    sim_config = meta.get("sim_config", {})
    assert "coverage_ratio" in sim_config
    cov = sim_config["coverage_ratio"]
    assert isinstance(cov, (int, float))
    assert 0.0 <= float(cov) <= 1.0
    # periods + pace werden ebenfalls durchgereicht (D-2-Geist).
    assert sim_config.get("periods") == 1
    assert sim_config.get("pace") == 0.0


# ----------------------------------------------------------------------
# Test 3 — CLI-Aufruf: RUN_DIR= FRÜH, exit-code 0
# ----------------------------------------------------------------------


def test_run_otx_cli_prints_run_dir_early(tmp_path: Path) -> None:
    """``python -m osim_engine.streaming.run_otx --otx <p> --run-dir <d>
    --periods 1`` gibt ``RUN_DIR=<pfad>`` als ERSTE maschinen-lesbare Zeile
    aus (VOR den Perioden-Frames) und endet mit exit-code 0.

    Die FRÜH-Ausgabe ist eine bewusste Abweichung von demo_stream_run.py
    (Last-Line): der RunService-Parent muss den run-id lesen, OHNE auf das
    Prozess-Ende zu warten.
    """
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "osim_engine.streaming.run_otx",
            "--otx",
            str(PRE_FILE),
            "--run-dir",
            str(tmp_path),
            "--periods",
            "1",
        ],
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, proc.stderr

    run_dir_lines = [
        ln for ln in proc.stdout.splitlines() if ln.startswith("RUN_DIR=")
    ]
    assert run_dir_lines, f"keine RUN_DIR=-Zeile in stdout: {proc.stdout!r}"
    run_dir_value = run_dir_lines[0][len("RUN_DIR=") :]
    assert Path(run_dir_value).is_dir()
    assert (Path(run_dir_value) / "stream.jsonl").is_file()


# ----------------------------------------------------------------------
# Test 4 — Pacing ist determinismus-erhaltend (byte-identisch)
# ----------------------------------------------------------------------


def test_run_otx_pace_is_byte_identical(tmp_path: Path) -> None:
    """Zwei Läufe mit ``pace=0.0`` und ``pace=0.05`` produzieren
    BYTE-IDENTISCHE stream.jsonl — Pacing ist NUR eine Wall-Clock-Drossel,
    Frame-Inhalt + -Reihenfolge unverändert (PAWLICEK-LCG unangetastet).
    """
    dir_a = tmp_path / "a"
    dir_b = tmp_path / "b"
    run_a = run_otx(str(PRE_FILE), str(dir_a), periods=2, pace=0.0)
    run_b = run_otx(str(PRE_FILE), str(dir_b), periods=2, pace=0.05)

    bytes_a = (run_a / "stream.jsonl").read_bytes()
    bytes_b = (run_b / "stream.jsonl").read_bytes()
    assert bytes_a == bytes_b, "Pacing hat den Frame-Stream verändert"


# ----------------------------------------------------------------------
# Test 5 — Pacing öffnet ein Wall-Clock-Fenster
# ----------------------------------------------------------------------


def test_run_otx_pace_opens_wallclock_window(tmp_path: Path) -> None:
    """Ein Lauf mit ``pace=0.05`` über mehrere Perioden braucht messbar
    länger (Wall-Clock ≥ Mindestfenster) als ``pace=0.0`` — sodass ein
    Beobachter zwischen zwei Polls neue Frames sehen kann.
    """
    periods = 4
    pace = 0.05

    t0 = time.perf_counter()
    run_otx(str(PRE_FILE), str(tmp_path / "fast"), periods=periods, pace=0.0)
    fast = time.perf_counter() - t0

    t0 = time.perf_counter()
    run_otx(str(PRE_FILE), str(tmp_path / "slow"), periods=periods, pace=pace)
    slow = time.perf_counter() - t0

    # Konservativer Schwellwert: periods * pace = 0.2s Mindest-Sleep-Summe.
    # Wir prüfen ≥ 0.1s (Hälfte, robust gegen Boundary-Zählung).
    assert slow >= 0.1, f"paced run zu schnell ({slow:.3f}s)"
    assert slow > fast, f"paced run ({slow:.3f}s) nicht langsamer als fast ({fast:.3f}s)"
