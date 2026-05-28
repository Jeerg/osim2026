"""OTX ↔ Wire-Format-Adapter.

Drei Funktionen, die zwischen dem Engine-internen ``OtxFile`` /
``LoadResult`` und dem Frontend-Wire-Format (``ModelTreeWire``) vermitteln:

    * ``load_to_wire(otx_path)`` — File-on-Disk → Wire (für Upload + Get).
    * ``wire_to_otx(wire, original_otx_path=None)`` — Wire → OTX-Text-String
      (für Save-back).
    * ``is_save_safe(wire)`` — defensive Prüfung gegen Coverage-Lücken.

Strategie für ``wire_to_otx`` (Phase 1):
    Die Engine kann ein vollständiges OTX-File via ``dump_simulator_to_otx``
    schreiben. Voraussetzung dafür ist ein geladener ``PSimulator`` plus
    Pass-Through-Quelle (``original_otx``) für nicht-handler-bewehrte Klassen.

    Phase-1-Ansatz (entspricht PATTERNS.md §``app/services/otx_json_tree.py``
    Strategie A, vereinfachte Form): Original-OTX-File via
    ``load_otx_file(original_otx_path)`` neu laden → ``dump_simulator_to_otx
    (result.simulator, original_otx=result.otx, instances=result.instances,
    include_unsupported_passthrough=True)``. Das nutzt den verifizierten
    Roundtrip-Vertrag aus Plan 01 (Coverage 1.0 für die drei kanonischen
    Modelle) und ist OID-stabil.

    BEKANNTE LIMITIERUNG (für Plan 11 + Phase 2+):
        Wire-Modifikationen vom Frontend werden in Phase 1 noch NICHT in
        den schreibenden Pass eingespielt — der Server schreibt das
        Original 1:1 zurück. Die Edit-Operationen (Plan 11) werden den
        ``wire``-Parameter dann tatsächlich konsumieren (entweder über
        eine ``apply_wire_to_simulator(sim, wire)``-Mutation oder über
        eine zweite Strategie B, die ohne Loader-Roundtrip auskommt).

    Diese Limitierung ist im Phase-1-Vertical-Slice akzeptabel — Plan 04
    liefert die Endpoint-Surface; Plan 11 (Save-Strategy) baut darauf
    auf und integriert tatsächlich die Wire-Mutationen.

Pitfall #3 (Latin-1): Der Writer liefert ``str``. Konsumenten (z.B.
``ModelService.save_wire``) müssen explizit mit ``.encode("latin-1")`` ins
Storage schreiben.
"""

from __future__ import annotations

from pathlib import Path

from app.api.schemas.model import ModelCoverage, ModelObject, ModelTreeWire


# ---------------------------------------------------------------------------
# Coverage-Whitelist
# ---------------------------------------------------------------------------

# Klassen, die der Loader bewusst überspringt (Skip-Liste). Werden NICHT in
# coverage.unsupported gezählt — sie tauchen im Wire auch nicht auf (siehe
# load_to_wire: nur otx.by_oid wird iteriert; skipped-Klassen sind dort
# trotzdem drin, aber im LoadResult als skipped-Counter).
#
# Phase 1: harte Whitelist. Plan 04 + Plan 11 sind die einzigen Konsumenten;
# wenn ein Modell hier durchfällt, ist das ein Engine-Coverage-Bug, der in
# osim-engine gefixt wird, NICHT hier.
SAVE_SAFE_UNSUPPORTED_WHITELIST: frozenset[str] = frozenset()


