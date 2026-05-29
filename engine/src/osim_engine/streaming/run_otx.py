"""CLI-runnbares Run-Modul: lädt ein gespeichertes OTX-Modell und streamt es.

Generalisiert ``scripts/demo_stream_run.py``: statt einen synthetischen Plan zu
bauen, wird ein bestehendes Modell via ``OtxLoader`` geladen und N Perioden
gestreamt. Das Streaming wird listener-only über ``attach_streaming_listeners``
eingehängt — KEINE Änderung an ``core/simulator.py``, ``recorder.py``,
``observability/bus.py`` oder ``streaming/attach.py`` (SPEC §5, hartes
Nicht-Ziel).

Reproduzierbarkeitsvertrag (osim-ui/CLAUDE.md):
    - Dieses Modul ist als ``python -m osim_engine.streaming.run_otx`` runnbar
      und wird vom RunService als SEPARATER OS-Prozess gespawnt (nie Thread).
    - Die PAWLICEK-LCG bleibt unangetastet; Pacing ändert die RNG-Reihenfolge
      nicht (reiner ``time.sleep`` am Flush-Boundary).

Pacing (``--pace <seconds>``, Default 0.0):
    Nach jeder Periode (nach dem jeweiligen ``sim.start()``-Aufruf, der per
    D-1.3 einen ``writer.flush()`` am period_end auslöst) wird — wenn
    ``pace > 0`` — ein ``time.sleep(pace)`` ausgeführt. Der Sleep sitzt
    AUSSCHLIESSLICH an dieser Period-/Flush-Boundary im Treiber; er berührt
    Sim-Kern, Listener und RNG NICHT. Damit wächst die ``stream.jsonl`` über
    ``periods * pace`` Sekunden sichtbar nach (beobachtbar live), ohne
    Frame-Inhalt oder -Reihenfolge zu verändern. Bei ``pace=0.0`` ist das
    Verhalten identisch zum bisherigen Linear-Lauf.

RUN_DIR=-Kontrakt (bewusste Abweichung von demo_stream_run.py):
    ``RUN_DIR=<pfad>`` wird FRÜH ausgegeben — direkt nach
    ``attach_streaming_listeners`` (das die run-id-dir anlegt), VOR der
    gepacten Perioden-Schleife — und stdout geflusht. So liest der
    RunService-Parent den Pfad sofort, OHNE auf das Prozess-Ende zu warten
    (sonst ist der paced/live Stream nicht beobachtbar).

run-dir-Auflösung (D-OP-2): ``--run-dir`` CLI > ``OSIM_RUN_DIR`` env > ``./runs``.

Aufruf:
    python -m osim_engine.streaming.run_otx --otx <p> --run-dir <d>
                                            --periods N --pace S
"""

from __future__ import annotations

import argparse
from pathlib import Path
from time import sleep

from osim_engine.io.otx_loader import OtxLoader
from osim_engine.io.otx_reader import parse_otx_file
from osim_engine.streaming.attach import attach_streaming_listeners
from osim_engine.streaming.run_dir import write_meta


def _drive_run(
    otx_path: str | Path,
    run_dir: str | None,
    periods: int,
    pace: float,
    *,
    print_run_dir_early: bool,
) -> Path:
    """Gemeinsamer Lauf-Treiber für ``run_otx`` (Bibliotheks-Pfad) und
    ``main`` (CLI-Pfad).

    Lädt das OTX, hängt das Streaming listener-only ein, streamt ``periods``
    Perioden (mit optionalem Pacing am Flush-Boundary) und schreibt die finale
    meta.json. Wenn ``print_run_dir_early`` gesetzt ist, wird ``RUN_DIR=``
    direkt nach dem attach (VOR der Perioden-Schleife) auf stdout geflusht.
    """
    otx = parse_otx_file(otx_path)
    loader = OtxLoader()
    result = loader.load(otx)
    sim = result.simulator

    # Streaming listener-only einhängen (legt die run-id-dir an + schreibt
    # die initiale meta.json). KEIN Eingriff in den Sim-Kern (SPEC §5).
    writer = attach_streaming_listeners(sim, run_dir=run_dir)
    run_path = writer.path.parent
    run_id = run_path.name

    # FRÜH-Ausgabe (bewusste Abweichung von demo_stream_run.py): VOR dem
    # gepacten Perioden-Lauf, sofort geflusht — der Parent liest den run-id
    # ohne auf das Prozess-Ende zu warten.
    if print_run_dir_early:
        print(f"RUN_DIR={run_path}", flush=True)

    # Eine Periode pro start()-Aufruf — re-entrant über m_simStatus
    # (OSimulator.start kehrt nach period_end in den PERIOD-Status zurück).
    for _ in range(periods):
        sim.start()
        # Period-/Flush-Boundary: flush ist idempotent (D-1.3 hat am period_end
        # bereits geflusht); der optionale Sleep sitzt AUSSCHLIESSLICH hier und
        # berührt Sim-Kern/Listener/RNG NICHT.
        writer.flush()
        if pace > 0:
            sleep(pace)

    writer.close()

    # Finale meta.json: coverage_ratio (D-2.1/D-2.2 — surface coverage, still
    # stream what runs) + periods + pace + finaler drop_count + streams-Status.
    # write_meta ist idempotent (überschreibt die initiale meta.json im selben run-dir).
    from osim_engine.streaming.partial import build_streams_status
    write_meta(
        run_path,
        run_id=run_id,
        sim_config={
            "coverage_ratio": result.coverage_ratio,
            "periods": periods,
            "pace": pace,
        },
        drop_count=writer.drop_count,
        streams=build_streams_status(),
    )

    return run_path


def run_otx(
    otx_path: str | Path,
    run_dir: str | None,
    periods: int = 4,
    pace: float = 0.0,
) -> Path:
    """Lädt ``otx_path``, streamt ``periods`` Perioden in ``run_dir`` und gibt
    den run-dir (das Verzeichnis MIT der run-id) zurück.

    Args:
        otx_path: Pfad zur gespeicherten ``.otx``-Datei.
        run_dir: explizites run-Basis-Verzeichnis; sonst ``OSIM_RUN_DIR`` env
            oder ``./runs`` (D-OP-2). Der run-id-Unterordner entsteht darunter.
        periods: Anzahl der Perioden (eine pro ``sim.start()``-Aufruf,
            re-entrant über ``m_simStatus``).
        pace: Wall-Clock-Drossel in Sekunden am Flush-/Period-Boundary
            (Default 0.0 = kein Sleep). Ändert NICHT Frame-Inhalt/-Reihenfolge.

    Returns:
        ``Path`` des run-dir (``<run_dir>/<run-id>``).
    """
    return _drive_run(
        otx_path, run_dir, periods, pace, print_run_dir_early=False
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--otx",
        required=True,
        help="Pfad zur gespeicherten .otx-Datei (Pflicht).",
    )
    parser.add_argument(
        "--run-dir",
        default=None,
        help="run-Basis-Verzeichnis (Default: OSIM_RUN_DIR env oder ./runs), D-OP-2",
    )
    parser.add_argument("--periods", type=int, default=4)
    parser.add_argument(
        "--pace",
        type=float,
        default=0.0,
        help="Wall-Clock-Drossel (s) am Flush-Boundary; ändert NICHT den Stream.",
    )
    args = parser.parse_args(argv)

    # CLI-Pfad: RUN_DIR= FRÜH ausgeben (vor der Perioden-Schleife).
    _drive_run(
        args.otx,
        args.run_dir,
        args.periods,
        args.pace,
        print_run_dir_early=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
