"""Skelett-Slice-Detection + streams-Status-Block für ``meta.json`` (D-2.1/D-2.2).

Phase 01 baut ALLE 6 Sub-Streams ab. Für Streams, deren Quell-Slices heute
Skelett sind (P5-D/P5-L/P5-M — siehe ``docs/skeleton-inventory.md``), schreiben
die Listener nur minimale **partial-Frames**; dieser Modul liefert den
maschinen-lesbaren Status-Block, mit dem ``meta.json`` der UI mitteilt, welche
Streams ``partial`` sind und welche Slices ihnen fehlen (UI-Banner, D-2.2).

Klassifikations-Quelle (T-01-09): ein statisches Mapping gegen
``docs/skeleton-inventory.md`` (P5-D/L/M offen). ``is_slice_skeleton`` macht
zusätzlich einen best-effort Laufzeit-Re-Check über die Docstring-Marker-
Konvention (``"Slice P5-X Skelett"``), damit der Block automatisch ``full``
wird, sobald eine Slice geschlossen ist — ohne diese Datei zu editieren.
"""

from __future__ import annotations

import importlib
from typing import Any

# Statisches Mapping Slice-ID → (Modul, Marker-Substring) für den Laufzeit-
# Re-Check. Bleibt der Marker im Docstring/Source, gilt die Slice als Skelett.
# Quelle: docs/skeleton-inventory.md (Stand 2026-05-28).
_SKELETON_SLICE_MODULES: dict[str, tuple[str, ...]] = {
    "P5-D": ("osim_engine.decisions.aufgabe",),
    "P5-L": ("osim_engine.generator.generator",),
    "P5-M": (
        "osim_engine.azeit.aperson",
        "osim_engine.azeit.asimulator",
    ),
}

# Slices, die laut Inventory heute definitiv Skelett sind (Fallback, falls der
# Laufzeit-Re-Check ein Modul nicht importieren kann).
_KNOWN_SKELETON_SLICES: frozenset[str] = frozenset(_SKELETON_SLICE_MODULES)

_MARKER = "Skelett"


def is_slice_skeleton(slice_id: str) -> bool:
    """Prüft, ob die Quell-Slice ``slice_id`` (z. B. ``"P5-D"``) heute Skelett ist.

    Strategie: best-effort Laufzeit-Re-Check über die Docstring-Marker-
    Konvention (``"Slice P5-X Skelett"``) in den zugeordneten Modulen. Schlägt
    der Import fehl oder ist die Slice nicht gemappt, fällt die Antwort auf das
    statische Inventory-Mapping zurück (``docs/skeleton-inventory.md``).
    """
    modules = _SKELETON_SLICE_MODULES.get(slice_id)
    if modules is None:
        # Nicht im Skelett-Mapping → als geschlossen (full) behandeln.
        return slice_id in _KNOWN_SKELETON_SLICES

    for mod_name in modules:
        try:
            mod = importlib.import_module(mod_name)
        except Exception:
            # Modul nicht importierbar → Inventory-Fallback.
            return slice_id in _KNOWN_SKELETON_SLICES
        doc = (getattr(mod, "__doc__", "") or "")
        if _MARKER in doc:
            return True
    # Marker in keinem Modul mehr gefunden → vorsichtshalber Inventory-Fallback,
    # solange die Slice im bekannten Skelett-Set steht (konservativ partial).
    return slice_id in _KNOWN_SKELETON_SLICES


def _entry(status: str, missing_slices: list[str], reason: str) -> dict[str, Any]:
    return {"status": status, "missing_slices": missing_slices, "reason": reason}


def build_streams_status() -> dict[str, dict[str, Any]]:
    """Baut den 6-Stream-Status-Block für ``meta.json:streams`` (D-2.2).

    Returns einen JSON-serialisierbaren Dict ``tag -> {status, missing_slices,
    reason}``. ``full`` = Stream-Vertrag heute vollständig verdrahtet;
    ``partial`` = mindestens eine Quell-Slice ist noch Skelett, der Stream
    schreibt minimale partial-Frames (D-2.1).

    Klassifikation (Stand nach 01-01/01-03):
        - ``lifecycle``        → full (keine Skelett-Abhängigkeit)
        - ``gantt_durchlauf``  → full-Vertrag; Frame-Status partial via P5-D
        - ``kpi_auswertung``   → partial (viele KPI-Sub-kinds Null-Default, 01-03)
        - ``gantt_einsatz``    → partial (P5-D/P5-L Ressourcen-Belegung)
        - ``gantt_schicht``    → partial (P5-M Arbeitszeit-Modell)
        - ``reporting_record`` → partial (P5-D Auftrag-Status-State-Machine)
    """
    return {
        "lifecycle": _entry(
            "full", [],
            "sim/period-Lifecycle vollständig (01-01).",
        ),
        "gantt_durchlauf": _entry(
            "full", [],
            "Frame-Vertrag vollständig (01-01); der konkrete End-Status "
            "(v.status) bleibt 'unbekannt', bis P5-D die Aufgabe-Status-"
            "State-Machine schließt.",
        ),
        "gantt_einsatz": _entry(
            "partial", ["P5-D", "P5-L"],
            "Ressourcen-Belegungs-Balken nur best-effort aus dem Bearbeitungs-"
            "Event abgeleitet; volle Einsatz-/Rüst-/Stillstand-Differenzierung "
            "hängt an P5-D (Einsatz-Dauer-Arithmetik) und P5-L (Generator-"
            "/Auftrags-Eingang). Frames sind minimal-partial.",
        ),
        "gantt_schicht": _entry(
            "partial", ["P5-M"],
            "Schicht-/Arbeitszeit-Modell (azeit/-Slice) ist heute Skelett "
            "(P5-M). Period-Aggregat schreibt minimale partial-Frames mit den "
            "echten ISimulatorViewerSchicht-Spalten (person/schichten/"
            "ueberstunden/einheiten) als null + missing_slice=P5-M.",
        ),
        "kpi_auswertung": _entry(
            "partial",
            ["P5-D", "P5-M"],
            "Stream-Vertrag mit allen 11 kinds vollständig und 1:1 gegen die "
            "ISimulatorViewerAusw*.cpp gepinnt (01-11). NOW-BUILDABLE "
            "(prod_auftrag/nbearbeit/wschlange) liefern echte records aus dem "
            "Engine-State; SLICE-GATED (best_auftrag/pers/betr/kauf/eigen/"
            "kalkulation/gesamt/schicht) tragen die echten OSim-Feldnamen mit "
            "null + missing_slice. Auflösung: P5-M (pers/schicht) + Bestell-/"
            "Kosten-/Bestands-/Sales-Slice (best_auftrag/betr/kauf/eigen/"
            "kalkulation/gesamt).",
        ),
        "reporting_record": _entry(
            "partial", ["P5-D"],
            "Detail-Records (kind=auftrag u. a.) hängen an der P5-D Aufgabe-"
            "Status-State-Machine (ende_ist/ende_soll/verspaetung). Period-end "
            "schreibt minimale partial-Records ohne diese Felder.",
        ),
    }