# ---------------------------------------------------------------------------
# PAssozBeleg-Link-Status: Enum-Token ↔ UI-Status-Int
# ---------------------------------------------------------------------------
#
# Der Belegungs-Status einer Ressource an einem Knoten lebt pro Ressource in
# ``PAssozBeleg.m_LinkStatusList`` → ``PAssozBelegLinkInfo``
# (``m_oRessBeleg`` + ``m_eStatus`` + ``m_eBaseStatus``).
#
# Das OTX serialisiert ``m_eStatus``/``m_eBaseStatus`` als Enum-TOKEN
# (``PAssozBelegLinkStatus`` aus ``OSim2004/.../PAssozRessource.odh``).
# Das Frontend (``VERK_STATUS`` in ``PRessBelegMatrixToolbar.tsx``) nutzt eine
# eigene Int-Konvention NACH BEDEUTUNG:
#     0 = bevorzugt, 1 = standard, 2 = notfalls, 3 = geblockt.
#
# Achtung: die C++-Enum-Reihenfolge ist ``{ABL_BLOCKED, ABL_IF_NEEDED,
# ABL_STD, ABL_PREFER}`` (Int-Werte 0..3) — das sind NICHT die UI-Ints. Daher
# wird nach Bedeutung gemappt, nicht nach Enum-Position. Token-Strings 1:1 aus
# ``PAssozRessource.cpp::TraceLinkStatus`` (Z.530-542).
_ABL_TOKEN_TO_UI: dict[str, int] = {
    "ABL_PREFER": 0,      # bevorzugt
    "ABL_STD": 1,         # standard (Default)
    "ABL_IF_NEEDED": 2,   # notfalls
    "ABL_BLOCKED": 3,     # geblockt
}
_ABL_UI_TO_TOKEN: dict[int, str] = {v: k for k, v in _ABL_TOKEN_TO_UI.items()}
_ABL_DEFAULT_UI = 1  # ABL_STD
_LINK_INFO_KLASS = "PAssozBelegLinkInfo"
_LINK_STATUS_ATTRS = ("m_eStatus", "m_eBaseStatus")


def _link_status_to_ui(value: object) -> int:
    """OTX-Token (``ABL_*``) oder bereits-Int → UI-Status-Int (0..3)."""
    if isinstance(value, bool):  # bool ist int-Subklasse — defensiv ausschließen
        return _ABL_DEFAULT_UI
    if isinstance(value, int):
        return value if value in _ABL_UI_TO_TOKEN else _ABL_DEFAULT_UI
    if isinstance(value, str):
        return _ABL_TOKEN_TO_UI.get(value, _ABL_DEFAULT_UI)
    return _ABL_DEFAULT_UI


def _link_status_to_token(value: object) -> str:
    """UI-Status-Int (0..3) oder bereits-Token → OTX-Token (``ABL_*``)."""
    if isinstance(value, str):
        return value if value in _ABL_TOKEN_TO_UI else "ABL_STD"
    if isinstance(value, bool):
        return "ABL_STD"
    if isinstance(value, int):
        return _ABL_UI_TO_TOKEN.get(value, "ABL_STD")
    return "ABL_STD"


# ---------------------------------------------------------------------------
# load_to_wire
# ---------------------------------------------------------------------------


