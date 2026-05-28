"""Misst Coverage und Roundtrip-Fitness für die drei kanonischen OSim2004-Test-OTX-Files.

Output: ``docs/engine-coverage.md`` (Markdown-Tabelle, manuell editierbare
„Konsequenz pro Modell"-Sektion bleibt erhalten).

Verwendung:
    uv run python scripts/otx_coverage_report.py

Re-Run nach Engine-Änderungen, um Coverage-Drift zu erkennen. Skript ist
idempotent: die `## Coverage Matrix`-Sektion wird bei jedem Lauf neu
geschrieben, die `## Konsequenz pro Modell für Phase 1`-Sektion bleibt
unverändert (Editor-Hoheit).
"""

from __future__ import annotations

import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


# Repo-root unbedingt an sys.path[0] schieben. Wichtig: NICHT nur per
# „append wenn fehlt"-Pattern — REPO_ROOT kann via uv-editable bereits weiter
# hinten in sys.path stehen, während ein externer PYTHONPATH-Eintrag (z.B.
# .../3fls/backend) ein konkurrierendes `tests`-Package an niedrigerer Position
# shadowt. Wir entfernen REPO_ROOT überall und prependen es deshalb fest.
REPO_ROOT = Path(__file__).resolve().parent.parent
_repo_root_str = str(REPO_ROOT)
sys.path = [p for p in sys.path if p != _repo_root_str]
sys.path.insert(0, _repo_root_str)

# Räume etwaige bereits importierte konkurrierende `tests`-Module aus dem
# Cache; falls eine vorherige Import-Resolution sie an einen falschen Pfad
# gebunden hat, würde der nächste Import sonst diesen Cache wiederverwenden.
for _modname in list(sys.modules):
    if _modname == "tests" or _modname.startswith("tests."):
        sys.modules.pop(_modname, None)

from tests.backend.fixtures.otx_models import ALL_TEST_OTX  # noqa: E402

from osim_engine.io.otx_loader import LoadResult, load_otx_file  # noqa: E402
from osim_engine.io.otx_reader import OtxFile, parse_otx_file  # noqa: E402
from osim_engine.io.otx_writer import dump_simulator_to_otx  # noqa: E402


COVERAGE_DOC = REPO_ROOT / "docs" / "engine-coverage.md"

# Marker für die maschinen-geschriebene Tabellensektion (alles dazwischen
# wird beim Re-Lauf überschrieben).
_MATRIX_BEGIN = "<!-- COVERAGE-MATRIX:BEGIN -->"
_MATRIX_END = "<!-- COVERAGE-MATRIX:END -->"


