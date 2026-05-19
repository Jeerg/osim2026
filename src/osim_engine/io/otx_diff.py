"""Counter-Diff zwischen zwei OTX-Dateien (z.B. vor/nach Sim-Lauf).

Hintergrund: OIDs sind im OTX-Format **nicht stabil** zwischen Save-
Operationen — das `ObjectBase`-Serializer-Verhalten weist OIDs beim
Speichern neu zu. Daher arbeiten wir mit `(klass, m_sName)` als
Identitäts-Schlüssel.

Hauptfunktion: `diff_counters(file_a, file_b)` liefert einen strukturierten
`OtxCounterDiff` mit allen geänderten Counter-Feldern (`m_iPtk*` /
`m_dPtk*`) sowie Hinweisen auf nicht-matchende Objekte.

Verwendung im Golden-File-Workflow:
    1. C++-Run produziert `post.otx` (mit Counter-Werten)
    2. Python-Sim produziert eigenes `python.otx` (selber Schreib-Pfad)
    3. `diff_counters(cpp_post, python_post)` → idealerweise leer
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from osim_engine.io.otx_reader import OtxFile, OtxObject


COUNTER_PREFIXES: tuple[str, ...] = ("m_iPtk", "m_dPtk")


# ----------------------------------------------------------------------
# Datenklassen
# ----------------------------------------------------------------------


ObjectKey = tuple[str, str]  # (klass, m_sName)


@dataclass(frozen=True)
class CounterChange:
    """Ein einzelnes Counter-Feld eines Objekts, das sich unterscheidet."""
    klass: str
    name: str
    attr: str
    value_a: Any
    value_b: Any


@dataclass
class OtxCounterDiff:
    """Strukturierter Diff zwischen zwei OTX-Counter-Snapshots."""
    changes: list[CounterChange] = field(default_factory=list)
    # Objekte, die nur in einer Datei vorkommen (Modell-Struktur-Mismatch)
    only_in_a: list[ObjectKey] = field(default_factory=list)
    only_in_b: list[ObjectKey] = field(default_factory=list)
    # (klass, name)-Kollisionen — gleiche Identität mehrfach in einer Datei.
    # Bei diesen werden Diffs übersprungen, weil unklar ist welche Instanz
    # mit welcher zu vergleichen ist.
    collisions_a: list[ObjectKey] = field(default_factory=list)
    collisions_b: list[ObjectKey] = field(default_factory=list)

    @property
    def is_clean(self) -> bool:
        """True, wenn die beiden Snapshots Counter-identisch sind."""
        return (
            not self.changes
            and not self.only_in_a
            and not self.only_in_b
        )

    def summary(self) -> str:
        lines = [
            f"Counter-Diff: {len(self.changes)} Änderungen, "
            f"{len(self.only_in_a)} nur in A, {len(self.only_in_b)} nur in B"
        ]
        if self.collisions_a or self.collisions_b:
            lines.append(
                f"  Kollisionen ignoriert: A={len(self.collisions_a)}, "
                f"B={len(self.collisions_b)}"
            )
        return "\n".join(lines)


# ----------------------------------------------------------------------
# Implementierung
# ----------------------------------------------------------------------


def _is_counter_attr(name: str) -> bool:
    return name.startswith(COUNTER_PREFIXES)


def extract_counters(file: OtxFile) -> tuple[
    dict[ObjectKey, dict[str, Any]], list[ObjectKey]
]:
    """Aus einer OTX-Datei alle `(klass, name) → {counter: value}`-Maps
    sowie die Liste der mehrfach belegten Schlüssel (Kollisionen).

    Objekte ohne `m_sName` oder ohne Counter-Felder werden ignoriert.
    """
    by_name: dict[ObjectKey, dict[str, Any]] = {}
    seen_count: dict[ObjectKey, int] = defaultdict(int)
    collisions: list[ObjectKey] = []

    for obj in file.by_oid.values():
        name = obj.attrs.get("m_sName")
        if not isinstance(name, str) or not name:
            continue
        counters = {
            k: v for k, v in obj.attrs.items() if _is_counter_attr(k)
        }
        if not counters:
            continue
        key: ObjectKey = (obj.klass, name)
        seen_count[key] += 1
        if seen_count[key] == 1:
            by_name[key] = counters
        elif seen_count[key] == 2:
            # Erstes Duplikat — Kollision dokumentieren + Eintrag entfernen,
            # damit wir nicht versehentlich gegen den falschen Counter diffen.
            collisions.append(key)
            del by_name[key]

    return by_name, collisions


def diff_counters(file_a: OtxFile, file_b: OtxFile) -> OtxCounterDiff:
    """Vergleicht die Counter-Vektoren zweier OTX-Dateien.

    Schlüssel: `(klass, m_sName)`. Bei Kollisionen in einer der beiden
    Dateien wird das betroffene Objekt aus dem Diff ausgeschlossen und
    in `collisions_a` / `collisions_b` gemeldet.
    """
    a_counters, a_colls = extract_counters(file_a)
    b_counters, b_colls = extract_counters(file_b)

    diff = OtxCounterDiff(collisions_a=a_colls, collisions_b=b_colls)

    a_keys = set(a_counters.keys())
    b_keys = set(b_counters.keys())

    # Schlüssel nur in A bzw. nur in B
    diff.only_in_a = sorted(a_keys - b_keys)
    diff.only_in_b = sorted(b_keys - a_keys)

    # Gemeinsame Schlüssel — Counter-Werte vergleichen
    for key in sorted(a_keys & b_keys):
        klass, name = key
        a_attrs = a_counters[key]
        b_attrs = b_counters[key]
        all_attrs = sorted(set(a_attrs.keys()) | set(b_attrs.keys()))
        for attr in all_attrs:
            v_a = a_attrs.get(attr)
            v_b = b_attrs.get(attr)
            if v_a != v_b:
                diff.changes.append(
                    CounterChange(
                        klass=klass, name=name, attr=attr,
                        value_a=v_a, value_b=v_b,
                    )
                )

    return diff


def extract_counters_from_simulator(
    sim: Any,
) -> dict[ObjectKey, dict[str, Any]]:
    """Counter-Snapshot eines Python-PSimulators im gleichen Format wie
    `extract_counters(OtxFile)` — für direkte Python ↔ C++ Vergleiche.

    Sammelt rekursiv aus: m_lAusl, m_lDlpl (+m_lKnoten, +m_lKanten),
    m_lRessBeleg, m_lEinsatz.
    """
    out: dict[ObjectKey, dict[str, Any]] = {}
    seen: set[int] = set()

    def collect(py_obj: Any) -> None:
        if py_obj is None or id(py_obj) in seen:
            return
        seen.add(id(py_obj))
        name = getattr(py_obj, "m_sName", None)
        if not isinstance(name, str) or not name:
            return
        counters = {
            k: v for k, v in vars(py_obj).items() if _is_counter_attr(k)
        }
        if counters:
            out[(type(py_obj).__name__, name)] = counters

    for a in sim.m_lAusl:
        collect(a)
    for p in sim.m_lDlpl:
        collect(p)
        for k in p.m_lKnoten:
            collect(k)
        for ka in p.m_lKanten:
            collect(ka)
    for r in sim.m_lRessBeleg:
        collect(r)
    for e in sim.m_lEinsatz:
        collect(e)
    return out


@dataclass
class PyCppDiff:
    """Vergleich zwischen Python-Sim und C++-Sim-Counter-Snapshot."""
    real_diffs: list[CounterChange] = field(default_factory=list)
    """Counter mit verschiedenen Werten (beide Seiten kennen das Feld)."""

    py_missing_attrs: list[CounterChange] = field(default_factory=list)
    """Counter, die Python NICHT hat aber C++ schon — Lücken in Python."""

    common_keys: int = 0
    only_in_py: list[ObjectKey] = field(default_factory=list)
    only_in_cpp: list[ObjectKey] = field(default_factory=list)


def diff_python_vs_cpp(
    py_counters: dict[ObjectKey, dict[str, Any]],
    cpp_counters: dict[ObjectKey, dict[str, Any]],
) -> PyCppDiff:
    """Trennt echte Verhaltens-Diffs von Python-Implementations-Lücken.

    Wenn Python das Attribut gar nicht hat (`None`) und C++ den
    Default-Wert (`0` / `0.0`), klassifizieren wir das als Lücke
    (`py_missing_attrs`), nicht als Verhaltens-Diff (`real_diffs`).
    """
    diff = PyCppDiff()
    py_keys = set(py_counters.keys())
    cpp_keys = set(cpp_counters.keys())
    diff.common_keys = len(py_keys & cpp_keys)
    diff.only_in_py = sorted(py_keys - cpp_keys)
    diff.only_in_cpp = sorted(cpp_keys - py_keys)

    for key in sorted(py_keys & cpp_keys):
        klass, name = key
        py_c = py_counters[key]
        cpp_c = cpp_counters[key]
        for attr in sorted(set(py_c) | set(cpp_c)):
            v_py = py_c.get(attr)
            v_cpp = cpp_c.get(attr)
            if v_py == v_cpp:
                continue
            change = CounterChange(
                klass=klass, name=name, attr=attr,
                value_a=v_py, value_b=v_cpp,
            )
            # Python kennt das Attribut nicht und C++ hat Default → Lücke
            if v_py is None and v_cpp in (0, 0.0):
                diff.py_missing_attrs.append(change)
            else:
                diff.real_diffs.append(change)

    return diff


def diff_counters_text(diff: OtxCounterDiff, limit: int | None = 20) -> str:
    """Formatiert einen `OtxCounterDiff` als menschen-lesbaren Text.

    `limit` begrenzt die Anzahl gelisteter Änderungen (None = alle).
    """
    lines = [diff.summary()]
    shown = diff.changes if limit is None else diff.changes[:limit]
    for c in shown:
        lines.append(
            f"  {c.klass:24} {c.name!r:30} {c.attr}: {c.value_a} -> {c.value_b}"
        )
    if limit is not None and len(diff.changes) > limit:
        lines.append(f"  ... ({len(diff.changes) - limit} weitere)")
    if diff.only_in_a:
        lines.append(f"  Nur in A: {diff.only_in_a[:5]}")
    if diff.only_in_b:
        lines.append(f"  Nur in B: {diff.only_in_b[:5]}")
    return "\n".join(lines)