def load_to_wire(otx_path: Path) -> ModelTreeWire:
    """Lade eine OTX-Datei und konvertiere sie ins Wire-Format.

    **LList-Resolution (Phase 1.1, Welle 9):**
    Für jedes ``m_l*``-Attribut, das in der Python-Instance ein ``list``-
    Container (Engine-LList-Subklasse) ist, wird die Liste der enthaltenen
    OIDs ausgelesen und als ``list[int]`` direkt in ``objects[oid].attrs``
    geschrieben. Damit zeigen OCtrlList-Sektionen im Frontend (Auslöser-
    Liste, Knoten-Liste, etc.) die tatsächlichen Sub-Objekte statt leerer
    Stubs.

    Args:
        otx_path: Pfad zur ``.otx``-Datei (Latin-1, wie aus Storage gelesen).

    Returns:
        ``ModelTreeWire`` mit ``simulator_oid=0``, allen Objekten aus
        ``otx.by_oid`` und Coverage-Info aus dem ``LoadResult``.

    Raises:
        FileNotFoundError: wenn ``otx_path`` nicht existiert.
        ValueError: wenn die Datei kein gültiges OTX ist.
    """
    # Lazy-Import: osim-engine ist ein heavy module + soll nicht geladen
    # werden, wenn das Modul nur für Schema-Inspektion importiert wird.
    from osim_engine.io.otx_loader import load_otx_file

    result = load_otx_file(otx_path)

    # Reverse-Map: Python-Instance → OID. Wird für LList-Resolution gebraucht.
    inst_to_oid: dict[int, int] = {}  # id(instance) → OID
    for oid, inst in result.instances.items():
        if inst is not None:
            inst_to_oid[id(inst)] = oid

    objects: dict[int, ModelObject] = {}
    for oid, obj in result.otx.by_oid.items():
        attrs = dict(obj.attrs)  # defensive Kopie

        # LList-Resolution: die Python-Instance dieses Objekts hat für jedes
        # m_l*-Attribut eine echte Python-Liste mit aufgelösten Objekt-
        # Referenzen (im OTX-File ist dort nur ein int-Pointer auf den
        # Container-OID). Wir ersetzen den int durch die OID-Liste.
        inst = result.instances.get(oid)
        if inst is not None:
            llist_attrs = _resolve_llist_attrs(inst, inst_to_oid)
            attrs.update(llist_attrs)

        # PAssozBelegLinkInfo: Enum-Token (ABL_*) → UI-Status-Int (0..3), damit
        # das Frontend durchgängig mit Ints arbeitet (getLinkStatus erwartet
        # number). wire_to_otx mappt beim Save zurück auf Tokens.
        if obj.klass == _LINK_INFO_KLASS:
            for status_attr in _LINK_STATUS_ATTRS:
                if status_attr in attrs:
                    attrs[status_attr] = _link_status_to_ui(attrs[status_attr])

        objects[oid] = ModelObject(
            oid=oid,
            klass=obj.klass,
            attrs=attrs,
            sub_refs=[list(block) for block in obj.sub_refs],
        )

    coverage = ModelCoverage(
        loaded=sum(result.loaded.values()),
        skipped=sum(result.skipped.values()),
        unsupported=sorted(result.unsupported.keys()),
    )

    return ModelTreeWire(
        version=1,
        simulator_oid=0,
        objects=objects,
        coverage=coverage,
    )


def _resolve_llist_attrs(
    inst: object,
    inst_to_oid: dict[int, int],
) -> dict[str, list[int]]:
    """Extrahiert OID-Listen aus den list-Attributen einer Python-Instance.

    Im OTX-File steht ``ASimulator.m_lAusl = 33`` (Pointer auf Container-OID).
    Beim Laden materialisiert der Engine-Loader das zu ``sim.m_lAusl: list[
    PAslEinzel]`` (echte Python-Liste mit aufgelösten Objekt-Referenzen). Die
    Container-OID (33) selbst existiert oft NICHT als eigene instance.

    Diese Funktion iteriert über ``inst.__dict__`` und sammelt für jedes
    Attribut, das eine ``list`` ist, die OIDs der Elemente. Aufrufer schreibt
    die OID-Liste über den OTX-File-Pointer-Wert in ``wire.objects[oid].attrs``.

    Defensive:
    - Private Attribute (Prefix ``_``) werden übersprungen
    - Nicht-list-Attribute werden übersprungen
    - Leere Listen werden NICHT zurückgegeben (würden Pointer-Stub überschreiben)
    - Elemente ohne OID-Mapping werden übersprungen (keine doppelte Buchführung)
    - Bounded auf 100k Elemente pro Liste (DoS-Schutz)

    Returns:
        Dict ``{attr_name: [oid1, oid2, ...]}``. Nur Attribute mit nicht-leerer
        OID-Liste — überschreibt also keine Pointer-Stubs ohne Inhalt.
    """
    MAX_ELEMENTS = 100_000
    result: dict[str, list[int]] = {}

    inst_dict = getattr(inst, "__dict__", None)
    if not inst_dict:
        return result

    for attr_name, value in inst_dict.items():
        if attr_name.startswith("_"):
            continue
        if not isinstance(value, list):
            continue
        oids: list[int] = []
        for i, elem in enumerate(value):
            if i >= MAX_ELEMENTS:
                break
            if elem is None:
                continue
            elem_oid = inst_to_oid.get(id(elem))
            if elem_oid is None:
                continue
            oids.append(elem_oid)
        if oids:
            result[attr_name] = oids

    return result


