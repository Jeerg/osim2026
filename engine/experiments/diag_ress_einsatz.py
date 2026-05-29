"""Empirische Belegungs-Sonde: Welchen Pfad nimmt Bosch2_wechseln?

Fragestellung (P5D-SCOPE §6.3): Erreicht der Lauf eaBelegen-Knoten mit
echten PAssozBeleg-Ressourcen? Oder dominieren eaKeineBelegung/eaAnwesenheit?

Instrumentierung:
  - Monkeypatch auf EPEntscheidungsAufgabe.bearbeit_beginnen:
    zählt Aufrufe je m_eRessUsage-Wert
  - Monkeypatch auf PRessBeleg.ress_belegen: zählt tatsächliche Belegungen
  - Monkeypatch auf PDlplKnoten.bearbeit_beginnen: je Knoten
    m_eRessUsage, len(m_lAssozRess), Anzahl PAssozBeleg mit m_lRessourcen
  - Erkennung: werden belegende Knoten direkt (top-level) oder über
    Sub-Pläne (EPEntAufgabeAltIntern.on_proz_beendet -> dlpl_ausloesen) ausgelöst?

Aufruf:
    cd engine && python experiments/diag_ress_einsatz.py
"""

from __future__ import annotations

import sys
from collections import Counter, defaultdict
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, OSError):
    pass

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from osim_engine.decisions.aufgabe import (
    EntAufgabeBelegStatus,
    EPEntscheidungsAufgabe,
    EPEntAufgabeAltIntern,
)
from osim_engine.io.otx_loader import OtxLoader
from osim_engine.io.otx_reader import parse_otx_file
from osim_engine.pps.knoten.base import PDlplKnoten
from osim_engine.resources.assoziation.beleg import PAssozBeleg
from osim_engine.resources.beleg import PRessBeleg

BOSCH2 = Path(__file__).resolve().parent / ".work" / "Bosch2_wechseln-azeitsim.otx"


