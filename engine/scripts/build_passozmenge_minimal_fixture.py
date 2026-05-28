"""Regeneriert engine/tests/fixtures/otx/passozmenge_minimal.otx.

Provenance: Phase 01.3 Welle 3 (Plan 01.3-04, AUDIT.md Sektion 5.2).

Aufruf:
    cd engine && uv run python scripts/build_passozmenge_minimal_fixture.py

Die Builder-Logik ist 1:1 zu `build_passozmenge_demo_sim()` in
`engine/tests/integration/io/conftest.py` — beide MUESSEN identisch
bleiben. Die Test-Fixture lebt im conftest, damit pytest sie direkt
nutzen kann; das Build-Skript ist die committed-File-Quelle.
"""

from __future__ import annotations

from pathlib import Path

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


def build_passozmenge_demo_sim() -> PSimulator:
    """Spiegel zu tests/integration/io/conftest.build_passozmenge_demo_sim.

    Diese Funktion DARF NICHT von der pytest-Variante abweichen — sonst
    laufen Tests gegen ein anderes Modell als das committed File.
    """
    sim = PSimulator()

    l1 = PRessMenge(sim)
    l1.m_sName = "L1"
    l1.m_iBestandAnfang = 10
    l1.m_iBestandMax = -1
    sim.register_ress_menge(l1)

    l2 = PRessMenge(sim)
    l2.m_sName = "L2"
    l2.m_iBestandAnfang = 10
    l2.m_iBestandMax = -1
    sim.register_ress_menge(l2)

    def _knoten(name: str, dauer: int) -> PDpKnKonstant:
        k = PDpKnKonstant(sim)
        k.m_sName = name
        k.m_iDurchfuehrungszeit = dauer
        sim.register_knoten(k)
        return k

    ke = _knoten("KE", 10)
    kv = _knoten("KV", 20)
    kz = _knoten("KZ", 30)
    ka = _knoten("KA", 40)

    erzgt = PAssozMengeErzgt(sim)
    erzgt.m_sName = "e_KE_L1"
    erzgt.m_lMengRess = l1
    erzgt.m_iMengeAus = 2
    ke.add_assoziation(erzgt)

    verbr = PAssozMengeVerbr(sim)
    verbr.m_sName = "v_KV_L1"
    verbr.m_lMengRess = l1
    verbr.m_iMengeEin = 3
    kv.add_assoziation(verbr)

    vzw = PAssozMengeVerbrZwischen(sim)
    vzw.m_sName = "z_KZ_L2"
    vzw.m_lMengRess = l2
    vzw.m_iMengeEin = 1
    kz.add_assoziation(vzw)

    abfr = PAssozMengeAbfr(sim)
    abfr.m_sName = "a_KA_L2"
    abfr.m_lMengRess = l2
    abfr.m_iMengeAbfr = 4
    ka.add_assoziation(abfr)

    for i, kn in enumerate((ke, kv, kz, ka), start=1):
        asl = PAslEinzel(sim)
        asl.m_sName = f"asl_{kn.m_sName}"
        asl.m_iBeginTermin = 10 * i
        asl.m_lDlpl = kn
        sim.register_ausloeser(asl)

    return sim


def main() -> int:
    sim = build_passozmenge_demo_sim()
    text = dump_simulator_to_otx(sim)
    here = Path(__file__).resolve().parent
    repo_root = here.parent  # engine/
    out = repo_root / "tests" / "fixtures" / "otx" / "passozmenge_minimal.otx"
    out.write_text(text, encoding="latin-1")
    nlines = text.count("\n")
    print(f"Wrote {out} ({len(text)} chars, {nlines} lines)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