# ---------------------------------------------------------------------------
# wire_to_otx
# ---------------------------------------------------------------------------


def wire_to_otx(
    wire: ModelTreeWire, original_otx_path: Path | None = None
) -> str:
    """Konvertiere ein Wire-Modell zurück in OTX-Text.

    Strategie:
        ``original_otx_path`` ist der Pfad zur ursprünglich hochgeladenen
        OTX-Datei. Der Writer nutzt den Engine-Loader, um daraus
        ``PSimulator + instances + otx`` zu rekonstruieren. Wire-Mutationen
        werden zweistufig eingespielt:
          1. ``_apply_wire_to_instances`` — primitive Property-Edits auf die
             Python-Instanzen handler-bewehrter Klassen.
          2. ``_reconcile_wire_into_otx`` — Belegungs-/Link-Status-Edits und
             neu angelegte Objekte (PAssozBeleg/-LinkStatusList/-LinkInfo etc.)
             in das ``OtxFile`` spiegeln, das der Writer als Pass-Through- und
             m_l*-Adoptions-Quelle liest.
        Danach dumpt ``dump_simulator_to_otx`` mit Pass-Through.

        OFFEN (größere Edits): das Umhängen bestehender LList-Inhalte
        (Listen-Reorder, Verschieben von Knoten zwischen Plänen) bleibt
        Phase-2-Scope — der Reconcile schreibt bewusst keine aufgelösten
        m_l*-Listen zurück, um OTX-Container-Pointer nicht zu korrumpieren.

    Args:
        wire: Wire-Modell mit den Frontend-Edits (wird eingespielt).
        original_otx_path: Pfad zur Original-OTX-Datei aus dem Storage.
            Wenn ``None``, raised der Writer — der Pass-Through BRAUCHT das
            Original als Basis.

    Returns:
        OTX-Text-String. Konsumenten müssen mit
        ``.encode("latin-1")`` ins Storage schreiben.

    Raises:
        ValueError: wenn ``original_otx_path`` None ist.
    """
    if original_otx_path is None:
        raise ValueError(
            "wire_to_otx in Phase 1 erwartet original_otx_path als "
            "Pass-Through-Quelle. Strategie B (direkter Wire→OTX-Write ohne "
            "Loader-Roundtrip) ist als TODO für Plan 11 / Phase 2+ markiert."
        )

    # Lazy-Imports (siehe load_to_wire).
    from osim_engine.io.otx_loader import load_otx_file
    from osim_engine.io.otx_writer import dump_simulator_to_otx

    result = load_otx_file(original_otx_path)

    # Wire-Mutationen einspielen: primitive Attribute (str/int/float/bool) auf
    # Python-Instanzen schreiben, damit der Writer die Edits sieht (Property-
    # Edits an handler-bewehrten Klassen — der Writer liest sie aus den
    # Python-Instanzen).
    _apply_wire_to_instances(result.simulator, result.instances, wire)

    # Belegungs-/Link-Status + neu angelegte Objekte in das geladene OtxFile
    # spiegeln. Der Engine-Writer liest m_l*-Pointer, m_LinkStatusList und den
    # Pass-Through allesamt aus `result.otx` — nach diesem Reconcile trägt es
    # die Wire-Edits. Skalar-only (Listen werden NICHT zurückgeschrieben, da
    # Wire-m_l* aufgelöste OID-Listen sind ≠ OTX-Container-Pointer).
    _reconcile_wire_into_otx(result.otx, wire)

    text = dump_simulator_to_otx(
        result.simulator,
        original_otx=result.otx,
        instances=result.instances,
        include_unsupported_passthrough=True,
    )

    return text


