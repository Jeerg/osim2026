#!/usr/bin/env python3
"""OTX Roundtrip-Audit (Welle G19-D, User-Vorschlag 2026-05-24).

Lädt eine Original-OTX-Datei, schreibt sie via wire_to_otx zurück, und
vergleicht das Ergebnis mit dem Original. Wenn die Wire-Repräsentation
identisch ist (Object-Counts pro Klasse + alle m_l*-Container-Pointer +
alle sub_refs), ist der Roundtrip stabil. Sonst: konkret diff-Output.

Aufruf::

    docker exec osim-ui-api-1 python /workspace/osim-ui/scripts/otx_roundtrip_audit.py \\
      /workspace/osim-engine/engine/tests/fixtures/otx/Dummy.otx

Output (Erfolg):

    ✓ Roundtrip stabil: 1290 Objekte, 4 Pläne, 32 Knoten, 30 Kanten

Output (Fehler):

    ✗ Klass-Counts differieren: PDpKnAlternativ in original=5 roundtrip=0
    ✗ Plan 385 m_lKnoten: original=[417, 443, ...] roundtrip=[]
    ✗ Knoten 417 m_lKnotenOber: original=385 roundtrip=null
    ...
"""

from __future__ import annotations

import argparse
import sys
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any


def load_wire(otx_path: Path) -> Any:
    """Lädt eine OTX-Datei ins Wire-Format."""
    from app.services.otx_json_tree import load_to_wire

    return load_to_wire(otx_path)


def roundtrip(otx_path: Path) -> tuple[Any, Any, int, int]:
    """Original-OTX laden → Wire → OTX zurückschreiben → Wire neu laden.

    Returns: (original_wire, roundtrip_wire, orig_bytes, rt_bytes).
    """
    from app.services.otx_json_tree import load_to_wire, wire_to_otx

    original_wire = load_to_wire(otx_path)
    orig_bytes = otx_path.read_bytes()

    rt_text = wire_to_otx(original_wire, original_otx_path=otx_path)
    rt_bytes = rt_text.encode("latin-1")

    with tempfile.NamedTemporaryFile(mode="wb", suffix=".otx", delete=False) as tmp:
        tmp.write(rt_bytes)
        tmp_path = Path(tmp.name)
    try:
        rt_wire = load_to_wire(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)

    return original_wire, rt_wire, len(orig_bytes), len(rt_bytes)


def compare(orig: Any, rt: Any) -> list[str]:
    """Vergleicht zwei Wire-Trees attributweise. Liefert Liste von Diffs."""
    diffs: list[str] = []

    # 1. Total-Object-Count
    if len(orig.objects) != len(rt.objects):
        diffs.append(
            f"Object-Count: original={len(orig.objects)} roundtrip={len(rt.objects)}"
        )

    # 2. Klass-Verteilung
    orig_klasses = Counter(o.klass for o in orig.objects.values())
    rt_klasses = Counter(o.klass for o in rt.objects.values())
    for klass in set(orig_klasses.keys()) | set(rt_klasses.keys()):
        if orig_klasses[klass] != rt_klasses[klass]:
            diffs.append(
                f"Klass-Count {klass}: original={orig_klasses[klass]} "
                f"roundtrip={rt_klasses[klass]}"
            )

    # 3. Pro-Objekt-Attribute (für gemeinsame OIDs)
    common_oids = set(orig.objects.keys()) & set(rt.objects.keys())
    for oid in sorted(common_oids):
        oo = orig.objects[oid]
        ro = rt.objects[oid]
        if oo.klass != ro.klass:
            diffs.append(f"OID {oid} klass: original={oo.klass} roundtrip={ro.klass}")
            continue

        # m_l*-Container-Attribute (Listen) vergleichen
        for attr in oo.attrs:
            if not attr.startswith("m_l"):
                continue
            ov = oo.attrs.get(attr)
            rv = ro.attrs.get(attr)
            # Normalisiere: Single-int und Liste-mit-einem-int sind semantisch
            # gleich (Welle-9-LList-Resolution).
            if _normalize_list(ov) != _normalize_list(rv):
                diffs.append(
                    f"OID {oid} ({oo.klass}) {attr}: "
                    f"original={ov!r} roundtrip={rv!r}"
                )

        # sub_refs vergleichen
        if [list(b) for b in oo.sub_refs] != [list(b) for b in ro.sub_refs]:
            diffs.append(
                f"OID {oid} ({oo.klass}) sub_refs: "
                f"original={oo.sub_refs} roundtrip={ro.sub_refs}"
            )

    # 4. Fehlende OIDs
    only_orig = set(orig.objects.keys()) - set(rt.objects.keys())
    only_rt = set(rt.objects.keys()) - set(orig.objects.keys())
    if only_orig:
        diffs.append(f"OIDs nur in original: {sorted(only_orig)[:20]} (Sample)")
    if only_rt:
        diffs.append(f"OIDs nur in roundtrip: {sorted(only_rt)[:20]} (Sample)")

    return diffs


def _normalize_list(val: Any) -> list[int]:
    """Normalisiert Wire-attr-value zu sortierter int-Liste (semantischer Vgl)."""
    if val is None:
        return []
    if isinstance(val, int):
        return [val] if val > 0 else []
    if isinstance(val, list):
        return sorted(v for v in val if isinstance(v, int) and v > 0)
    return []


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("otx_path", type=Path, help="Pfad zur Original-OTX-Datei")
    parser.add_argument(
        "--max-diffs",
        type=int,
        default=50,
        help="Maximale Anzahl Diff-Zeilen im Output (Default: 50)",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Nur Summary, keine Details",
    )
    args = parser.parse_args()

    if not args.otx_path.exists():
        print(f"FEHLER: {args.otx_path} existiert nicht")
        return 2

    print(f"Roundtrip-Audit: {args.otx_path.name}")
    print("=" * 70)

    orig, rt, orig_bytes, rt_bytes = roundtrip(args.otx_path)

    print(f"Original-Bytes : {orig_bytes:>10,}")
    print(f"Roundtrip-Bytes: {rt_bytes:>10,}  ({rt_bytes / orig_bytes:.1%})")
    print(
        f"Original-Wire  : {len(orig.objects):>5} Objekte, "
        f"Coverage loaded={orig.coverage.loaded} skipped={orig.coverage.skipped}"
    )
    print(
        f"Roundtrip-Wire : {len(rt.objects):>5} Objekte, "
        f"Coverage loaded={rt.coverage.loaded} skipped={rt.coverage.skipped}"
    )

    diffs = compare(orig, rt)
    if not diffs:
        print()
        print("✓ Roundtrip semantisch stabil — alle m_l*-Container und sub_refs intakt")
        return 0

    print()
    print(f"✗ {len(diffs)} Diff(s) gefunden:")
    print("-" * 70)
    for d in diffs[: args.max_diffs]:
        print(f"  {d}")
    if len(diffs) > args.max_diffs:
        print(f"  ... weitere {len(diffs) - args.max_diffs} Diffs unterdrückt")
    return 1


if __name__ == "__main__":
    sys.exit(main())
