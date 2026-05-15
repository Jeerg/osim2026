"""Explorative Probe: liest test.otx und gibt eine Übersicht über die Objekte."""

from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from osim_engine.io.otx_reader import parse_otx_file

OTX = Path(r"C:\Users\JörgWFischer\PycharmProjects\OSim2004\Vorstellung04\test.otx")


def main() -> None:
    f = parse_otx_file(OTX)
    print(f"declared_count: {f.declared_count}")
    print(f"top_level: {len(f.top_level)}")
    print(f"by_oid:    {len(f.by_oid)}")

    classes = Counter(o.klass for o in f.top_level)
    print("\nTop-Level-Klassen:")
    for cls, n in sorted(classes.items(), key=lambda kv: -kv[1]):
        print(f"  {n:>3}  {cls}")

    # Spezifisch alle relevanten Klassen ausgeben mit vollständigen Attributen
    targets = {"PDurchlaufplan", "PDpKnKonstant", "PDlplKante",
               "PDlplKnotenLList", "PDlplKanteLList",
               "PAslEinzel", "PAusloeser", "PGenerator"}
    print("\n=== Relevante Objekte (Domain) ===")
    for oid, obj in sorted(f.by_oid.items()):
        if obj.klass in targets:
            print(f"\nOID={oid} {obj.klass}")
            for k, v in obj.attrs.items():
                if not k.startswith("m_lViewInf") and not k.startswith("m_ClipboardInfo") \
                   and not k.startswith("m_IsSelected") and not k.startswith("m_dwObjID") \
                   and not k.startswith("m_pntRaster") and not k.startswith("m_iMaxInfo") \
                   and not k.startswith("m_iMinInfo") and not k.startswith("m_sUserString") \
                   and not k.startswith("m_iUserInt") and not k.startswith("m_dUserDouble"):
                    print(f"  {k:30s} = {v!r}")
            if obj.sub_refs:
                print(f"  sub_refs: {obj.sub_refs}")
            if obj.inline_children:
                print(f"  inline_children: {obj.inline_children}")


if __name__ == "__main__":
    main()