def _apply_wire_to_instances(
    simulator,  # OSimulator | PSimulator — lazy-typed
    instances: dict,
    wire: ModelTreeWire,
) -> None:
    """Schreibt primitive Wire-Attr-Werte auf die geladenen Python-Instanzen.

    Strategie: für jede Wire-Objekt-OID die korrespondierende Python-Instanz
    aus ``instances`` (Loader-Map) holen und alle primitiv-typisierten Attrs
    per ``setattr`` übernehmen. Nicht-Primitive (Listen, Dicts, Objekt-
    Referenzen) werden bewusst überspringen — die kommen mit der LList-zu-
    Array-Konvertierung in Phase 2.

    Spezial: ``simulator_oid`` mappt nicht auf ``instances[0]`` sondern auf
    den ``simulator``-Parameter direkt (Loader-Konvention: simulator ist sein
    eigener m_simulator und ggf. nicht in ``instances`` enthalten).
    """
    _PRIMITIVE_TYPES = (str, int, float, bool)

    def _apply(inst, attrs: dict) -> None:
        for name, value in attrs.items():
            if not hasattr(inst, name):
                continue
            if not isinstance(value, _PRIMITIVE_TYPES) and value is not None:
                # Komplex (Liste, Dict, Objekt) — Phase-2-Scope.
                continue
            current = getattr(inst, name, None)
            # Nur überschreiben wenn das Ziel-Attribut auch primitiv ist
            # (verhindert dass z.B. m_lAusl als Integer auf eine LList-Klasse
            # geschrieben wird — die Engine hält dort einen LListPtr).
            if current is not None and not isinstance(current, _PRIMITIVE_TYPES):
                continue
            try:
                setattr(inst, name, value)
            except (TypeError, ValueError, AttributeError):
                continue

    # Simulator-Root separat
    sim_obj = wire.objects.get(wire.simulator_oid)
    if sim_obj is not None:
        _apply(simulator, sim_obj.attrs)

    # Restliche Objekte über instances-Map
    for oid, obj in wire.objects.items():
        if oid == wire.simulator_oid:
            continue
        inst = instances.get(oid)
        if inst is None:
            continue
        _apply(inst, obj.attrs)