def measure(path: Path) -> dict[str, Any]:
    """Messe Loader-Coverage + Writer-Roundtrip für ein OTX-File.

    Returns dict mit:
        file: Dateiname
        size_bytes: Größe der Datei in Bytes
        coverage_ratio: Loader-Coverage 0.0..1.0
        classes_loaded: Anzahl OID-Instanzen geladen
        classes_skipped: Anzahl bewusst übersprungener Instanzen (UI/Grafik)
        classes_unsupported: Anzahl Instanzen ohne Handler
        roundtrip_ok: True wenn set(by_oid) identisch nach Re-Parse
        oid_diff_count: |original ⊖ roundtrip|
        missing_oids: Anzahl OIDs die im Roundtrip fehlen
        extra_oids: Anzahl OIDs die der Roundtrip zusätzlich erzeugt
        error: optional, Exception-Repr wenn Loader/Writer/Reader failt
    """
    info: dict[str, Any] = {
        "file": path.name,
        "size_bytes": path.stat().st_size if path.exists() else 0,
        "coverage_ratio": 0.0,
        "classes_loaded": 0,
        "classes_skipped": 0,
        "classes_unsupported": 0,
        "roundtrip_ok": False,
        "oid_diff_count": 0,
        "missing_oids": 0,
        "extra_oids": 0,
        "error": None,
    }
    if not path.exists():
        info["error"] = f"FileNotFoundError: {path}"
        return info

    try:
        loaded: LoadResult = load_otx_file(path)
    except Exception as exc:  # noqa: BLE001
        info["error"] = f"load_otx_file: {type(exc).__name__}: {exc}"
        return info

    info["coverage_ratio"] = float(loaded.coverage_ratio)
    info["classes_loaded"] = int(sum(loaded.loaded.values()))
    info["classes_skipped"] = int(sum(loaded.skipped.values()))
    info["classes_unsupported"] = int(sum(loaded.unsupported.values()))

    try:
        text = dump_simulator_to_otx(
            loaded.simulator,
            original_otx=loaded.otx,
            instances=loaded.instances,
            include_unsupported_passthrough=True,
        )
        tmp = tempfile.NamedTemporaryFile(suffix=".otx", delete=False, mode="wb")
        try:
            tmp.write(text.encode("latin-1"))
            tmp.close()
            roundtrip: OtxFile = parse_otx_file(tmp.name)
        finally:
            try:
                os.unlink(tmp.name)
            except OSError:
                pass
    except Exception as exc:  # noqa: BLE001
        info["error"] = f"writer/re-parse: {type(exc).__name__}: {exc}"
        return info

    original_oids = set(loaded.otx.by_oid.keys())
    roundtrip_oids = set(roundtrip.by_oid.keys())
    missing = original_oids - roundtrip_oids
    extra = roundtrip_oids - original_oids
    info["roundtrip_ok"] = (not missing) and (not extra)
    info["missing_oids"] = len(missing)
    info["extra_oids"] = len(extra)
    info["oid_diff_count"] = len(missing) + len(extra)
    return info


def _format_size(size_bytes: int) -> str:
    if size_bytes < 1024:
        return f"{size_bytes} B"
    if size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    return f"{size_bytes / (1024 * 1024):.1f} MB"


def _format_row(info: dict[str, Any]) -> str:
    # ASCII-safe Marker: cp1252-Stdout auf Windows kann U+2713/U+2717 nicht
    # encoden. Markdown rendert "OK"/"FAIL" lesbar; Tabellen-Alignment via
    # `:---:` bleibt erhalten.
    rt_ok = "OK" if info["roundtrip_ok"] else "FAIL"
    err_suffix = f" — {info['error']}" if info["error"] else ""
    consequence_hint = _consequence_hint(info)
    return (
        f"| {info['file']} "
        f"| {_format_size(info['size_bytes'])} "
        f"| {info['coverage_ratio']:.4f} "
        f"| {info['classes_loaded']} "
        f"| {info['classes_skipped']} "
        f"| {info['classes_unsupported']} "
        f"| {rt_ok} "
        f"| {info['oid_diff_count']}{err_suffix} "
        f"| {consequence_hint} |"
    )


def _consequence_hint(info: dict[str, Any]) -> str:
    """Ableitung der Phase-1-Konsequenz aus den Messwerten.

    - coverage_ratio == 1.0 UND roundtrip_ok → "editable"
    - coverage_ratio < 1.0 ODER NICHT roundtrip_ok → "read-only"
    - error → "excluded"
    """
    if info["error"]:
        return "**excluded** (Fehler)"
    if info["coverage_ratio"] >= 1.0 and info["roundtrip_ok"]:
        return "**editable**"
    return "**read-only**"


