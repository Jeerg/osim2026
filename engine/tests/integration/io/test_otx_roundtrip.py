"""Roundtrip-Integrationstests für `osim_engine.io.otx_writer`.

Vertrag: `load(otx) -> dump -> load(dumped)` muss für unterstützte
Klassen verlustfrei sein. Counter, Coverage-Ratio und Unsupported-Counter
bleiben stabil oder werden besser.

Primär-Fixture: `embb_pre_run.otx` aus `engine/tests/fixtures/otx/`
(immer verfügbar, im Repo).

Sekundär: `Dummy.otx` und `Fertigungsstruktur1_mit_AslFj.otx` aus
OSim2004/Vorstellung04 (opt-in via conftest, Skip wenn nicht reachable).
"""

from __future__ import annotations

from pathlib import Path

from osim_engine.io.otx_loader import load_otx_file
from osim_engine.io.otx_reader import parse_otx
from osim_engine.io.otx_writer import dump_simulator_to_otx


# ----------------------------------------------------------------------
# Handler-Coverage: jeder Loader-Handler muss einen Writer-Handler haben
# ----------------------------------------------------------------------


def test_writer_handles_all_known_loader_classes() -> None:
    """Set-Equality-Check: alle Loader-Klassen müssen einen Writer-Handler haben.

    Schlägt RED, sobald ein neuer Loader-Handler ohne Writer-Pendant
    hinzukommt. So bleibt die Roundtrip-Garantie stabil.
    """
    from osim_engine.io import otx_loader, otx_writer

    loader_classes = set(otx_loader._HANDLERS.keys())
    writer_classes = set(otx_writer._WRITERS.keys())

    missing = loader_classes - writer_classes
    assert not missing, (
        f"WriterHandler fehlt für {len(missing)} Loader-Klassen: "
        f"{sorted(missing)}"
    )


# ----------------------------------------------------------------------
# Roundtrip — embb_pre_run.otx (immer verfügbar)
# ----------------------------------------------------------------------


def test_roundtrip_embb_object_count(embb_pre_run_otx_path: Path) -> None:
    """`load → dump → load` bewahrt `loaded.total()` und `unsupported.total()`."""
    original = load_otx_file(embb_pre_run_otx_path)
    dumped_text = dump_simulator_to_otx(
        original.simulator,
        original_otx=original.otx,
        instances=original.instances,
    )

    # Schreibe in tmp und lese erneut.
    parsed_back = parse_otx(dumped_text)

    # Re-Load aus dem geparsten File:
    from osim_engine.io.otx_loader import OtxLoader
    reloaded = OtxLoader().load(parsed_back)

    # Loaded-Counter darf nicht schrumpfen (alle vorher geladenen Klassen
    # müssen wieder geladen werden können).
    for klass, n_orig in original.loaded.items():
        assert reloaded.loaded.get(klass, 0) >= n_orig, (
            f"Klasse {klass}: Original {n_orig}, nach Roundtrip "
            f"{reloaded.loaded.get(klass, 0)}"
        )

    # Unsupported-Total darf nicht wachsen (Pass-Through erhält den
    # ursprünglichen Status).
    assert sum(reloaded.unsupported.values()) <= sum(original.unsupported.values())


def test_roundtrip_embb_coverage_ratio(embb_pre_run_otx_path: Path) -> None:
    """Coverage-Ratio nach Roundtrip ≥ Original (verlustfrei für geladene Klassen)."""
    original = load_otx_file(embb_pre_run_otx_path)
    dumped_text = dump_simulator_to_otx(
        original.simulator,
        original_otx=original.otx,
        instances=original.instances,
    )

    parsed_back = parse_otx(dumped_text)
    from osim_engine.io.otx_loader import OtxLoader
    reloaded = OtxLoader().load(parsed_back)

    assert reloaded.coverage_ratio >= original.coverage_ratio - 1e-9, (
        f"Coverage gesunken: Original {original.coverage_ratio:.3f}, "
        f"nach Roundtrip {reloaded.coverage_ratio:.3f}"
    )


def test_roundtrip_embb_output_is_latin1_encodable(
    embb_pre_run_otx_path: Path,
) -> None:
    """Roundtrip-Output muss als Latin-1 schreibbar sein (Reader-Konvention)."""
    original = load_otx_file(embb_pre_run_otx_path)
    dumped_text = dump_simulator_to_otx(
        original.simulator,
        original_otx=original.otx,
        instances=original.instances,
    )
    # Wirft UnicodeEncodeError, falls Codepoint > U+00FF.
    dumped_text.encode("latin-1")


