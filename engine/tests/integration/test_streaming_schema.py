"""Stream-Schema-Validierung gegen Golden-Records (Phase 01-06, O-5 / AC-1).

Pinnt den versionierten Engine-UI-Vertrag: für jeden der sechs Sub-Streams
existiert ein JSON-Schema (Draft 2020-12) in
``src/osim_engine/streaming/schemas/``, gegen das hier sowohl die
**full**- als auch die **partial**-Golden-JSONL (D-2.4) validiert werden.

Die Validierung läuft NUR hier in den Tests/CI (D-1.4) — Writer und Listener
validieren zur Laufzeit nicht (kein Runtime-Overhead).

Stil-Vorlage: tests/integration/test_streaming.py + test_streaming_kpi.py.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from osim_engine.streaming.frame import STREAM_TAGS

# ----------------------------------------------------------------------
# Pfade + Helfer
# ----------------------------------------------------------------------

_SCHEMA_DIR = (
    Path(__file__).resolve().parents[2]
    / "src" / "osim_engine" / "streaming" / "schemas"
)
_GOLDEN_DIR = Path(__file__).resolve().parent / "golden"


def _load_schema(tag: str) -> dict:
    return json.loads((_SCHEMA_DIR / f"{tag}.json").read_text(encoding="utf-8"))


def _validator(tag: str) -> Draft202012Validator:
    schema = _load_schema(tag)
    # Schema selbst muss meta-schema-konform sein (fängt Schema-Tippfehler).
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def _read_jsonl(path: Path) -> list[dict]:
    lines = [ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    return [json.loads(ln) for ln in lines]


# ======================================================================
# Schema-Inventar (O-5: genau 6 Schemas)
# ======================================================================


def test_exactly_one_schema_per_substream() -> None:
    """O-5 / SPEC §6.1: genau ein JSON-Schema je Sub-Stream-Tag.

    Ab 01-14: 7 Streams (gantt_wartequeue neu hinzugefügt).
    """
    files = sorted(p.name for p in _SCHEMA_DIR.glob("*.json"))
    assert len(files) == len(STREAM_TAGS), f"erwarte {len(STREAM_TAGS)} Schemas, gefunden: {files}"
    assert files == sorted(f"{tag}.json" for tag in STREAM_TAGS)


def test_each_schema_declares_draft_2020_12() -> None:
    for tag in STREAM_TAGS:
        schema = _load_schema(tag)
        assert schema.get("$schema") == "https://json-schema.org/draft/2020-12/schema"
        assert "properties" in schema


# ======================================================================
# Golden-Record-Validierung — full UND partial (AC-1 / D-2.4)
# ======================================================================


@pytest.mark.parametrize("tag", STREAM_TAGS)
@pytest.mark.parametrize("variant", ["full", "partial"])
def test_golden_records_validate(tag: str, variant: str) -> None:
    """AC-1 / D-2.4: jede full- UND partial-Golden-JSONL validiert fehlerfrei
    gegen ihr Stream-Schema."""
    golden = _GOLDEN_DIR / f"{tag}.{variant}.jsonl"
    assert golden.exists(), f"fehlende Golden-Datei: {golden.name}"
    frames = _read_jsonl(golden)
    assert frames, f"{golden.name} ist leer — Coverage-Lücke muss min. 1 Record tragen"
    validator = _validator(tag)
    for i, frame in enumerate(frames):
        errors = sorted(validator.iter_errors(frame), key=str)
        assert not errors, (
            f"{golden.name} Zeile {i + 1} verletzt {tag}.json:\n"
            + "\n".join(e.message for e in errors)
        )
        # Stream-Tag-Konsistenz: jede Zeile gehört zu ihrem Stream.
        assert frame["stream"] == tag


# ======================================================================
# kpi_auswertung — 11 kinds + unbekannter kind (AC-1 Negativ)
# ======================================================================

_KPI_KINDS = (
    "prod_auftrag", "best_auftrag", "betr", "pers", "schicht",
    "kalkulation", "wschlange", "nbearbeit", "kauf", "eigen", "gesamt",
)


def test_kpi_full_golden_covers_all_eleven_kinds() -> None:
    """Alle 11 kind-Diskriminatoren sind in der full-Golden vertreten und valide."""
    frames = _read_jsonl(_GOLDEN_DIR / "kpi_auswertung.full.jsonl")
    kinds = {f["v"]["kind"] for f in frames}
    assert kinds == set(_KPI_KINDS)
    validator = _validator("kpi_auswertung")
    for frame in frames:
        assert not list(validator.iter_errors(frame)), frame["v"]["kind"]


def test_kpi_unknown_kind_is_rejected() -> None:
    """Ein Frame mit v.kind='nonsense' verletzt das kpi_auswertung-Schema."""
    validator = _validator("kpi_auswertung")
    bad = {
        "t": 86400, "stream": "kpi_auswertung", "seq": 999,
        "v": {"kind": "nonsense", "period_num": 0},
    }
    assert list(validator.iter_errors(bad)), "unbekannter kind hätte fehlschlagen müssen"


def test_kpi_prod_auftrag_missing_records_is_rejected() -> None:
    """prod_auftrag ohne records-Array verletzt den if-then-Zweig (Pflichtfeld,
    GAP-CLOSURE 01-11: now-buildable kinds fuehren records statt Generik)."""
    validator = _validator("kpi_auswertung")
    bad = {
        "t": 86400, "stream": "kpi_auswertung", "seq": 1000,
        "v": {"kind": "prod_auftrag", "period_num": 0},
    }
    assert list(validator.iter_errors(bad))


def test_kpi_prod_auftrag_record_missing_osim_field_is_rejected() -> None:
    """Eine prod_auftrag-record-Zeile ohne soll_beginn_tag verletzt das Schema
    (echte OSim-Feldnamen sind required, 1:1 gegen ISimulatorViewerAuswProdAuftr)."""
    validator = _validator("kpi_auswertung")
    bad = {
        "t": 86400, "stream": "kpi_auswertung", "seq": 1001,
        "v": {"kind": "prod_auftrag", "period_num": 0,
              "records": [{"teil": "Welle", "menge": 12, "beschreibung": "x"}]},
    }
    assert list(validator.iter_errors(bad))


def test_kpi_slice_gated_missing_slice_is_required() -> None:
    """pers ohne missing_slice verletzt das Schema (gated = echte Feldnamen +
    null + missing_slice, keine Erfindung — User-Direktive)."""
    validator = _validator("kpi_auswertung")
    bad = {
        "t": 86400, "stream": "kpi_auswertung", "seq": 1002,
        "v": {"kind": "pers", "period_num": 0, "name": None, "schichten": None,
              "ueberstunden_pct": None, "kann_kap_pct": None, "auslastung_pct": None,
              "kosten_pro_arbeitsstd": None, "kalk_stundensatz": None,
              "gesamtkosten_periode": None},
    }
    assert list(validator.iter_errors(bad))


def test_kpi_no_invented_generic_fields_in_schema() -> None:
    """Regression-Pin (GAP-CLOSURE 01-11): das Schema fuehrt keine erfundene
    Generik mehr (count_gesamt/durchlaufzeit_*/sollstunden)."""
    raw = (_SCHEMA_DIR / "kpi_auswertung.json").read_text(encoding="utf-8")
    for verboten in ("count_gesamt", "durchlaufzeit_avg", "sollstunden", "iststunden"):
        assert verboten not in raw, f"erfundenes Generik-Feld {verboten} noch im Schema"


# ======================================================================
# Negativ-Pin: defekte Golden-Zeile (fehlendes seq) MUSS fehlschlagen (AC-1)
# ======================================================================


def test_broken_golden_line_fails_validation() -> None:
    """Eine Golden-Zeile ohne Pflichtfeld ``seq`` lässt die Validierung
    fehlschlagen — ein Schema, das alles durchwinkt, fällt damit auf."""
    frames = _read_jsonl(_GOLDEN_DIR / "lifecycle.broken.jsonl")
    validator = _validator("lifecycle")
    with pytest.raises(AssertionError):
        for frame in frames:
            assert not list(validator.iter_errors(frame)), "seq fehlt — muss failen"


def test_missing_required_v_field_is_rejected() -> None:
    """Ein lifecycle-Frame ohne v.period_len verletzt das Schema (Pflichtfeld)."""
    validator = _validator("lifecycle")
    bad = {
        "t": 0, "stream": "lifecycle", "seq": 1,
        "v": {"kind": "sim_begin", "period_num": 0, "period_begin": 0},
    }
    assert list(validator.iter_errors(bad))


# ======================================================================
# Schema-Versionierung (O-5 / SPEC §6.4): meta.json trägt schema_version
# ======================================================================


def test_meta_json_carries_schema_version(tmp_path: Path) -> None:
    """O-5 / SPEC §6.4: meta.json trägt eine schema_version (Bump nur bei
    Breaking Change)."""
    from osim_engine.streaming.run_dir import write_meta

    write_meta(tmp_path, run_id="2026-05-29T12-00-00-0001")
    meta = json.loads((tmp_path / "meta.json").read_text(encoding="utf-8"))
    assert "schema_version" in meta
    # Major.Minor-Form (z.B. "1.0").
    major = meta["schema_version"].split(".")[0]
    assert major.isdigit()
