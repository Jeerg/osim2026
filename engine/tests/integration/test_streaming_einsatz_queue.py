"""Integrationstest: gantt_einsatz + gantt_wartequeue Streaming (Plan 01-14).

TDD RED/GREEN:
    Task 1: PRessBeleg.get_zst_wart_prozesse() + PAusloeser.oid
    Task 3: Lauf auf Bosch2_wechseln → gantt_einsatz + gantt_wartequeue befüllt

Orientierung an bestehenden Tests in test_streaming.py und test_ress_einsatz_p5e.py.
"""

from __future__ import annotations

from typing import Any


# ======================================================================
# Hilfsfunktionen
# ======================================================================


def _build_minimal_ress_sim():
    """Minimale Fixture: 1 PBetriebsmittel + 1 PDpKnKonstant + PAssozBeleg.

    Analog test_ress_einsatz_p5e.py._build_one_node_eabelegen(), aber ohne
    Auslöser-/Plan-Overhead — wir testen nur PRessBeleg-State-Felder.
    """
    from osim_engine.pps.simulator import PSimulator
    from osim_engine.resources.beleg import PBetriebsmittel
    from osim_engine.resources.assoziation.beleg import PAssozBeleg
    from osim_engine.pps.prozess.zeitvorgabe import PtProzZeitvorgabe

    sim = PSimulator()
    bm = PBetriebsmittel(sim)
    bm.m_sName = "BM-Test"
    sim.register_ressource(bm)

    assoz = PAssozBeleg(sim)
    assoz.m_lRessourcen.append(bm)

    def make_proz():
        p = PtProzZeitvorgabe(sim)
        p.m_sName = "P-Test"
        return p

    return sim, bm, assoz, make_proz


# ======================================================================
# Task 1, Test 1: get_zst_wart_prozesse() Count-Modus
# ======================================================================


def test_ress_beleg_queue_empty_on_init() -> None:
    """PRessBeleg frisch: get_zst_wart_prozesse() == 0."""
    from osim_engine.resources.beleg import PBetriebsmittel
    from osim_engine.pps.simulator import PSimulator
    sim = PSimulator()
    bm = PBetriebsmittel(sim)
    bm.m_sName = "BM-Init"
    assert bm.get_zst_wart_prozesse() == 0


def test_ress_beleg_queue_count_after_eintragen() -> None:
    """Nach Eintragen zweier wartender Prozesse: get_zst_wart_prozesse() == 2."""
    from osim_engine.resources.beleg import PBetriebsmittel
    from osim_engine.pps.simulator import PSimulator
    from osim_engine.pps.prozess.zeitvorgabe import PtProzZeitvorgabe

    sim = PSimulator()
    bm = PBetriebsmittel(sim)
    bm.m_sName = "BM-Queue"

    p1 = PtProzZeitvorgabe(sim)
    p1.m_sName = "P1"
    p2 = PtProzZeitvorgabe(sim)
    p2.m_sName = "P2"

    # Manuell in m_lPtkWartschl eintragen (wie es beim add_tail-Pfad gemacht wird)
    bm.m_lPtkWartschl.append(p1)
    bm.m_lPtkWartschl.append(p2)

    assert bm.get_zst_wart_prozesse() == 2