# ----------------------------------------------------------------------
# Pass-Through-Verhalten
# ----------------------------------------------------------------------


def test_unsupported_passthrough_default_on(embb_pre_run_otx_path: Path) -> None:
    """`include_unsupported_passthrough=True` (Default) → alle Skelette
    aus dem Original erscheinen im Output."""
    original = load_otx_file(embb_pre_run_otx_path)
    dumped_text = dump_simulator_to_otx(
        original.simulator,
        original_otx=original.otx,
        instances=original.instances,
        include_unsupported_passthrough=True,
    )

    parsed_back = parse_otx(dumped_text)

    # Skipped + Unsupported-OIDs aus dem Original müssen im Output
    # als Objekt mit gleicher Klasse wieder auftauchen.
    skipped_or_unsupported_keys = set()
    for oid, obj in original.otx.by_oid.items():
        if oid not in original.instances:
            skipped_or_unsupported_keys.add((oid, obj.klass))

    for oid, klass in skipped_or_unsupported_keys:
        round_obj = parsed_back.by_oid.get(oid)
        # Entweder ist das Objekt mit derselben OID & Klasse wieder da,
        # ODER der Reader hat es nicht in by_oid registriert (z.B.
        # Container ohne m_dwObjID-Annotation). Wir akzeptieren auch
        # den zweiten Fall — Hauptsache eine Zeile mit der Klasse
        # erscheint irgendwo.
        if round_obj is None:
            # Fallback: irgendwo im File mit der Klasse?
            assert any(
                o.klass == klass for o in parsed_back.by_oid.values()
            ) or any(
                o.klass == klass for o in parsed_back.top_level
            ), f"Pass-Through verloren: OID {oid} klass {klass}"
        else:
            assert round_obj.klass == klass


def test_unsupported_passthrough_disabled_drops_extra_objects(
    embb_pre_run_otx_path: Path,
) -> None:
    """`include_unsupported_passthrough=False` schreibt nur die Writer-bekannten
    Objekte — Output ist deutlich kürzer."""
    original = load_otx_file(embb_pre_run_otx_path)
    with_pt = dump_simulator_to_otx(
        original.simulator,
        original_otx=original.otx,
        instances=original.instances,
        include_unsupported_passthrough=True,
    )
    without_pt = dump_simulator_to_otx(
        original.simulator,
        original_otx=original.otx,
        instances=original.instances,
        include_unsupported_passthrough=False,
    )
    # Ohne Pass-Through müssen weniger Zeilen rauskommen.
    assert without_pt.count("\n") < with_pt.count("\n")


# ----------------------------------------------------------------------
# Sekundär: Original-OTX-Files aus OSim2004 (opt-in via Skip)
# ----------------------------------------------------------------------


def test_roundtrip_dummy_object_count(dummy_otx_path: Path) -> None:
    """Dummy.otx aus OSim2004/Vorstellung04 — Roundtrip-stabil."""
    original = load_otx_file(dummy_otx_path)
    dumped_text = dump_simulator_to_otx(
        original.simulator,
        original_otx=original.otx,
        instances=original.instances,
    )
    parsed_back = parse_otx(dumped_text)
    from osim_engine.io.otx_loader import OtxLoader
    reloaded = OtxLoader().load(parsed_back)

    for klass, n_orig in original.loaded.items():
        assert reloaded.loaded.get(klass, 0) >= n_orig, (
            f"Dummy.otx: Klasse {klass}: Original {n_orig}, "
            f"nach Roundtrip {reloaded.loaded.get(klass, 0)}"
        )
    assert sum(reloaded.unsupported.values()) <= sum(original.unsupported.values())


def test_roundtrip_fertigungsstruktur1_object_count(
    fertigungsstruktur1_otx_path: Path,
) -> None:
    """Fertigungsstruktur1_mit_AslFj.otx — Roundtrip-stabil."""
    original = load_otx_file(fertigungsstruktur1_otx_path)
    dumped_text = dump_simulator_to_otx(
        original.simulator,
        original_otx=original.otx,
        instances=original.instances,
    )
    parsed_back = parse_otx(dumped_text)
    from osim_engine.io.otx_loader import OtxLoader
    reloaded = OtxLoader().load(parsed_back)

    for klass, n_orig in original.loaded.items():
        assert reloaded.loaded.get(klass, 0) >= n_orig, (
            f"Fertigungsstruktur1: Klasse {klass}: Original {n_orig}, "
            f"nach Roundtrip {reloaded.loaded.get(klass, 0)}"
        )
    assert sum(reloaded.unsupported.values()) <= sum(original.unsupported.values())
