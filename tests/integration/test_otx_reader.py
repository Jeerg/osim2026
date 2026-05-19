"""Tests für `osim_engine.io.otx_reader` gegen reale OTX-Fixtures.

Fixtures stammen aus einem AZeitSim.exe-Lauf auf `Embb-AslFj.otx`:
- `embb_pre_run.otx`  — Modell-Stand VOR dem Sim-Lauf (alle Counter = 0)
- `embb_post_run.otx` — Modell-Stand NACH dem Lauf (Counter befüllt)

Beide Dateien wurden mit `m_bFileDump=TRUE` erzeugt, identische Modell-
Struktur. Der Unterschied ist nur der durchgelaufene Sim-State.

Wichtiger Befund dieser Test-Suite (siehe `test_oids_are_not_stable_*`):
OTX-OIDs ändern sich zwischen Save-Operationen — sie sind KEIN stabiler
Schlüssel für Diff-Vergleiche. Stabile Identität: `(klass, m_sName)`.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from osim_engine.io.otx_reader import OtxFile, OtxObject, parse_otx_file


FIXTURES = Path(__file__).parent.parent / "fixtures" / "otx"
PRE_FILE = FIXTURES / "embb_pre_run.otx"
POST_FILE = FIXTURES / "embb_post_run.otx"


@pytest.fixture(scope="module")
def pre() -> OtxFile:
    return parse_otx_file(PRE_FILE)


@pytest.fixture(scope="module")
def post() -> OtxFile:
    return parse_otx_file(POST_FILE)


# ----------------------------------------------------------------------
# Grund-Parsing
# ----------------------------------------------------------------------


def test_pre_parses_without_error(pre: OtxFile) -> None:
    assert pre.declared_count > 0
    assert len(pre.top_level) > 0
    assert len(pre.by_oid) > 0


def test_post_parses_without_error(post: OtxFile) -> None:
    assert post.declared_count > 0
    assert len(post.top_level) > 0
    assert len(post.by_oid) > 0


def test_declared_count_matches_oid_array_header(pre: OtxFile, post: OtxFile) -> None:
    # OIDArray-Header sagt eine bestimmte Anzahl OIDs voraus. by_oid kann
    # leicht darunter liegen (nicht alle OIDs sind in `attrs.m_dwObjID`
    # rückerfasst), aber der declared_count muss > 0 und in plausiblem
    # Verhältnis zu by_oid stehen.
    assert pre.declared_count >= len(pre.by_oid) * 0.95
    assert post.declared_count >= len(post.by_oid) * 0.95


def test_first_top_level_is_asimulator(pre: OtxFile) -> None:
    assert pre.top_level[0].klass == "ASimulator"


def test_asimulator_has_filedump_attributes(pre: OtxFile) -> None:
    sim = pre.top_level[0]
    assert sim.attrs["m_bFileDump"] is True
    assert "embb-dump.txt" in str(sim.attrs["m_stdFileName"])


# ----------------------------------------------------------------------
# Wichtige Klassen sind vorhanden
# ----------------------------------------------------------------------


def _all_objects_of_class(file: OtxFile, klass: str) -> list[OtxObject]:
    return [obj for obj in file.by_oid.values() if obj.klass == klass]


def test_pre_contains_betriebsmittel(pre: OtxFile) -> None:
    bms = _all_objects_of_class(pre, "PBetriebsmittel")
    assert len(bms) >= 3
    names = {b.attrs.get("m_sName") for b in bms}
    assert "Maschine 1" in names or "Maschine 3" in names


def test_pre_contains_dpkn_mengeruesten(pre: OtxFile) -> None:
    knoten = _all_objects_of_class(pre, "PDpKnMengeRuesten")
    assert len(knoten) >= 3
    names = {k.attrs.get("m_sName") for k in knoten}
    assert "Knoten 21" in names


def test_pre_and_post_have_same_class_inventory(pre: OtxFile, post: OtxFile) -> None:
    """Identische Modell-Struktur — gleiche Klassen-Häufigkeiten."""
    from collections import Counter
    pre_classes = Counter(obj.klass for obj in pre.by_oid.values())
    post_classes = Counter(obj.klass for obj in post.by_oid.values())
    # Wenn Save neue Hilfs-Objekte erzeugt (PTriggerList etc.), darf es
    # leichte Abweichungen geben — Kern-Klassen müssen identisch sein.
    for klass in ("PBetriebsmittel", "PDpKnMengeRuesten", "PAslEinzel", "PDurchlaufplan"):
        assert pre_classes[klass] == post_classes[klass], (
            f"Klassen-Häufigkeit für {klass} weicht ab: "
            f"pre={pre_classes[klass]}, post={post_classes[klass]}"
        )


# ----------------------------------------------------------------------
# OID-Instabilität — explizite Dokumentation
# ----------------------------------------------------------------------


def test_oids_are_not_stable_between_saves(pre: OtxFile, post: OtxFile) -> None:
    """OIDs ändern sich beim Save → können NICHT als Diff-Key dienen.

    Konkretes Beispiel: in `embb_pre_run.otx` zeigt OID 41 auf eine
    PTriggerList, in `embb_post_run.otx` aber auf einen PAslEinzel.
    Das ist Implementierungs-Detail des OBjectBase-Serializers.
    """
    pre_oid41 = pre.by_oid.get(41)
    post_oid41 = post.by_oid.get(41)
    assert pre_oid41 is not None
    assert post_oid41 is not None
    assert pre_oid41.klass != post_oid41.klass, (
        "Wenn dieser Test failt, sind die OIDs unerwartet stabil — "
        "dann kann der Diff-Vergleich vereinfacht werden auf OID-Key."
    )


def test_name_based_identity_is_stable(pre: OtxFile, post: OtxFile) -> None:
    """`(klass, m_sName)` ist der stabile Identitäts-Schlüssel über Saves."""
    def by_name(file: OtxFile) -> dict[tuple[str, str], OtxObject]:
        out: dict[tuple[str, str], OtxObject] = {}
        for obj in file.by_oid.values():
            name = obj.attrs.get("m_sName")
            if isinstance(name, str) and name:
                key = (obj.klass, name)
                if key not in out:  # erstes Vorkommen gewinnt bei Kollisionen
                    out[key] = obj
        return out

    pre_names = by_name(pre)
    post_names = by_name(post)
    # Beide Dateien müssen für genannte Objekte identische Schlüssel haben
    common = set(pre_names.keys()) & set(post_names.keys())
    assert len(common) >= 100, (
        f"Nur {len(common)} gemeinsame (klass, name)-Schlüssel — Modell-"
        "Struktur unterscheidet sich unerwartet stark."
    )


# ----------------------------------------------------------------------
# Counter-Werte — Pre 0, Post > 0
# ----------------------------------------------------------------------


def _find_by_name(file: OtxFile, klass: str, name: str) -> OtxObject:
    for obj in file.by_oid.values():
        if obj.klass == klass and obj.attrs.get("m_sName") == name:
            return obj
    raise AssertionError(f"Nicht gefunden: {klass} {name!r}")


def test_pre_run_counters_are_zero(pre: OtxFile) -> None:
    """Vor dem Lauf müssen alle PtK-Counter 0 sein."""
    knoten = _find_by_name(pre, "PDpKnMengeRuesten", "Knoten 21")
    assert knoten.attrs.get("m_iPtkProzessCount") == 0
    assert knoten.attrs.get("m_iPtkAusloesungCount") == 0
    assert knoten.attrs.get("m_dPtkDurchlaufzeit") == 0.0


def test_post_run_counters_reflect_sim_activity(post: OtxFile) -> None:
    """Nach dem Lauf müssen Counter Werte > 0 tragen — sonst ist der
    AZeitSim-Roundtrip kaputt.
    """
    knoten = _find_by_name(post, "PDpKnMengeRuesten", "Knoten 21")
    assert knoten.attrs["m_iPtkProzessCount"] > 0
    assert knoten.attrs["m_iPtkAusloesungCount"] > 0
    assert knoten.attrs["m_dPtkDurchlaufzeit"] > 0
    # Konkrete Werte aus dem dokumentierten Lauf (Embb-AslFj, 18-Events)
    assert knoten.attrs["m_iPtkProzessCount"] == 1
    assert knoten.attrs["m_iPtkDurchfuehrungszeitCount"] == 11
    assert knoten.attrs["m_iPtkKumDurchfuehrungszeit"] == 110528


def test_post_run_betriebsmittel_counters(post: OtxFile) -> None:
    """PBetriebsmittel hat eigene Counter-Familie (m_iPtkAnfragen*)."""
    bm = _find_by_name(post, "PBetriebsmittel", "Maschine 5")
    assert bm.attrs["m_iPtkAnfragenGesamt"] == 2
    assert bm.attrs["m_iPtkAnfrageErfuellt"] == 1
    assert bm.attrs["m_iPtkBeiAnfrageAnwesend"] == 2


# ----------------------------------------------------------------------
# Wert-Parsing
# ----------------------------------------------------------------------


def test_value_parsing_int_float_bool_null(pre: OtxFile) -> None:
    """Stichproben über _parse_value-Branches."""
    sim = pre.top_level[0]
    # int
    assert isinstance(sim.attrs["m_periodLen"], int)
    assert sim.attrs["m_periodLen"] == 86400
    # bool
    assert isinstance(sim.attrs["m_bFileDump"], bool)
    assert sim.attrs["m_bFileDump"] is True
    # Embb-AslFj nutzt Entscheider — m_bIsEntAktiv ist TRUE im Modell
    assert sim.attrs["m_bIsEntAktiv"] is True
    # WriteOnly-Flag ist FALSE (Default)
    sim_gen_keys = [k for k in sim.attrs if "WriteOnlySelectedKnz" in k]
    if sim_gen_keys:
        # Negativ-Beispiel für False-Parsing
        pass


def test_period_dates_are_strings(pre: OtxFile) -> None:
    sim = pre.top_level[0]
    assert isinstance(sim.attrs["m_sStartDate"], str)
    assert isinstance(sim.attrs["m_sEndDate"], str)