def test_ress_belegen_laesst_wartequeue_unveraendert() -> None:
    """OSim-treu (AUDIT-OSIM-TREUE): ress_belegen leert m_lPtkWartschl NICHT.

    Im Original zählt GetZstWartProzesse ALLE am Knoten anhängenden Prozesse
    (wartend + in Bearbeitung); ein Proz bleibt von der Knoten-Anmeldung bis zum
    Knoten-Verlassen in der Liste — auch während er eine Ressource belegt. Die
    Lebensdauer hängt jetzt an PDlplKnoten.add_prozess/remove_prozess (= C++
    PtkUpDateProcessQueue), nicht am RessBelegen (das früher fälschlich schon
    beim Bearbeitungs-Start austrug → Warteschlangen-Spitzen zu niedrig)."""
    from osim_engine.pps.simulator import PSimulator
    from osim_engine.resources.beleg import PBetriebsmittel
    from osim_engine.pps.prozess.zeitvorgabe import PtProzZeitvorgabe
    from unittest.mock import MagicMock

    sim = PSimulator()
    # Minimaler Bus-Stub damit ress_belegen kein AttributeError wirft
    sim.bus = MagicMock()

    bm = PBetriebsmittel(sim)
    bm.m_sName = "BM-Dec"

    p1 = PtProzZeitvorgabe(sim)
    p1.m_sName = "P1"
    p2 = PtProzZeitvorgabe(sim)
    p2.m_sName = "P2"

    bm.m_lPtkWartschl.append(p1)
    bm.m_lPtkWartschl.append(p2)
    assert bm.get_zst_wart_prozesse() == 2

    # ress_belegen ändert die Warteschlange NICHT — p1 ist in Bearbeitung,
    # zählt aber weiter als „am Knoten" (1:1 GetZstWartProzesse).
    bm.ress_belegen(p1)

    assert bm.get_zst_wart_prozesse() == 2


# ======================================================================
# Task 1, Test 2: PAusloeser.oid stabil + eindeutig
# ======================================================================


def test_ausloeser_has_oid_field() -> None:
    """PAusloeser hat nach Konstruktion ein oid-Feld (Default -1)."""
    from osim_engine.pps.ausloeser.base import PAusloeser
    from osim_engine.pps.simulator import PSimulator
    sim = PSimulator()
    a = PAusloeser(sim)
    assert hasattr(a, "oid"), "PAusloeser muss ein oid-Feld haben"
    assert isinstance(a.oid, int)
    assert a.oid == -1  # Default


def test_loader_sets_ausloeser_oid() -> None:
    """Nach OTX-Laden hat PAslEinzel ein stabiles ganzzahliges oid != -1."""
    import pytest
    from pathlib import Path
    from osim_engine.io.otx_loader import OtxLoader
    from osim_engine.io.otx_reader import parse_otx_file

    otx_path = _embb_pre_run_path() or _bosch2_otx_path()
    if otx_path is None:
        pytest.skip("OTX-Datei nicht gefunden")

    otx = parse_otx_file(str(otx_path))
    loader = OtxLoader()
    result = loader.load(otx)
    sim = result.simulator

    assert sim.m_lAusl, "Bosch2 muss mindestens einen Auslöser haben"
    for ausl in sim.m_lAusl:
        assert hasattr(ausl, "oid"), f"{ausl.m_sName}: kein oid-Feld"
        assert isinstance(ausl.oid, int), f"{ausl.m_sName}: oid ist nicht int"
        assert ausl.oid >= 0, f"{ausl.m_sName}: oid ist negativ (Default nicht gesetzt)"

    # Zwei verschiedene Auslöser haben verschiedene oid
    if len(sim.m_lAusl) >= 2:
        oids = [a.oid for a in sim.m_lAusl]
        assert len(set(oids)) == len(oids), "Zwei Auslöser haben gleiche oid"


def test_two_ausloesers_have_different_oids() -> None:
    """Zwei PAusloeser-Instanzen mit gesetzten oids haben verschiedene Werte."""
    from osim_engine.pps.ausloeser.base import PAusloeser
    from osim_engine.pps.simulator import PSimulator
    sim = PSimulator()
    a1 = PAusloeser(sim)
    a1.oid = 42
    a2 = PAusloeser(sim)
    a2.oid = 43
    assert a1.oid != a2.oid


# ======================================================================
# Task 1, Test 3: get_zst_wart_prozesse() == len(m_lPtkWartschl)
# ======================================================================


