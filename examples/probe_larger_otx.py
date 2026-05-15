"""Explorative Probe: liest dc1.otx (50 KB) und gibt eine Übersicht."""

from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from osim_engine.io.otx_mapper import map_otx_to_simmodel
from osim_engine.io.otx_reader import parse_otx_file

OTX = Path(r"C:\Users\JörgWFischer\PycharmProjects\OSim2004\Vorstellung04\dc1.otx")


def main() -> None:
    f = parse_otx_file(OTX)
    print(f"=== {OTX.name} ===")
    print(f"declared_count: {f.declared_count}")
    print(f"top_level: {len(f.top_level)}")
    print(f"by_oid:    {len(f.by_oid)}")

    classes = Counter(o.klass for o in f.by_oid.values())
    print("\nAlle Klassen:")
    for cls, n in sorted(classes.items(), key=lambda kv: -kv[1])[:25]:
        print(f"  {n:>3}  {cls}")

    # Mapping versuchen
    print("\n=== Mapping zu SimModel ===")
    model = map_otx_to_simmodel(f)
    print(f"  plans:    {len(model.plans)}")
    print(f"  triggers: {len(model.triggers)}")
    for p in model.plans:
        print(f"  Plan {p.id} '{p.name}': {len(p.nodes)} Knoten, {len(p.edges)} Kanten,"
              f" start={p.start_edge} end={p.end_edge}")
        if len(p.nodes) <= 20:
            for n in p.nodes:
                if hasattr(n, "duration"):
                    print(f"    Node {n.id} {n.name!r}: duration={n.duration}")
        if len(p.edges) <= 20:
            for e in p.edges:
                print(f"    Edge {e.id}: {e.predecessors} -> {e.successors}"
                      f" (transition={e.transition_time})")


if __name__ == "__main__":
    main()
