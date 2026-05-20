"""Generiert .jsonl-Fixtures aus der Python-Implementation.

Ersatz für die Mini-C-Programme unter `osim2004-trace/{lcg,verteil,eventpool}/`,
solange kein C-Compiler verfügbar ist.

Aufrufparameter sind identisch zum `Makefile`-Target `fixtures`.

Output-Format: JSONL mit `repr()`-Float-Konvertierung (volle IEEE-754-double-
Präzision, wie `%.17g` in C printf).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# osim-engine-Imports
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "src"))

from osim_engine.core.distribution import OVerteil, STD_KEIM  # noqa: E402
from osim_engine.core.verteilung import (  # noqa: E402
    OVerteilungKonstant,
    OVerteilungGleich,
    OVerteilungNormal,
    OVerteilungNormalGrenz,
    OVerteilungExponential,
    OVerteilungLogNormal,
    OVerteilungExponentialVersch,
)
from osim_engine.core import distribution as dist_module  # noqa: E402

FIXTURES_DIR = REPO_ROOT / "tests" / "diff" / "fixtures"


def _write_jsonl(path: Path, records: list[dict]) -> None:
    """Kompaktes JSONL, ein Record pro Zeile."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        for rec in records:
            fh.write(json.dumps(rec, separators=(",", ":")) + "\n")


def _reset(seed: float = STD_KEIM) -> None:
    """Setzt Modul-Singleton zurück + Antithetisch-Flag aus."""
    dist_module.s_verteil._keim_intern = seed
    dist_module.s_verteil._external_ref = None
    dist_module.s_verteil._anti = 0


# ----------------------------------------------------------------------
# LCG
# ----------------------------------------------------------------------


def fixture_lcg(seed: float = STD_KEIM, n: int = 10000) -> None:
    """Erste N LCG-Samples mit gegebenem Seed. Format: call_no/keim_before/keim_after/result."""
    out_path = FIXTURES_DIR / f"lcg_{n}_seed{int(seed)}.jsonl"
    verteil = OVerteil(seed)
    records = []
    for i in range(n):
        keim_before = verteil.keim
        result = verteil.zufall()
        records.append({
            "call_no": i,
            "keim_before": keim_before,
            "keim_after": verteil.keim,
            "result": result,
        })
    _write_jsonl(out_path, records)
    print(f"  -> {out_path.relative_to(REPO_ROOT)}  ({n} Samples)")


# ----------------------------------------------------------------------
# Verteilungen — alle nutzen den Modul-Singleton
# ----------------------------------------------------------------------


def fixture_konstant(wert_basis: float = 5.0, n: int = 1000, seed: float = STD_KEIM) -> None:
    _reset(seed)
    v = OVerteilungKonstant(wert_basis=wert_basis)
    records = [{"call_no": i, "sample": v.hole_zufallswert()} for i in range(n)]
    out = FIXTURES_DIR / f"verteil_konstant_{int(wert_basis)}.jsonl"
    _write_jsonl(out, records)
    print(f"  -> {out.relative_to(REPO_ROOT)}")


def fixture_gleich(wert_basis: float = 10.0, n: int = 1000, seed: float = STD_KEIM) -> None:
    _reset(seed)
    v = OVerteilungGleich(wert_basis=wert_basis)
    records = [{"call_no": i, "sample": v.hole_zufallswert()} for i in range(n)]
    out = FIXTURES_DIR / f"verteil_gleich_{int(wert_basis)}.jsonl"
    _write_jsonl(out, records)
    print(f"  -> {out.relative_to(REPO_ROOT)}")


def fixture_normal(ew: float = 100.0, sa: float = 10.0, n: int = 1000, seed: float = STD_KEIM) -> None:
    _reset(seed)
    v = OVerteilungNormal(wert_basis=ew, std_abweich=sa)
    records = [{"call_no": i, "sample": v.hole_zufallswert()} for i in range(n)]
    out = FIXTURES_DIR / f"verteil_normal_ew{int(ew)}_sa{int(sa)}.jsonl"
    _write_jsonl(out, records)
    print(f"  -> {out.relative_to(REPO_ROOT)}")


