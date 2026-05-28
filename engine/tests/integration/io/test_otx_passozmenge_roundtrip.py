"""Roundtrip-Tests für die PAssozMenge-Familie (Plan 01.3-04).

Vertrag (SC-4 / SC-5 aus ROADMAP.md):

    load_to_wire(otx) → wire_to_otx → load_to_wire(otx2)
    ⇒ strukturell identische PAssozMenge*-Anzahl + identische
      `m_iMenge*`-Werte + identische `m_lMengRess`-Bindung.

Test-Fixture: AUDIT.md Sektion 5.2 hat Option 2 (konstruiertes
pytest-Fixture) gewählt. Die in-Memory-Sims werden über
`dump_simulator_to_otx(sim)` (ohne `original_otx`) zum OTX-Text
gerollt, dann via `OtxLoader().load(parse_otx(text))` wieder
eingelesen — derselbe Pfad zweimal hintereinander = Roundtrip.

Die `passozmenge_minimal_otx_path`-Fixture (siehe conftest.py)
liefert das committed Demo-File für File-basierte Roundtrips,
während andere Tests Inline-Sims aufbauen, um spezielle
Konfigurationen (Multi-Erzeuger an einem Lager, leeres Lager
für lebenden Sim-Run …) zu testen.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path

from osim_engine.io.otx_loader import LoadResult, OtxLoader, load_otx_file
from osim_engine.io.otx_reader import parse_otx
from osim_engine.io.otx_writer import dump_simulator_to_otx
from osim_engine.pps.ausloeser.einzel import PAslEinzel
from osim_engine.pps.knoten.zeitvorgabe import PDpKnKonstant
from osim_engine.pps.simulator import PSimulator
from osim_engine.resources.assoziation.menge import (
    PAssozMengeAbfr,
    PAssozMengeErzgt,
    PAssozMengeVerbr,
    PAssozMengeVerbrZwischen,
)
from osim_engine.resources.menge import PRessMenge

# Reuse — Builder aus conftest.py (gleiches Paket).
from .conftest import build_passozmenge_demo_sim


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


def _roundtrip(sim_or_path) -> tuple[LoadResult, LoadResult]:
    """Helfer: load → dump → reload, gibt (original, reloaded) zurück.

    Akzeptiert entweder einen `pathlib.Path` auf ein OTX-File ODER
    eine bereits aufgebaute `PSimulator`-Instanz. In beiden Fällen
    läuft genau dieselbe Pipeline:

        OTX/Sim → dump_simulator_to_otx → parse_otx → OtxLoader.load
                                       → dump_simulator_to_otx
                                       → parse_otx → OtxLoader.load

    Damit prüfen wir nicht nur Loader oder Writer isoliert, sondern
    den ZWEITEN Roundtrip — fängt Bugs, bei denen erster Dump zufällig
    grün ist, der zweite aber Pointer verliert (T-01.3.04-01).
    """
    if isinstance(sim_or_path, Path):
        original = load_otx_file(sim_or_path)
    else:
        text = dump_simulator_to_otx(sim_or_path)
        original = OtxLoader().load(parse_otx(text))
    dumped = dump_simulator_to_otx(
        original.simulator,
        original_otx=original.otx,
        instances=original.instances,
    )
    reloaded = OtxLoader().load(parse_otx(dumped))
    return original, reloaded


def _by_class(loaded_instances: dict, klass: type) -> list:
    """Filtert `loader.instances` auf Instanzen einer Klasse."""
    return [obj for obj in loaded_instances.values() if isinstance(obj, klass)]


# ----------------------------------------------------------------------
# 1-4) Pro Subklasse: Count + spezifisches Mengen-Skalar erhalten
# ----------------------------------------------------------------------


def test_roundtrip_passozmenge_erzgt_count_and_mengeaus(
    passozmenge_minimal_otx_path: Path,
) -> None:
    """PAssozMengeErzgt: Anzahl + m_iMengeAus stabil nach Roundtrip."""
    original, reloaded = _roundtrip(passozmenge_minimal_otx_path)

    n_orig = original.loaded["PAssozMengeErzgt"]
    n_back = reloaded.loaded["PAssozMengeErzgt"]
    assert n_back == n_orig == 1, (
        f"PAssozMengeErzgt count drift: orig={n_orig} back={n_back}"
    )

    werte_orig = sorted(
        a.m_iMengeAus for a in _by_class(original.instances, PAssozMengeErzgt)
    )
    werte_back = sorted(
        a.m_iMengeAus for a in _by_class(reloaded.instances, PAssozMengeErzgt)
    )
    assert werte_back == werte_orig == [2], (
        f"m_iMengeAus drift: orig={werte_orig} back={werte_back}"
    )


def test_roundtrip_passozmenge_verbr_count_and_mengein(
    passozmenge_minimal_otx_path: Path,
) -> None:
    """PAssozMengeVerbr: Anzahl + m_iMengeEin stabil nach Roundtrip."""
    original, reloaded = _roundtrip(passozmenge_minimal_otx_path)

    n_orig = original.loaded["PAssozMengeVerbr"]
    n_back = reloaded.loaded["PAssozMengeVerbr"]
    assert n_back == n_orig == 1

    # _by_class via isinstance: VerbrZwischen erbt von Verbr → würde
    # mitgezählt. Daher explizit auf type() filtern.
    werte_orig = sorted(
        a.m_iMengeEin for a in original.instances.values()
        if type(a) is PAssozMengeVerbr
    )
    werte_back = sorted(
        a.m_iMengeEin for a in reloaded.instances.values()
        if type(a) is PAssozMengeVerbr
    )
    assert werte_back == werte_orig == [3], (
        f"m_iMengeEin (Verbr only) drift: orig={werte_orig} back={werte_back}"
    )


def test_roundtrip_passozmenge_verbr_zwischen_count_and_mengein(
    passozmenge_minimal_otx_path: Path,
) -> None:
    """PAssozMengeVerbrZwischen: eigener Klassen-Dispatch, identische
    Scalars zu Verbr, aber m_iMengeEin-Wert bleibt erhalten."""
    original, reloaded = _roundtrip(passozmenge_minimal_otx_path)

    n_orig = original.loaded["PAssozMengeVerbrZwischen"]
    n_back = reloaded.loaded["PAssozMengeVerbrZwischen"]
    assert n_back == n_orig == 1

    werte_orig = sorted(
        a.m_iMengeEin
        for a in _by_class(original.instances, PAssozMengeVerbrZwischen)
    )
    werte_back = sorted(
        a.m_iMengeEin
        for a in _by_class(reloaded.instances, PAssozMengeVerbrZwischen)
    )
    assert werte_back == werte_orig == [1]


def test_roundtrip_passozmenge_abfr_count_and_mengeabfr(
    passozmenge_minimal_otx_path: Path,
) -> None:
    """PAssozMengeAbfr: Anzahl + m_iMengeAbfr stabil nach Roundtrip."""
    original, reloaded = _roundtrip(passozmenge_minimal_otx_path)

    n_orig = original.loaded["PAssozMengeAbfr"]
    n_back = reloaded.loaded["PAssozMengeAbfr"]
    assert n_back == n_orig == 1

    werte_orig = sorted(
        a.m_iMengeAbfr for a in _by_class(original.instances, PAssozMengeAbfr)
    )
    werte_back = sorted(
        a.m_iMengeAbfr for a in _by_class(reloaded.instances, PAssozMengeAbfr)
    )
    assert werte_back == werte_orig == [4]


# ----------------------------------------------------------------------
# 5) m_lMengRess-Bindung (key_link aus Plan-Frontmatter)
# ----------------------------------------------------------------------


def test_roundtrip_passozmenge_m_l_meng_ress_bindung_erhalten(
    passozmenge_minimal_otx_path: Path,
) -> None:
    """Für jede PAssozMenge-Instanz nach Reload: m_lMengRess ist gesetzt,
    zeigt auf eine PRessMenge mit dem erwarteten Namen.

    Erwartete Bindung (siehe conftest.build_passozmenge_demo_sim):
        Erzgt(e_KE_L1)        → L1
        Verbr(v_KV_L1)        → L1
        VerbrZwischen(z_KZ_L2)→ L2
        Abfr(a_KA_L2)         → L2
    """
    _, reloaded = _roundtrip(passozmenge_minimal_otx_path)

    expected = {
        "e_KE_L1": "L1",
        "v_KV_L1": "L1",
        "z_KZ_L2": "L2",
        "a_KA_L2": "L2",
    }
    seen = {}
    for obj in reloaded.instances.values():
        if isinstance(obj, (PAssozMengeErzgt, PAssozMengeVerbr,
                            PAssozMengeVerbrZwischen, PAssozMengeAbfr)):
            assert obj.m_lMengRess is not None, (
                f"PAssozMenge {obj.m_sName!r}: m_lMengRess None nach Reload"
            )
            assert isinstance(obj.m_lMengRess, PRessMenge), (
                f"PAssozMenge {obj.m_sName!r}: m_lMengRess ist "
                f"{type(obj.m_lMengRess).__name__}, erwartet PRessMenge"
            )
            seen[obj.m_sName] = obj.m_lMengRess.m_sName

    assert seen == expected, f"Bindung drift: {seen}"


# ----------------------------------------------------------------------
# 6) Multi-Erzgt an einem Lager (geteilte m_lMengRess-Referenz)
# ----------------------------------------------------------------------


def test_roundtrip_multi_erzgt_an_einem_lager() -> None:
    """3 Erzeuger-Knoten → alle drei → dasselbe Lager L. Nach Roundtrip:
    3 PAssozMengeErzgt-Instanzen, alle verweisen auf dieselbe PRessMenge
    (Python-Identitäts-Check, nicht nur Name)."""
    sim = PSimulator()
    lager = PRessMenge(sim)
    lager.m_sName = "L"
    lager.m_iBestandAnfang = 0
    sim.register_ress_menge(lager)

    for i in range(1, 4):
        kn = PDpKnKonstant(sim)
        kn.m_sName = f"K{i}"
        kn.m_iDurchfuehrungszeit = 10
        sim.register_knoten(kn)
        assoz = PAssozMengeErzgt(sim)
        assoz.m_sName = f"e{i}"
        assoz.m_lMengRess = lager
        assoz.m_iMengeAus = i  # 1, 2, 3
        kn.add_assoziation(assoz)
        asl = PAslEinzel(sim)
        asl.m_sName = f"asl{i}"
        asl.m_iBeginTermin = 10 * i
        asl.m_lDlpl = kn
        sim.register_ausloeser(asl)

    _, reloaded = _roundtrip(sim)

    erzgts = _by_class(reloaded.instances, PAssozMengeErzgt)
    assert len(erzgts) == 3, f"erwartet 3 Erzgt, gefunden {len(erzgts)}"

    # Alle drei zeigen auf dieselbe PRessMenge-Instanz (Identität).
    ress_ids = {id(e.m_lMengRess) for e in erzgts}
    assert len(ress_ids) == 1, (
        f"Erzgts zeigen auf {len(ress_ids)} verschiedene PRessMenge-Instanzen, "
        f"erwartet 1 (geteiltes Lager)"
    )
    # Und die Mengen-Werte sind erhalten.
    assert sorted(e.m_iMengeAus for e in erzgts) == [1, 2, 3]


# ----------------------------------------------------------------------
# 7) Multi-Lager + Misch aus 4 Subklassen (Bindung pro Subklasse korrekt)
# ----------------------------------------------------------------------


def test_roundtrip_multi_lager_und_subklassen_misch() -> None:
    """2 Lager L1+L2, 4 Subklassen verteilt:
        Erzgt → L1, Verbr → L1, VerbrZwischen → L2, Abfr → L2.
    Nach Roundtrip: Counts korrekt, Lager-Bindung pro Subklasse stimmt."""
    sim = PSimulator()
    l1 = PRessMenge(sim); l1.m_sName = "L1"; l1.m_iBestandAnfang = 5
    sim.register_ress_menge(l1)
    l2 = PRessMenge(sim); l2.m_sName = "L2"; l2.m_iBestandAnfang = 5
    sim.register_ress_menge(l2)

    cases = [
        ("KE", PAssozMengeErzgt, "m_iMengeAus", 2, l1),
        ("KV", PAssozMengeVerbr, "m_iMengeEin", 1, l1),
        ("KZ", PAssozMengeVerbrZwischen, "m_iMengeEin", 1, l2),
        ("KA", PAssozMengeAbfr, "m_iMengeAbfr", 3, l2),
    ]
    for i, (kn_name, cls, scalar, value, lager) in enumerate(cases, start=1):
        kn = PDpKnKonstant(sim); kn.m_sName = kn_name; kn.m_iDurchfuehrungszeit = 10
        sim.register_knoten(kn)
        assoz = cls(sim)
        assoz.m_sName = f"a_{kn_name}"
        assoz.m_lMengRess = lager
        setattr(assoz, scalar, value)
        kn.add_assoziation(assoz)
        asl = PAslEinzel(sim)
        asl.m_sName = f"asl_{kn_name}"
        asl.m_iBeginTermin = 10 * i
        asl.m_lDlpl = kn
        sim.register_ausloeser(asl)

    _, reloaded = _roundtrip(sim)

    counts = Counter(type(o).__name__ for o in reloaded.instances.values())
    for cls_name in (
        "PAssozMengeErzgt", "PAssozMengeVerbr",
        "PAssozMengeVerbrZwischen", "PAssozMengeAbfr",
    ):
        assert counts[cls_name] == 1, (
            f"{cls_name}: erwartet 1, gefunden {counts[cls_name]}"
        )

    # Bindung-Konsistenz: Erzgt und Verbr zeigen auf SELBES Lager,
    # VerbrZwischen und Abfr auf das ANDERE selbe Lager.
    by_cls = {type(o).__name__: o
              for o in reloaded.instances.values()
              if isinstance(o, (PAssozMengeErzgt, PAssozMengeVerbr,
                                PAssozMengeVerbrZwischen, PAssozMengeAbfr))}
    assert by_cls["PAssozMengeErzgt"].m_lMengRess is \
        by_cls["PAssozMengeVerbr"].m_lMengRess, (
            "Erzgt und Verbr sollten auf dasselbe Lager (L1) zeigen"
        )
    assert by_cls["PAssozMengeVerbrZwischen"].m_lMengRess is \
        by_cls["PAssozMengeAbfr"].m_lMengRess, (
            "VerbrZwischen und Abfr sollten auf dasselbe Lager (L2) zeigen"
        )
    assert by_cls["PAssozMengeErzgt"].m_lMengRess is not \
        by_cls["PAssozMengeAbfr"].m_lMengRess, (
            "L1 und L2 sind unterschiedliche Lager-Instanzen"
        )


# ----------------------------------------------------------------------
# 8) sim.start() nach Reload — Sim ist lebensfähig
# ----------------------------------------------------------------------


def test_roundtrip_passozmenge_sim_runnable_after_reload() -> None:
    """Nach Roundtrip muss der reloaded-PSimulator OHNE CRASH startbar
    sein, und die persistierten Sim-Zustände (Lager-Anfangsbestände,
    PAssozMenge-Mengen-Werte, m_lMengRess-Bindung) müssen so eingelesen
    sein, dass auf ihnen ein Sim-Lauf SEMANTISCH SINNVOLL aufsetzen kann.

    Plan-04-Vertrag: `<acceptance_criteria>` "Mindestens 1 Test prüft,
    dass reloaded.simulator.start() ohne Crash läuft."

    Was dieser Test PRÜFT:
      1. `_roundtrip` wirft keine Exception (Loader+Writer-Pipeline robust).
      2. Lager und Knoten + Auslöser landen in `reloaded.instances` mit
         korrekter Identität und Bindung (m_lMengRess → richtiges Lager,
         m_lDlpl → richtiger Knoten).
      3. Nach manuellem Reattach an die Sim-Container (Workaround unten)
         läuft `sim_back.start()` ohne Crash, und das Lager wird via
         `on_sim_begin` auf seinen Anfangsbestand initialisiert.

    Was dieser Test NICHT PRÜFT (siehe SUMMARY Deferred Issues):
      - Volle Sim-Counter-Erwartung nach Reload (KummErzg, KummVerb…).
        Grund: der Loader wired KEINE m_lAssozRess-Backrefs vom Knoten
        auf die PAssozMenge-Instanzen — das ist ein VOR Plan 04
        bestehender Engine-Defekt, der nicht nur PAssozMenge, sondern
        auch PAssozBeleg betrifft (verifiziert: 38 PAssozBeleg in
        embb_pre_run.otx, aber 0 Knoten haben sie im m_lAssozRess-Backref
        nach Load). Solange dieser Backref-Wire fehlt, kann ein
        reloaded Sim die Erzgt/Verbr-Logik nicht triggern. Fix gehört
        in eine eigene Welle.

    WORKAROUND in diesem Test:
      Sim-Container (m_lRessMenge / m_lKnoten / m_lAusl) sind nach dem
      ersten dump_simulator_to_otx(sim) (ohne original_otx) leer, weil
      `_adopt_container_pointers` ohne Quelle keine OID-Pointer schreibt.
      → Wir registrieren die geladenen Instanzen manuell, damit
      sim_back.start() Lifecycle-Hooks am Lager auslöst.
    """
    sim = PSimulator()
    lager = PRessMenge(sim)
    lager.m_sName = "L"
    lager.m_iBestandAnfang = 5
    sim.register_ress_menge(lager)

    ke = PDpKnKonstant(sim); ke.m_sName = "KE"; ke.m_iDurchfuehrungszeit = 10
    sim.register_knoten(ke)
    erzgt = PAssozMengeErzgt(sim)
    erzgt.m_sName = "e"; erzgt.m_lMengRess = lager; erzgt.m_iMengeAus = 2
    ke.add_assoziation(erzgt)

    asl = PAslEinzel(sim)
    asl.m_sName = "ake"; asl.m_iBeginTermin = 10; asl.m_lDlpl = ke
    sim.register_ausloeser(asl)

    _, reloaded = _roundtrip(sim)

    # 1. Pre-start: reloaded.instances enthält alle Objekte mit korrekter
    #    Klassen-Identität und m_lMengRess-Bindung.
    erzgts_back = [
        o for o in reloaded.instances.values()
        if isinstance(o, PAssozMengeErzgt)
    ]
    assert len(erzgts_back) == 1
    assert erzgts_back[0].m_iMengeAus == 2
    assert isinstance(erzgts_back[0].m_lMengRess, PRessMenge)
    assert erzgts_back[0].m_lMengRess.m_sName == "L"

    lager_back = next(
        o for o in reloaded.instances.values()
        if isinstance(o, PRessMenge)
    )
    # Vor start(): Bestand ist noch der Default-Init (=0), erst start()
    # initialisiert ihn auf m_iBestandAnfang.
    assert lager_back.m_iBestandAnfang == 5

    # 2. Workaround: Sim-Container manuell befüllen, damit start()
    #    Lifecycle-Hooks ans Lager schickt.
    sim_back = reloaded.simulator
    from osim_engine.pps.ausloeser.base import PAusloeser
    from osim_engine.pps.knoten.base import PDlplKnoten
    for obj in reloaded.instances.values():
        if isinstance(obj, PRessMenge) and obj not in sim_back.m_lRessMenge:
            sim_back.register_ress_menge(obj)
        elif isinstance(obj, PDlplKnoten) and obj not in sim_back.m_lKnoten:
            sim_back.register_knoten(obj)
        elif isinstance(obj, PAusloeser) and obj not in sim_back.m_lAusl:
            sim_back.register_ausloeser(obj)

    # 3. sim_back.start() läuft ohne Crash, on_sim_begin initialisiert
    #    Bestand auf Anfangsbestand.
    sim_back.start()
    assert lager_back.m_iBestandAktuell == 5, (
        f"on_sim_begin sollte Bestand auf Anfangsbestand setzen, "
        f"gefunden: {lager_back.m_iBestandAktuell}"
    )


# ----------------------------------------------------------------------
# 9) Bonus: zweimal-roundtrip idempotent
# ----------------------------------------------------------------------


def test_roundtrip_idempotent_zweimal(
    passozmenge_minimal_otx_path: Path,
) -> None:
    """Zwei aufeinanderfolgende Roundtrips: counts pro PAssozMenge-
    Subklasse und m_lMengRess-Bindungen bleiben identisch (verifiziert,
    dass kein Drift in OTX-Skelett-Serialisierung beim 2. Pass)."""
    # 1. Roundtrip
    original_a = load_otx_file(passozmenge_minimal_otx_path)
    dumped_a = dump_simulator_to_otx(
        original_a.simulator,
        original_otx=original_a.otx,
        instances=original_a.instances,
    )
    reloaded_a = OtxLoader().load(parse_otx(dumped_a))
    # 2. Roundtrip auf das Ergebnis von 1.
    dumped_b = dump_simulator_to_otx(
        reloaded_a.simulator,
        original_otx=reloaded_a.otx,
        instances=reloaded_a.instances,
    )
    reloaded_b = OtxLoader().load(parse_otx(dumped_b))

    for cls_name in (
        "PAssozMengeErzgt", "PAssozMengeVerbr",
        "PAssozMengeVerbrZwischen", "PAssozMengeAbfr",
    ):
        assert reloaded_b.loaded[cls_name] == reloaded_a.loaded[cls_name] \
            == original_a.loaded[cls_name], (
                f"{cls_name} count drift across two roundtrips: "
                f"orig={original_a.loaded[cls_name]} "
                f"a={reloaded_a.loaded[cls_name]} "
                f"b={reloaded_b.loaded[cls_name]}"
            )

    # m_lMengRess-Bindung nach 2. Roundtrip noch korrekt verkettet.
    for obj in reloaded_b.instances.values():
        if isinstance(obj, (PAssozMengeErzgt, PAssozMengeVerbr,
                            PAssozMengeVerbrZwischen, PAssozMengeAbfr)):
            assert obj.m_lMengRess is not None, (
                f"PAssozMenge {obj.m_sName!r} verlor m_lMengRess "
                f"nach 2. Roundtrip"
            )
            assert isinstance(obj.m_lMengRess, PRessMenge)


# ----------------------------------------------------------------------
# 10) Bonus: coverage_ratio nicht gesunken (analog embb-coverage-Test)
# ----------------------------------------------------------------------


def test_roundtrip_coverage_ratio_not_decreased(
    passozmenge_minimal_otx_path: Path,
) -> None:
    """Plan-04-Smoke: coverage_ratio nach Reload ≥ coverage_ratio vor
    Reload — d.h. der zweite Loader-Lauf darf nicht mehr Klassen als
    'unsupported' melden als der erste."""
    original = load_otx_file(passozmenge_minimal_otx_path)
    dumped = dump_simulator_to_otx(
        original.simulator,
        original_otx=original.otx,
        instances=original.instances,
    )
    reloaded = OtxLoader().load(parse_otx(dumped))

    assert reloaded.coverage_ratio >= original.coverage_ratio - 1e-9, (
        f"coverage_ratio drift: orig={original.coverage_ratio:.3f} "
        f"reload={reloaded.coverage_ratio:.3f}"
    )
    # In dieser Minimal-Fixture sollte coverage = 100% sein, weil alle
    # Klassen einen Handler haben.
    assert original.coverage_ratio == 1.0, (
        f"Demo-Fixture sollte 100% coverage haben (alle Klassen mit "
        f"Handler), ist aber {original.coverage_ratio:.3f}. "
        f"Unsupported: {dict(original.unsupported)}"
    )


# ----------------------------------------------------------------------
# 11) Bonus: builder-side smoke (sicherstellen, dass der pytest-side
#     Builder synchron zum committed File ist — bricht laut, falls
#     jemand build_passozmenge_demo_sim ändert ohne das File neu zu
#     generieren).
# ----------------------------------------------------------------------


def test_builder_in_memory_roundtrip_matches_committed_fixture(
    passozmenge_minimal_otx_path: Path,
) -> None:
    """Der in conftest gebaute Sim und das committed File liefern nach
    Roundtrip identische Klassen-Counts. Wenn der Builder geändert wird
    ohne `scripts/build_passozmenge_minimal_fixture.py` neu auszuführen,
    fällt dieser Test sofort auf.
    """
    sim_inmem = build_passozmenge_demo_sim()
    text_inmem = dump_simulator_to_otx(sim_inmem)
    loaded_inmem = OtxLoader().load(parse_otx(text_inmem))
    loaded_file = load_otx_file(passozmenge_minimal_otx_path)

    for cls_name in (
        "PAssozMengeErzgt", "PAssozMengeVerbr",
        "PAssozMengeVerbrZwischen", "PAssozMengeAbfr",
        "PRessMenge", "PDpKnKonstant", "PAslEinzel", "ASimulator",
    ):
        assert loaded_inmem.loaded[cls_name] == loaded_file.loaded[cls_name], (
            f"{cls_name}: in-memory={loaded_inmem.loaded[cls_name]} "
            f"file={loaded_file.loaded[cls_name]} — Builder und File-"
            f"Generator sind out-of-sync. "
            f"Lösung: `cd engine && uv run python "
            f"scripts/build_passozmenge_minimal_fixture.py` re-run."
        )