def main() -> int:
    print(f"Lade {BOSCH2.name} ...")

    otx = parse_otx_file(BOSCH2)
    loader = OtxLoader()
    result = loader.load(otx)
    sim = result.simulator

    print(f"\nModell-Eckdaten:")
    print(f"  m_bIsEntAktiv:  {getattr(sim, 'm_bIsEntAktiv', '?')}")
    print(f"  m_periodLen:    {getattr(sim, 'm_periodLen', '?')}")
    print(f"  m_lRessBeleg:   {len(getattr(sim, 'm_lRessBeleg', []))}")

    # -----------------------------------------------------------------
    # Zähler (threadlokal; Lauf ist single-threaded)
    # -----------------------------------------------------------------
    counts: dict[str, int] = defaultdict(int)
    usage_hist: Counter[str] = Counter()     # je m_eRessUsage-Name
    knoten_stats: list[dict] = []            # je Knoten-Aufruf

    # -----------------------------------------------------------------
    # Patch 1: EPEntscheidungsAufgabe.bearbeit_beginnen
    # -----------------------------------------------------------------
    _orig_ent_bb = EPEntscheidungsAufgabe.bearbeit_beginnen

    def _patched_ent_bb(self, proz_this):
        counts["ent_aufgabe_bearbeit_beginnen"] += 1
        usage = getattr(self, "m_eRessUsage", -1)
        try:
            name = EntAufgabeBelegStatus(usage).name
        except ValueError:
            name = str(usage)
        usage_hist[name] += 1
        return _orig_ent_bb(self, proz_this)

    EPEntscheidungsAufgabe.bearbeit_beginnen = _patched_ent_bb  # type: ignore[method-assign]

    # -----------------------------------------------------------------
    # Patch 2: PRessBeleg.ress_belegen
    # -----------------------------------------------------------------
    _orig_ress_belegen = PRessBeleg.ress_belegen

    def _patched_ress_belegen(self, proz):
        counts["ress_belegen"] += 1
        return _orig_ress_belegen(self, proz)

    PRessBeleg.ress_belegen = _patched_ress_belegen  # type: ignore[method-assign]

    # -----------------------------------------------------------------
    # Patch 3: PDlplKnoten.bearbeit_beginnen — erfasse ALLE Knoten-Aufrufe
    # (auch Basisklassen-Knoten, nicht nur EntAufgabe)
    # -----------------------------------------------------------------
    _orig_knoten_bb = PDlplKnoten.bearbeit_beginnen

    def _patched_knoten_bb(self, proz):
        counts["knoten_bearbeit_beginnen"] += 1
        # Assoz-Diagnose
        assoz_ress = getattr(self, "m_lAssozRess", [])
        n_assoz = len(assoz_ress)
        n_beleg_assoz_with_ress = sum(
            1
            for a in assoz_ress
            if isinstance(a, PAssozBeleg) and len(a.m_lRessourcen) > 0
        )
        usage = getattr(self, "m_eRessUsage", None)
        try:
            usage_name = EntAufgabeBelegStatus(usage).name if usage is not None else "N/A"
        except ValueError:
            usage_name = str(usage)

        knoten_stats.append(
            {
                "cls": type(self).__name__,
                "usage": usage_name,
                "n_assoz": n_assoz,
                "n_bel_assoz": n_beleg_assoz_with_ress,
            }
        )
        return _orig_knoten_bb(self, proz)

    PDlplKnoten.bearbeit_beginnen = _patched_knoten_bb  # type: ignore[method-assign]

    # -----------------------------------------------------------------
    # Patch 4: EPEntAufgabeAltIntern.on_proz_beendet — zählt Sub-Plan-Auslösungen
    # -----------------------------------------------------------------
    _orig_intern_beendet = EPEntAufgabeAltIntern.on_proz_beendet

    def _patched_intern_beendet(self, proz_this, ent):
        counts["intern_dlpl_ausloesen"] += 1
        return _orig_intern_beendet(self, proz_this, ent)

    EPEntAufgabeAltIntern.on_proz_beendet = _patched_intern_beendet  # type: ignore[method-assign]

    # -----------------------------------------------------------------
    # Eine Periode laufen
    # -----------------------------------------------------------------
    print("\nStarte 1 Periode ...")
    sim.start()
    print("Periode abgeschlossen.")

    # -----------------------------------------------------------------
    # Patches zurücksetzen (Clean-Up)
    # -----------------------------------------------------------------
    EPEntscheidungsAufgabe.bearbeit_beginnen = _orig_ent_bb           # type: ignore[method-assign]
    PRessBeleg.ress_belegen = _orig_ress_belegen                       # type: ignore[method-assign]
    PDlplKnoten.bearbeit_beginnen = _orig_knoten_bb                    # type: ignore[method-assign]
    EPEntAufgabeAltIntern.on_proz_beendet = _orig_intern_beendet       # type: ignore[method-assign]

    # -----------------------------------------------------------------
    # Auswertung
    # -----------------------------------------------------------------
    print("\n" + "=" * 64)
    print("BELEGUNGS-HISTOGRAMM")
    print("=" * 64)

    total_knoten = counts["knoten_bearbeit_beginnen"]
    total_ent    = counts["ent_aufgabe_bearbeit_beginnen"]
    ress_bel     = counts["ress_belegen"]
    intern_sub   = counts["intern_dlpl_ausloesen"]

    print(f"\nGesamt Knoten.bearbeit_beginnen:     {total_knoten:8d}")
    print(f"  davon EPEntscheidungsAufgabe:       {total_ent:8d}")
    print(f"  EPEntAufgabeAltIntern Sub-Pläne:    {intern_sub:8d}")
    print(f"\nress_belegen aufgerufen:             {ress_bel:8d}")

    if ress_bel == 0:
        print("\n  >>> BEFUND: ress_belegen = 0 (Belegung feuert NICHT) <<<")
    else:
        print(f"\n  >>> BEFUND: Belegung feuert (ress_belegen > 0) <<<")

    print("\nm_eRessUsage-Verteilung bei EPEntscheidungsAufgabe.bearbeit_beginnen:")
    if not usage_hist:
        print("  (keine Aufrufe)")
    for name, cnt in sorted(usage_hist.items(), key=lambda x: -x[1]):
        pct = 100.0 * cnt / total_ent if total_ent > 0 else 0.0
        print(f"  {name:25s}  {cnt:7d}  ({pct:.1f} %)")

    # Knoten-Assoz-Statistik
    if knoten_stats:
        total_mit_bel = sum(1 for k in knoten_stats if k["n_bel_assoz"] > 0)
        belegen_mit_bel = sum(
            1
            for k in knoten_stats
            if k["n_bel_assoz"] > 0 and k["usage"] == "EABELEGEN"
        )
        print(f"\nKnoten-Aufrufe mit mind. 1 PAssozBeleg+Ressourcen: {total_mit_bel} / {total_knoten}")
        print(f"  davon m_eRessUsage=EABELEGEN:                       {belegen_mit_bel}")

        # Häufigste Klassen
        cls_counter: Counter[str] = Counter(k["cls"] for k in knoten_stats)
        print(f"\nKnoten-Klassen (top-10):")
        for cls, n in cls_counter.most_common(10):
            print(f"  {cls:40s} {n:7d}")

    # -----------------------------------------------------------------
    # Schluss-Diagnose
    # -----------------------------------------------------------------
    print("\n" + "-" * 64)
    print("SCHLUSS-DIAGNOSE:")
    if ress_bel > 0:
        print("  eaBelegen-Default-Pfad AKTIV — Belegung feuert.")
        print("  fill_shadow_list/LinkStatus ist NICHT Ursache für Symptom 0/34819.")
        print("  Naechster Schritt: Streaming-Listener korrigieren (Plan 01-14/01-15).")
    else:
        belegen_count = usage_hist.get("EABELEGEN", 0)
        if belegen_count == 0:
            print("  KEIN Knoten mit m_eRessUsage=EABELEGEN erreicht.")
            print("  => Bosch2-Lauf nimmt ausschliesslich eaKeineBelegung/eaAnwesenheit.")
            print("  => Leere Belegung ist modelltreu, KEIN Bug in ress_belegen selbst.")
        else:
            bel_mit_assoz = sum(
                1 for k in knoten_stats
                if k["usage"] == "EABELEGEN" and k["n_bel_assoz"] > 0
            )
            if bel_mit_assoz == 0:
                print(f"  {belegen_count} EABELEGEN-Knoten-Aufrufe, aber KEIN Knoten hat PAssozBeleg mit Ressourcen.")
                print("  => PAssozBeleg.m_lRessourcen leer — Lade-Problem (Loader setzt m_lRessourcen nicht).")
            else:
                print(f"  {belegen_count} EABELEGEN-Knoten mit {bel_mit_assoz} davon mit Assoz+Ressourcen,")
                print("  aber ress_belegen = 0 => PAssozBeleg.ress_verfuegbar() gibt immer False.")
    print("-" * 64)

    return 0


if __name__ == "__main__":
    sys.exit(main())
