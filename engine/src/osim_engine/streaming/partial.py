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

    Klassifikation (Stand nach 01-14):
        - ``lifecycle``        → full (keine Skelett-Abhängigkeit)
        - ``gantt_durchlauf``  → full-Vertrag; Frame-Status vollständig
        - ``kpi_auswertung``   → partial (viele KPI-Sub-kinds Null-Default, 01-03)
        - ``gantt_einsatz``    → full (01-14: Belegung aus m_oProzCurrent real)
        - ``gantt_wartequeue`` → full (01-14: Count-Modus vollständig)
        - ``gantt_schicht``    → partial (P5-M Arbeitszeit-Modell)
        - ``reporting_record`` → partial (P5-D Auftrag-Status-State-Machine)

    Hinweis: gantt_einsatz war vor 01-14 als partial markiert (P5-D/P5-L);
    die Belegung (m_oProzCurrent) ist korrekt gefüllt unabhängig vom
    P5-D-Skelett-Marker in decisions.aufgabe — der Marker betrifft die
    Entscheider-Strategien, NICHT die Belegungslogik (01-14 Befund).
    qcContent/Umlage + Quali-Stream bleiben deferred (out of scope).
    """
    return {
        "lifecycle": _entry(
            "full", [],
            "sim/period-Lifecycle vollständig (01-01).",
        ),
        "gantt_durchlauf": _entry(
            "full", [],
            "Frame-Vertrag vollständig (01-14): echten End-Status "
            "('abgeschlossen' bei PT_ENDE), betriebsmittel_id aus belegter "
            "Ressource, auftrag_oid für Farbschlüssel. Verspätungsvergleich "
            "(soll_ende vs. ist_ende) optional/deferred — Soll-Daten fehlen "
            "auf Frame-Ebene ohne vollständige P5-D-Entscheider-Strategien.",
        ),
        "gantt_einsatz": _entry(
            "full", [],
            "Ressourcen-Belegung aus sim.m_lRessBeleg[*].m_oProzCurrent "
            "(GRAFIKFENSTER-SPEC §4.1, 01-14). on/off-Frames mit "
            "ressource_id=PRessBeleg.m_sName, auftrag_oid, einsatz_typ, "
            "kontext. Partial-Gate entfernt: Belegung ist real (unabhängig "
            "vom P5-D-Skelett-Marker in decisions.aufgabe, der die "
            "Entscheider-Strategien betrifft, NICHT den Belegungspfad). "
            "qcContent/Umlage (GetKnzArbeitsinhalt) und Einsatz-/Rüst-/"
            "Stillstand-Differenzierung bleiben deferred.",
        ),
        "gantt_wartequeue": _entry(
            "full", [],
            "Per-Ressource Warteschlangen-Länge aus m_lPtkWartschl "
            "(Count-Modus, GetZstWartProzesse, PRessBeleg.cpp:1807-1809, "
            "01-14). Treppenfunktion-Sampling bei jeder Änderung (SPEC §1.6). "
            "qcContent/Umlage (GetKnzArbeitsinhalt) und Quali-Stream bleiben "
            "deferred (out of scope).",
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
        "kennzahl_dlz": _entry(
            "full", [],
            "Durchlaufzeit-Rohdaten je Auslöser (m_dPtkDurchlaufzeit / "
            "m_iPtkAusloesungCount, GetKnzMittlDlfz PAusloeser.cpp:149-155). "
            "Period-end-Snapshot der real akkumulierten Auslösungs-DLZ; das UI "
            "berechnet Mittel je Auslöser/Durchlaufplan + ø. Keine Skelett-"
            "Abhängigkeit — die Akkumulation läuft in on_dlpl_beendet (real).",
        ),
    }
