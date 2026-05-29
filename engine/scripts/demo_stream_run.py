#!/usr/bin/env python
"""Reproduzierbarer 1000-Event-Demo-Lauf für die Live-Viewer-Bridge (Plan 01-07).

Baut einen deterministischen PPS-Sim (fester Knoten-/Auslöser-Aufbau, mehrere
Perioden) mit genügend Aufträgen, dass **≥ 1000 Frames** in den JSONL-Stream
fließen, hängt das Streaming via ``attach_streaming_listeners(sim, run_dir)``
(listener-only, SPEC §5 — kein Eingriff in ``core/simulator.py``) ein und
schreibt nach ``<run-dir>/<run-id>/stream.jsonl`` + ``meta.json``.

Reproduzierbarkeitsvertrag (osim-ui/CLAUDE.md):
    - Sim-Lauf in einem **separaten OS-Prozess** (dieses Script ist genau das).
    - Ein Lauf ist über seinen deterministischen Aufbau + die feste Perioden-
      zahl identifiziert; die PAWLICEK-LCG bleibt unangetastet (keine UI-seitige
      Reorder-/Aggregations-Einschiebung).

run-dir-Auflösung (D-OP-2): ``--run-dir`` CLI > ``OSIM_RUN_DIR`` env > ``./runs``.
Der finale run-dir-Pfad wird als LETZTE stdout-Zeile ausgegeben (maschinen-
lesbar, ``RUN_DIR=<pfad>``), damit der E2E-Test / das UAT-Skript ihn findet.

Aufruf:
    cd engine
    uv run python scripts/demo_stream_run.py [--run-dir <pfad>] [--periods N]
                                             [--auftraege-pro-periode M]
                                             [--knoten K] [--validate]

Mit ``--validate`` werden die erzeugten Frames gegen die 6 JSON-Schemas aus
``streaming/schemas/`` validiert (Reuse der 01-06-Schema-Pipeline) und eine
kurze Statistik ausgegeben.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.durchlaufplan import PDurchlaufplan
from osim_engine.pps.kante.uebergang import PDpKaUebergang
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator
from osim_engine.streaming.attach import attach_streaming_listeners
from osim_engine.streaming.frame import STREAM_TAGS

# Default-Dimensionierung: 4 Perioden × 70 Aufträge × 6 Knoten ≈ 2000 Frames.
# Liegt robust über der 1000-Frame-Schwelle (AC-6), auch wenn einzelne
# Skelett-Slices (P5-D/L/M) weniger Frames als final beitragen.
DEFAULT_PERIODS = 4
DEFAULT_AUFTRAEGE_PRO_PERIODE = 70
DEFAULT_KNOTEN = 6
# Konstante Knoten-/Übergangs-Zeiten — deterministischer Durchlauf.
KNOTEN_DAUER = 500
UEBERGANGSZEIT = 10
# Auftrags-Stagger innerhalb einer Periode (s); klein gegen period_len (86400).
AUFTRAG_STAGGER = 200
AUFTRAG_OFFSET = 100


def _build_linear_plan(sim: PSimulator, nknoten: int, dauer: int) -> PDurchlaufplan:
    """Linearer Durchlaufplan mit ``nknoten`` Konstant-Knoten (analog
    test_v2_multi_knoten / test_v3_kpi)."""
    plan = PDurchlaufplan(sim)
    plan.m_sName = "Demo-Plan"

    knoten: list[PDpKnKonstant] = []
    for i in range(nknoten):
        k = PDpKnKonstant(sim)
        k.m_sName = f"K{i + 1}"
        k.m_iDurchfuehrungszeit = dauer
        plan.add_knoten(k)
        knoten.append(k)

    edges: list[PDpKaUebergang] = []
    for i in range(nknoten + 1):
        ka = PDpKaUebergang(sim)
        ka.m_sName = f"E{i}"
        ka.m_iUebergangszeit = UEBERGANGSZEIT
        plan.add_kante(ka)
        edges.append(ka)

    plan.set_start_kante(edges[0])
    edges[0].m_lNachfolger.append(knoten[0])
    knoten[0].m_lKanteEin = edges[0]
    for i in range(nknoten - 1):
        knoten[i].m_lKanteAus = edges[i + 1]
        edges[i + 1].m_lVorgaenger.append(knoten[i])
        edges[i + 1].m_lNachfolger.append(knoten[i + 1])
        knoten[i + 1].m_lKanteEin = edges[i + 1]
    knoten[-1].m_lKanteAus = edges[nknoten]
    edges[nknoten].m_lVorgaenger.append(knoten[-1])
    plan.set_end_kante(edges[nknoten])

    sim.register_plan(plan)
    return plan


def build_demo_sim(
    periods: int,
    auftraege_pro_periode: int,
    nknoten: int,
) -> PSimulator:
    """Baut den deterministischen Demo-Sim: ein linearer Plan, in jeder Periode
    ``auftraege_pro_periode`` zeitlich gestaffelte Einzel-Auslöser."""
    sim = PSimulator()
    plan = _build_linear_plan(sim, nknoten, KNOTEN_DAUER)
    period_len = sim.m_periodLen  # Default 86400 s (1 Tag)

    for p in range(periods):
        for j in range(auftraege_pro_periode):
            ausl = PAslEinzel(sim)
            ausl.m_sName = f"FA-{p:02d}-{j:03d}"
            ausl.m_iBeginTermin = p * period_len + AUFTRAG_OFFSET + j * AUFTRAG_STAGGER
            ausl.m_lDlpl = plan
            sim.register_ausloeser(ausl)
    return sim


def run_demo(
    run_dir: str | None,
    periods: int,
    auftraege_pro_periode: int,
    nknoten: int,
) -> Path:
    """Führt den Demo-Lauf aus, schreibt stream.jsonl + meta.json und gibt den
    run-dir (das Verzeichnis MIT der run-id) zurück."""
    sim = build_demo_sim(periods, auftraege_pro_periode, nknoten)
    writer = attach_streaming_listeners(sim, run_dir=run_dir)
    # Eine Periode pro start()-Aufruf — re-entrant über m_simStatus
    # (OSimulator.start kehrt nach period_end in den PERIOD-Status zurück).
    for _ in range(periods):
        sim.start()
    writer.close()
    return writer.path.parent


def _load_validators() -> dict:
    """Lädt die 6 Draft-2020-12-Schemas aus streaming/schemas/ (Reuse 01-06)."""
    from jsonschema import Draft202012Validator

    import osim_engine.streaming as streaming_pkg

    schema_dir = Path(streaming_pkg.__file__).resolve().parent / "schemas"
    validators = {}
    for tag in STREAM_TAGS:
        schema = json.loads((schema_dir / f"{tag}.json").read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
        validators[tag] = Draft202012Validator(schema)
    return validators


def report_and_validate(run_path: Path, validate: bool) -> dict:
    """Liest die erzeugte stream.jsonl, gibt eine Statistik aus und validiert
    optional jedes Frame gegen sein Stream-Schema. Liefert die Statistik."""
    stream_path = run_path / "stream.jsonl"
    lines = [
        ln for ln in stream_path.read_text(encoding="utf-8").splitlines() if ln.strip()
    ]
    frames = [json.loads(ln) for ln in lines]
    per_stream = Counter(f["stream"] for f in frames)

    print(f"[demo] run_dir       = {run_path}")
    print(f"[demo] stream.jsonl  = {stream_path} ({len(frames)} Frames)")
    for tag in STREAM_TAGS:
        print(f"[demo]   {tag:<18} {per_stream.get(tag, 0)}")

    # seq-Monotonie (Lücken-Freiheit) als Sanity-Check.
    seqs = [f["seq"] for f in frames]
    monotonic = seqs == sorted(seqs) and len(set(seqs)) == len(seqs)
    print(f"[demo] seq strikt monoton = {monotonic}")

    stats = {
        "total": len(frames),
        "per_stream": dict(per_stream),
        "seq_monotonic": monotonic,
        "validation_errors": 0,
    }

    if validate:
        validators = _load_validators()
        errors = 0
        for i, frame in enumerate(frames):
            tag = frame.get("stream")
            v = validators.get(tag)
            if v is None:
                continue
            for err in v.iter_errors(frame):
                errors += 1
                if errors <= 10:
                    print(f"[demo] SCHEMA-FEHLER Zeile {i + 1} ({tag}): {err.message}")
        stats["validation_errors"] = errors
        print(f"[demo] Schema-Validierung: {errors} Fehler bei {len(frames)} Frames")

    # meta.json-Statusblock kurz anzeigen.
    meta_path = run_path / "meta.json"
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        streams = meta.get("streams", {})
        partial = sorted(t for t, s in streams.items() if s.get("status") == "partial")
        print(f"[demo] meta.schema_version = {meta.get('schema_version')}")
        print(f"[demo] meta.drop_count     = {meta.get('drop_count')}")
        print(f"[demo] meta.streams partial = {partial}")
        stats["schema_version"] = meta.get("schema_version")
        stats["drop_count"] = meta.get("drop_count")
        stats["partial_streams"] = partial

    return stats


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--run-dir",
        default=None,
        help="run-Verzeichnis (Default: OSIM_RUN_DIR env oder ./runs), D-OP-2",
    )
    parser.add_argument("--periods", type=int, default=DEFAULT_PERIODS)
    parser.add_argument(
        "--auftraege-pro-periode",
        type=int,
        default=DEFAULT_AUFTRAEGE_PRO_PERIODE,
    )
    parser.add_argument("--knoten", type=int, default=DEFAULT_KNOTEN)
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Frames gegen die 6 JSON-Schemas validieren (Reuse 01-06).",
    )
    args = parser.parse_args(argv)

    run_path = run_demo(
        args.run_dir,
        args.periods,
        args.auftraege_pro_periode,
        args.knoten,
    )
    stats = report_and_validate(run_path, args.validate)

    if stats["total"] < 1000:
        print(
            f"[demo] WARNUNG: nur {stats['total']} Frames (< 1000) — Dimensionierung "
            "hochsetzen (--periods / --auftraege-pro-periode).",
            file=sys.stderr,
        )
    if args.validate and stats["validation_errors"]:
        print("[demo] FEHLER: Schema-Validierung fehlgeschlagen.", file=sys.stderr)
        # Maschinen-lesbare run-dir-Zeile trotzdem ausgeben.
        print(f"RUN_DIR={run_path}")
        return 1

    # LETZTE Zeile: maschinen-lesbarer run-dir-Pfad für E2E/UAT.
    print(f"RUN_DIR={run_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
