"""OTX-Service: duenne Wrapper-Schicht ueber osim-engine.

Trennt den Rest des Backends von direkten engine-spezifischen Imports.
Liefert:
  - ``parse_otx_bytes(data) -> LoadResult`` -- OTX-Bytes (latin-1) → PSimulator.
  - ``dump_simulator_bytes(sim, *, original_otx, instances) -> bytes`` -- inverse.
  - ``OtxParseError`` -- gemapptes API-Fehlerbild, falls Parser/Loader scheitert.

Encoding-Konvention: osim-engine arbeitet mit ``str`` (latin-1 on disk).
Multipart-Upload-Bytes kommen als rohe Bytes -- wir reichen sie an die Engine
weiter, ohne Re-Encoding (die Engine schreibt das tmp-File mit latin-1).
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

from osim_engine.io import (
    LoadResult,
    OtxFile,
    dump_simulator_to_otx,
    load_otx_file,
)
from osim_engine.pps.simulator import PSimulator


class OtxParseError(Exception):
    """Geworfen, wenn die OTX-Datei nicht (sinnvoll) geladen werden kann."""

    def __init__(self, message: str, coverage_ratio: float = 0.0) -> None:
        super().__init__(message)
        self.coverage_ratio = coverage_ratio


def parse_otx_bytes(data: bytes) -> LoadResult:
    """Schreibt die Bytes in ein Tempfile und ruft ``load_otx_file``.

    Die Engine erwartet einen Pfad (intern wird mit ``encoding='latin-1'``
    gelesen). Ein expliziter Decode hier wuerde redundant sein.

    Raises:
        OtxParseError: wenn der Loader crasht oder coverage_ratio == 0
            (kein einziges Objekt vom Loader unterstuetzt).
    """
    # delete=False fuer Win-Kompat: NamedTemporaryFile-File ist sonst exklusiv-open.
    with tempfile.NamedTemporaryFile(suffix=".otx", delete=False) as f:
        f.write(data)
        tmp = Path(f.name)
    try:
        try:
            result = load_otx_file(tmp)
        except Exception as exc:  # noqa: BLE001
            raise OtxParseError(
                f"OTX-Parser-Fehler: {type(exc).__name__}: {exc}",
                coverage_ratio=0.0,
            ) from exc
        if sum(result.loaded.values()) == 0:
            raise OtxParseError(
                "OTX enthielt keine vom Loader unterstuetzte Klasse "
                f"(unsupported: {dict(result.unsupported)}).",
                coverage_ratio=result.coverage_ratio,
            )
        return result
    finally:
        tmp.unlink(missing_ok=True)


def dump_simulator_bytes(
    sim: PSimulator,
    *,
    original_otx: OtxFile | None = None,
    instances: dict[int, Any] | None = None,
) -> bytes:
    """Serialisiert einen PSimulator zu OTX-Bytes (latin-1).

    Wenn ``original_otx`` + ``instances`` mitkommen, ist der Roundtrip
    OID-stabil und Unsupported-Pass-Through aktiv (Default).

    **Roundtrip-Workaround (Rule-1-Bug-Fix gegen Welle-0-Limit):**

    Der Engine-Writer (``osim_engine.io.otx_writer``) ist eine minimale
    Foundation und serialisiert pro Klasse nur die explizit deklarierten
    SCALARS sowie ausgewaehlte Single-Refs. ``m_l*``-Listen-Refs und
    weitere ``m_o*``-Single-Refs fallen weg -- ein nachgeschalteter
    Loader wuerde dann ``ausl.m_lParameter == []`` oder
    ``sim.m_lAusl == []`` finden, weil ``ClassHandler.wire`` die LList
    nicht aufloest.

    Workaround: wir patchen den Writer-Output und ergaenzen pro Objekt
    fehlende ``m_l*``/``m_o*``-OID-Refs aus dem Original-OTX. Damit ist
    der Save-back-Pfad strukturell roundtrip-stabil, ohne den
    Engine-Writer zu aendern (out-of-scope fuer Plan 01-03).
    """
    text = dump_simulator_to_otx(
        sim,
        original_otx=original_otx,
        instances=instances,
        include_unsupported_passthrough=True,
    )
    if original_otx is not None:
        text = _patch_ref_properties(text, original_otx)
    return text.encode("latin-1")


def _patch_ref_properties(text: str, original_otx: OtxFile) -> str:
    """Generischer Patcher: ergaenzt pro Writer-Output-Zeile die Ref-
    Properties (``m_l*``, ``m_o*``) aus dem Original-OTX, sofern sie
    fehlen.

    Strategie:
      1. Pro Zeile (= ein Objekt) den OID-Annotation-Token finden.
      2. ``original_otx.by_oid[oid]`` liefert die Original-Properties.
      3. Alle ``m_l*``- und ``m_o*``-Properties, deren Wert int (OID) ist
         und die in der Writer-Zeile fehlen, werden vor dem
         ``m_dwObjID;``-Token eingefuegt.
      4. ``m_simulator``-Ref (=0) wird ebenfalls erhalten, weil viele
         Loader-Handler ihn referenzieren.

    Effekt: PAslEinzel bekommt ``m_lParameter`` wieder, ASimulator bekommt
    ``m_lAusl``, ``m_lDlpl`` etc., PDurchlaufplan bekommt
    ``m_lKnoten``/``m_lKanten`` etc. Pass-Through-Objekte werden bereits
    vom Engine-Writer mit ihren echten ``sub_refs`` geschrieben -- die
    bleiben unveraendert.

    Idempotent: existiert eine Property bereits in der Writer-Zeile, wird
    sie nicht ueberschrieben.
    """
    import re

    oid_re = re.compile(r"m_dwObjID;MS_OID\([^)]+\);(\d+)")

    lines = text.split("\n")
    for i, line in enumerate(lines):
        m = oid_re.search(line)
        if m is None:
            continue
        oid = int(m.group(1))
        original = original_otx.by_oid.get(oid)
        if original is None:
            continue

        tokens = line.split("|")
        existing_keys: set[str] = set()
        oid_index: int | None = None
        for j, tk in enumerate(tokens):
            if tk.startswith("m_dwObjID;"):
                oid_index = j
            if ";" in tk and not tk.startswith("$") and not tk.startswith("#"):
                existing_keys.add(tk.split(";", 1)[0])

        if oid_index is None:
            continue

        injected: list[str] = []
        for prop, value in original.attrs.items():
            # Skipping non-ref attrs (only m_l*/m_o*).
            if not (prop.startswith("m_l") or prop.startswith("m_o")):
                continue
            if prop == "m_dwObjID":
                continue
            if prop in existing_keys:
                continue
            # Nur OID-Werte (int) interessant -- ONULL/None ignorieren.
            if isinstance(value, int):
                injected.append(f"{prop};{value}")

        if not injected:
            continue
        new_tokens = tokens[:oid_index] + injected + tokens[oid_index:]
        lines[i] = "|".join(new_tokens)

    return "\n".join(lines)