def fixture_normal_grenz(
    ew: float = 100.0,
    sa: float = 20.0,
    mn: float = 50.0,
    mx: float = 200.0,
    n: int = 1000,
    seed: float = STD_KEIM,
) -> None:
    _reset(seed)
    v = OVerteilungNormalGrenz(wert_basis=ew, std_abweich=sa, min_grenze=mn, max_grenze=mx)
    records = [{"call_no": i, "sample": v.hole_zufallswert()} for i in range(n)]
    out = FIXTURES_DIR / f"verteil_normal_grenz_ew{int(ew)}_sa{int(sa)}_min{int(mn)}_max{int(mx)}.jsonl"
    _write_jsonl(out, records)
    print(f"  -> {out.relative_to(REPO_ROOT)}")


def fixture_expo(ew: float = 100.0, n: int = 1000, seed: float = STD_KEIM) -> None:
    _reset(seed)
    v = OVerteilungExponential(wert_basis=ew)
    records = [{"call_no": i, "sample": v.hole_zufallswert()} for i in range(n)]
    out = FIXTURES_DIR / f"verteil_expo_ew{int(ew)}.jsonl"
    _write_jsonl(out, records)
    print(f"  -> {out.relative_to(REPO_ROOT)}")


def fixture_log_normal(ew: float = 100.0, sa: float = 10.0, n: int = 1000, seed: float = STD_KEIM) -> None:
    _reset(seed)
    v = OVerteilungLogNormal(wert_basis=ew, std_abweich=sa)
    records = [{"call_no": i, "sample": v.hole_zufallswert()} for i in range(n)]
    out = FIXTURES_DIR / f"verteil_log_normal_ew{int(ew)}_sa{int(sa)}.jsonl"
    _write_jsonl(out, records)
    print(f"  -> {out.relative_to(REPO_ROOT)}")


def fixture_expo_versch(
    ew: float = 100.0,
    rv: float = 10.0,
    n: int = 1000,
    seed: float = STD_KEIM,
) -> None:
    _reset(seed)
    v = OVerteilungExponentialVersch(wert_basis=ew, rechts_versch=rv)
    records = [{"call_no": i, "sample": v.hole_zufallswert()} for i in range(n)]
    out = FIXTURES_DIR / f"verteil_expo_versch_ew{int(ew)}_rv{int(rv)}.jsonl"
    _write_jsonl(out, records)
    print(f"  -> {out.relative_to(REPO_ROOT)}")


# ----------------------------------------------------------------------
# EventPool — synthetische Sortier-Sequenz
# ----------------------------------------------------------------------


def fixture_eventpool_sorting() -> None:
    """Reproduziert die Sortier-Sequenz aus osim2004-trace/eventpool/sorting.c."""
    inserts = [
        (1000, 3, "C1"),
        (1000, 0, "A1"),
        (1000, 1, "B1"),
        ( 500, 2, "X1"),
        (1500, 0, "D1"),
        (1000, 0, "A2"),
    ]
    # Encoding + Sortierung 1:1 wie C-Programm
    entries = []
    for insert_order, (t, sub, name) in enumerate(inserts):
        combined = (t << 2) | (sub & 0x3)
        entries.append({
            "combined": combined,
            "insert_order": insert_order,
            "decoded_time": t,
            "sub_time": sub,
            "name": name,
        })
    entries.sort(key=lambda e: (e["combined"], e["insert_order"]))
    records = []
    for pop_order, e in enumerate(entries):
        records.append({
            "pop_order": pop_order,
            "combined": e["combined"],
            "decoded_time": e["decoded_time"],
            "sub_time": e["sub_time"],
            "name": e["name"],
        })
    out = FIXTURES_DIR / "eventpool_synthetic_sequence.jsonl"
    _write_jsonl(out, records)
    print(f"  -> {out.relative_to(REPO_ROOT)}")


# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------


def main() -> int:
    print(f"Generiere Fixtures nach {FIXTURES_DIR.relative_to(REPO_ROOT)}/")
    fixture_lcg(seed=STD_KEIM, n=10000)
    fixture_konstant(wert_basis=5.0, n=1000)
    fixture_gleich(wert_basis=10.0, n=1000)
    fixture_normal(ew=100.0, sa=10.0, n=1000)
    fixture_normal_grenz(ew=100.0, sa=20.0, mn=50.0, mx=200.0, n=1000)
    fixture_expo(ew=100.0, n=1000)
    fixture_log_normal(ew=100.0, sa=10.0, n=1000)
    fixture_expo_versch(ew=100.0, rv=10.0, n=1000)
    fixture_eventpool_sorting()
    print("Fertig.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