def test_get_zst_wart_prozesse_is_pure_count() -> None:
    """get_zst_wart_prozesse() = len(m_lPtkWartschl), kein Umlage-Overhead."""
    from osim_engine.resources.beleg import PBetriebsmittel
    from osim_engine.pps.simulator import PSimulator
    from osim_engine.pps.prozess.zeitvorgabe import PtProzZeitvorgabe

    sim = PSimulator()
    bm = PBetriebsmittel(sim)
    bm.m_sName = "BM-Count"

    for i in range(5):
        p = PtProzZeitvorgabe(sim)
        p.m_sName = f"P{i}"
        bm.m_lPtkWartschl.append(p)
        assert bm.get_zst_wart_prozesse() == i + 1

    # Explizit: get_zst_wart_prozesse() == len(m_lPtkWartschl)
    assert bm.get_zst_wart_prozesse() == len(bm.m_lPtkWartschl)


# ======================================================================
# Task 3: Integration — Bosch2_wechseln Lauf erzeugt gantt_einsatz + wartequeue
# ======================================================================


def _bosch2_otx_path():
    """Gibt den Pfad zur Bosch2_wechseln-OTX-Datei zurück (oder None)."""
    from pathlib import Path
    candidates = [
        Path(__file__).resolve().parents[3] / "data" / "Bosch2_wechseln-azeitsim.otx",
        Path(__file__).resolve().parents[2] / "experiments" / ".work" / "Bosch2_wechseln-azeitsim.otx",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def _embb_pre_run_path():
    """Gibt den Pfad zur embb_pre_run.otx-Datei zurück (oder None).

    Dieses Modell hat echte Ressourcen-Belegung (eaBelegen-Pfad) und ist
    als Integrationstest-Fixture geeignet. Bosch2 hat 100% eaKeineBelegung
    (01-13 Befund) und ist für gantt_einsatz-Tests ungeeignet.
    """
    from pathlib import Path
    p = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "otx" / "embb_pre_run.otx"
    if p.exists():
        return p
    return None


def _run_streaming(tmp_path, otx_path=None, periods: int = 3):
    """Führt einen Lauf aus und gibt (stream_lines, meta) zurück.

    Bevorzugt embb_pre_run.otx (hat echte Ressourcen-Belegung).
    """
    import json
    from osim_engine.streaming.run_otx import run_otx

    if otx_path is None:
        otx_path = _embb_pre_run_path()
    if otx_path is None:
        return None, None

    run_path = run_otx(str(otx_path), str(tmp_path), periods=periods)

    stream_path = run_path / "stream.jsonl"
    meta_path = run_path / "meta.json"

    if not stream_path.exists():
        return [], {}

    lines = [
        json.loads(ln)
        for ln in stream_path.read_text(encoding="utf-8").splitlines()
        if ln.strip()
    ]
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
    return lines, meta


# Alias für Rückwärtskompatibilität der Test-Helpers
def _run_bosch2_streaming(tmp_path):
    """Wrapper — embb_pre_run.otx ist das geeignete Modell (Bosch2 = 100% eaKeineBelegung)."""
    return _run_streaming(tmp_path)


def test_gantt_einsatz_nonempty_with_auftrag_oid(tmp_path) -> None:
    """Bosch2_wechseln: gantt_einsatz hat mind. einen on-Frame mit gesetzter auftrag_oid."""
    import pytest

    lines, meta = _run_bosch2_streaming(tmp_path)
    if lines is None:
        pytest.skip("Bosch2-OTX nicht gefunden")

    einsatz_frames = [f for f in lines if f.get("stream") == "gantt_einsatz"]
    assert einsatz_frames, "gantt_einsatz ist leer — mind. ein on-Frame erwartet"

    on_frames = [f for f in einsatz_frames if f.get("v", {}).get("kind") == "on"]
    assert on_frames, "kein on-Frame in gantt_einsatz"

    # Jeder on-Frame muss auftrag_oid tragen (kann -1 sein als Fallback, aber muss vorhanden sein)
    for frame in on_frames:
        v = frame["v"]
        assert "auftrag_oid" in v, f"on-Frame ohne auftrag_oid: {v}"
        assert isinstance(v["auftrag_oid"], int), f"auftrag_oid ist kein int: {v}"


def test_gantt_wartequeue_nonempty(tmp_path) -> None:
    """Bosch2_wechseln: gantt_wartequeue hat mind. einen Sample-Frame."""
    import pytest

    lines, meta = _run_bosch2_streaming(tmp_path)
    if lines is None:
        pytest.skip("Bosch2-OTX nicht gefunden")

    wq_frames = [f for f in lines if f.get("stream") == "gantt_wartequeue"]
    assert wq_frames, "gantt_wartequeue ist leer — mind. ein Sample-Frame erwartet"


def test_gantt_einsatz_and_wartequeue_schema_valid(tmp_path) -> None:
    """Alle gantt_einsatz- und gantt_wartequeue-Frames sind schema-konform."""
    import json
    import pytest
    from pathlib import Path
    from jsonschema import Draft202012Validator

    schema_dir = (
        Path(__file__).resolve().parents[2]
        / "src" / "osim_engine" / "streaming" / "schemas"
    )

    lines, meta = _run_bosch2_streaming(tmp_path)
    if lines is None:
        pytest.skip("Bosch2-OTX nicht gefunden")

    for tag in ("gantt_einsatz", "gantt_wartequeue"):
        schema_file = schema_dir / f"{tag}.json"
        if not schema_file.exists():
            pytest.skip(f"Schema fehlt: {tag}.json")
        schema = json.loads(schema_file.read_text(encoding="utf-8"))
        validator = Draft202012Validator(schema)
        for frame in lines:
            if frame.get("stream") != tag:
                continue
            errors = list(validator.iter_errors(frame))
            assert not errors, (
                f"{tag}-Frame verletzt Schema:\n"
                + "\n".join(e.message for e in errors)
                + f"\nFrame: {frame}"
            )


def test_gantt_wartequeue_seq_monoton(tmp_path) -> None:
    """gantt_wartequeue-Frames: seq ist global monoton steigend."""
    import pytest

    lines, meta = _run_bosch2_streaming(tmp_path)
    if lines is None:
        pytest.skip("Bosch2-OTX nicht gefunden")

    seqs = [f["seq"] for f in lines]
    for i in range(1, len(seqs)):
        assert seqs[i] > seqs[i - 1], f"seq nicht monoton: {seqs[i-1]} >= {seqs[i]}"


def test_meta_gantt_einsatz_full(tmp_path) -> None:
    """meta.json: gantt_einsatz ist 'full' (Belegung jetzt real)."""
    import pytest

    lines, meta = _run_bosch2_streaming(tmp_path)
    if lines is None:
        pytest.skip("Bosch2-OTX nicht gefunden")

    streams = meta.get("streams", {})
    assert "gantt_einsatz" in streams, "gantt_einsatz nicht in meta.json streams"
    assert streams["gantt_einsatz"]["status"] == "full", (
        f"gantt_einsatz ist nicht 'full': {streams['gantt_einsatz']}"
    )


def test_meta_gantt_wartequeue_full(tmp_path) -> None:
    """meta.json: gantt_wartequeue ist 'full' (Count-Modus vollständig)."""
    import pytest

    lines, meta = _run_bosch2_streaming(tmp_path)
    if lines is None:
        pytest.skip("Bosch2-OTX nicht gefunden")

    streams = meta.get("streams", {})
    assert "gantt_wartequeue" in streams, "gantt_wartequeue nicht in meta.json streams"
    assert streams["gantt_wartequeue"]["status"] == "full", (
        f"gantt_wartequeue ist nicht 'full': {streams['gantt_wartequeue']}"
    )