def _reconcile_wire_into_otx(otx, wire: ModelTreeWire) -> None:
    """Spiegelt Wire-Edits in das geladene ``OtxFile`` (Pass-Through-Quelle).

    Hintergrund: der Engine-Writer schreibt nicht-handler-bewehrte Klassen
    (z.B. ``PAssozBelegLinkStatusList``/``-LinkInfo``, ``PAssozRessourceLList``)
    per Pass-Through 1:1 aus ``otx.by_oid`` und übernimmt Skalar-Container-
    Pointer (``m_l*``-Pointer, ``m_LinkStatusList``) aus derselben Quelle. Es
    genügt also, das ``OtxFile`` vor dem Dump mit den Wire-Edits abzugleichen.

    Zwei Operationen:
      - **Bestehende Objekte:** nur SKALARE Attribute aktualisieren
        (``str``/``int``/``float``/``bool``); Listen-Werte werden NICHT
        zurückgeschrieben, weil ``load_to_wire`` ``m_l*``-Pointer zu aufgelösten
        OID-Listen macht, das OTX dort aber einen einzelnen Container-Pointer
        erwartet. Geänderte ``sub_refs`` (z.B. neues ``PAssozBelegLinkInfo`` in
        der ``LinkStatusList``) werden übernommen.
      - **Neu vom UI angelegte Objekte** (OID nicht im Original): als
        ``OtxObject`` materialisieren, damit der Pass-Through sie schreibt.

    ``PAssozBelegLinkInfo.m_eStatus``/``m_eBaseStatus`` werden dabei vom
    UI-Status-Int zurück auf den OTX-Enum-Token (``ABL_*``) gemappt.

    NICHT abgedeckt (Phase 2): Umhängen bestehender LList-Inhalte (Reorder,
    Move) — dafür müssten aufgelöste ``m_l*``-Listen sicher in Container-
    Pointer + Wrapper-``sub_refs`` rückübersetzt werden.
    """
    from osim_engine.io.otx_reader import OtxObject  # lazy (heavy module)

    def _scalar_attrs(klass: str, wire_attrs: dict) -> dict:
        out: dict = {}
        for name, value in wire_attrs.items():
            # Aufgelöste m_l*-Listen NICHT zurückschreiben (s. Docstring).
            if isinstance(value, list):
                continue
            out[name] = value
        # Link-Status: UI-Int → OTX-Token.
        if klass == _LINK_INFO_KLASS:
            for status_attr in _LINK_STATUS_ATTRS:
                if status_attr in out:
                    out[status_attr] = _link_status_to_token(out[status_attr])
        return out

    for oid, wobj in wire.objects.items():
        if oid == wire.simulator_oid:
            continue
        attrs = _scalar_attrs(wobj.klass, wobj.attrs)
        sub_refs = [list(block) for block in wobj.sub_refs]
        existing = otx.by_oid.get(oid)
        if existing is not None:
            existing.attrs.update(attrs)
            # sub_refs nur übernehmen, wenn das Wire welche trägt (Container-
            # Edits wie LinkStatusList → LinkInfo); sonst Original belassen.
            if any(sub_refs):
                existing.sub_refs = sub_refs
        else:
            otx.by_oid[oid] = OtxObject(
                klass=wobj.klass,
                oid=oid,
                attrs=attrs,
                sub_refs=sub_refs,
            )


# ---------------------------------------------------------------------------
# is_save_safe
# ---------------------------------------------------------------------------


def is_save_safe(wire: ModelTreeWire) -> tuple[bool, str | None]:
    """Prüfe, ob das Wire ohne Daten-Verlust zurückgeschrieben werden kann.

    Coverage-Lücken (``wire.coverage.unsupported``) sind ein Save-Block:
    Klassen ohne Loader-Handler werden vom Engine-Reader gelesen, aber vom
    Writer nur als leeres Skelett (Pass-Through) wieder rausgeschrieben.
    Wenn das Frontend in solchen Objekten Attribute editiert hat, gehen die
    beim Save-back verloren. Daher: Save defensiv ablehnen, bis die
    fehlenden Klassen in der Engine implementiert sind.

    Phase-1-Status: Die drei kanonischen Modelle (Dummy, Fertigungsstruktur1,
    Bosch2_wechseln) haben alle Coverage 1.0 → ``is_save_safe`` liefert
    immer ``(True, None)``. Erst nicht-kanonische Modelle würden den
    422-Pfad aktivieren.

    Returns:
        ``(True, None)``, wenn Save-back sicher ist; sonst
        ``(False, "E_OTX_COVERAGE_INCOMPLETE")``.
    """
    if wire.coverage.unsupported:
        # Whitelist-Check: einige Klassen sind explizit als "Pass-Through
        # nur, kein Edit erlaubt" markiert. In Phase 1 ist die Whitelist
        # leer — sobald eine Engine-Lücke dokumentiert wird, können
        # entsprechende Klassen hier eingetragen werden, damit die UI sie
        # zwar anzeigt aber als read-only kennzeichnet, und Save trotzdem
        # erlaubt.
        unwhitelisted = [
            klass
            for klass in wire.coverage.unsupported
            if klass not in SAVE_SAFE_UNSUPPORTED_WHITELIST
        ]
        if unwhitelisted:
            return False, "E_OTX_COVERAGE_INCOMPLETE"

    return True, None


__all__ = [
    "SAVE_SAFE_UNSUPPORTED_WHITELIST",
    "is_save_safe",
    "load_to_wire",
    "wire_to_otx",
]