def _render_matrix(rows: list[dict[str, Any]]) -> str:
    """Render die maschinen-geschriebene Tabellen-Sektion (zwischen den Markern)."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    header = (
        "| Datei | Größe | coverage_ratio | geladen | skipped | unsupp. "
        "| Roundtrip OK? | OID-Diff | Konsequenz für Phase 1 |\n"
        "|-------|-------|---------------:|--------:|--------:|--------:"
        "|:-------------:|---------:|:-----------------------|"
    )
    body = "\n".join(_format_row(r) for r in rows)
    footer = f"\n\n*Letzte Messung: {now} via `scripts/otx_coverage_report.py`*"
    return f"{_MATRIX_BEGIN}\n{header}\n{body}{footer}\n{_MATRIX_END}"


def _initial_template() -> str:
    """Initialer Doc-Inhalt, wenn ``docs/engine-coverage.md`` noch nicht existiert."""
    return (
        "# osim-engine OTX-Roundtrip-Coverage\n\n"
        "Persistenter Bericht: pro Test-OTX → ``coverage_ratio``, "
        "Roundtrip-OK/FAIL, Konsequenz für Phase 1.\n\n"
        "Regeneriert via ``uv run python scripts/otx_coverage_report.py``.\n\n"
        "## Coverage Matrix\n\n"
        f"{_MATRIX_BEGIN}\n(noch keine Messung — `python scripts/otx_coverage_report.py` ausführen)\n{_MATRIX_END}\n\n"
        "## Konsequenz pro Modell für Phase 1\n\n"
        "(wird nach erstem Skript-Lauf manuell gefüllt; bleibt bei Re-Läufen erhalten)\n\n"
        "## Re-Messung\n\n"
        "Bei jeder Änderung an `osim-engine/io/otx_writer.py` oder `otx_loader.py` "
        "neu messen:\n\n"
        "```bash\n"
        "uv run python scripts/otx_coverage_report.py\n"
        "```\n\n"
        "Nur die `## Coverage Matrix`-Sektion (zwischen den `COVERAGE-MATRIX`-Markern) "
        "wird überschrieben. Die `## Konsequenz pro Modell für Phase 1`-Sektion bleibt "
        "unter Editor-Hoheit.\n"
    )


def _update_doc(rendered_matrix: str) -> None:
    """Ersetzt die Coverage-Matrix-Sektion in ``docs/engine-coverage.md``.

    Falls die Datei oder die Marker nicht existieren, wird ein vollständiges
    Template erzeugt.
    """
    COVERAGE_DOC.parent.mkdir(parents=True, exist_ok=True)

    if not COVERAGE_DOC.exists():
        content = _initial_template()
        COVERAGE_DOC.write_text(content, encoding="utf-8")

    current = COVERAGE_DOC.read_text(encoding="utf-8")

    if _MATRIX_BEGIN in current and _MATRIX_END in current:
        before = current.split(_MATRIX_BEGIN, 1)[0]
        after = current.split(_MATRIX_END, 1)[1]
        new_content = before + rendered_matrix + after
    else:
        # Marker fehlen — Datei existiert vermutlich, aber wurde editiert.
        # Append eine neue Coverage-Matrix-Sektion an das Doc-Ende.
        new_content = current.rstrip() + "\n\n## Coverage Matrix (auto-generated)\n\n" + rendered_matrix + "\n"

    COVERAGE_DOC.write_text(new_content, encoding="utf-8")


def main() -> int:
    """Misst alle drei Test-OTX-Files und schreibt nach docs/engine-coverage.md."""
    rows: list[dict[str, Any]] = []
    for path in ALL_TEST_OTX:
        print(f"Messe {path.name} ...", flush=True)
        info = measure(path)
        rows.append(info)
        print(
            f"  coverage_ratio={info['coverage_ratio']:.4f} "
            f"roundtrip_ok={info['roundtrip_ok']} "
            f"oid_diff={info['oid_diff_count']} "
            f"error={info['error']}"
        )

    rendered = _render_matrix(rows)
    _update_doc(rendered)
    print(f"\nBericht aktualisiert: {COVERAGE_DOC.relative_to(REPO_ROOT)}")

    # Markdown-Tabelle auch nach stdout für CI-Logs. Defensiv gegen
    # cp1252-Stdout-Encoding auf Windows: bei Encode-Fehler einfach
    # auf ASCII zurückfallen (Doc-Datei ist UTF-8 und schon geschrieben).
    print()
    try:
        print(rendered)
    except UnicodeEncodeError:
        print(rendered.encode("ascii", errors="replace").decode("ascii"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
