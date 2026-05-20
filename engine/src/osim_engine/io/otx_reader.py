"""Parser für Jeergs `.otx`-Textformat (OSim ObjectBase TXT, 1990er).

Format-Spec (laut Header in `.otx`-Dateien):
  Datei beginnt mit Kommentaren `// ...` und der Header-Zeile `OIDArray|N!`
  (N = Anzahl OIDs/Top-Level-Objekte).
  Dann folgt für jedes Top-Level-Objekt:
    #Klassenname|attr;wert|attr;wert|...|$N;id1;..idN|!

  Wichtige Token-Typen (nach Split auf `|`):
    `#Klasse`         → Beginn einer (verschachtelten) Klassen-Definition
    `attr;wert`       → Attribut-Name-Wert-Paar
    `attr;wert;#Cls`  → Attribut mit OID-Verweis, danach Inline-Objekt-Definition
    `$N`              → Basisklassen-Abschluss ohne Sub-Refs
    `$N;id1;..;idN`   → Basisklassen-Abschluss mit N Sub-Refs (für *LList-Container)
    `!`               → Objekt-Ende (Pop)
    `$!`              → kombiniert: Basisklassen-Abschluss + Objekt-Ende
    `ONULL`           → Null-Referenz
    `(r,g,b)` / `(x,y,w,h)`  → Tuple-Wert (Farbe / Rect)

Der Parser sammelt für jedes Objekt: (klass, oid, attrs, sub_refs).
Inline-Objekte werden mit eigener OID registriert, sodass am Ende alle
Objekte über ihre OID auffindbar sind.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


# MS_OID(KlassenName);123  →  OID ist 123 (Klassenname als Annotation, ignoriert)
_MSOID_RE = re.compile(r"^MS_OID\(([^)]+)\);(\d+)$")


@dataclass
class OtxObject:
    klass: str
    oid: int | None = None
    attrs: dict[str, Any] = field(default_factory=dict)
    # sub_refs: pro Basisklassen-Trenner eine Liste von OIDs
    sub_refs: list[list[int]] = field(default_factory=list)
    # Inline-Sub-Objekte als Liste pro Attribut (Wert ist OID des Sub-Objekts)
    inline_children: dict[str, int] = field(default_factory=dict)


@dataclass
class OtxFile:
    declared_count: int
    top_level: list[OtxObject] = field(default_factory=list)
    by_oid: dict[int, OtxObject] = field(default_factory=dict)


def _strip_comments_and_header(text: str) -> tuple[int, str]:
    """Entfernt `//...`-Kommentare und liest die OIDArray-Header-Zeile.

    Returns (declared_count, body_joined).
    Body ist ein einzelner Token-Stream (alle Zeilen mit `|` gejoined).
    """
    lines: list[str] = []
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith("//"):
            continue
        lines.append(s)
    if not lines:
        return 0, ""
    header = lines[0]
    # OIDArray|N!
    m = re.match(r"OIDArray\|(\d+)!$", header)
    if not m:
        raise ValueError(f"Erwarteter OIDArray-Header, erhalten: {header!r}")
    declared = int(m.group(1))
    # Restliche Zeilen sind separate Top-Level-Objekte
    body = "\n".join(lines[1:])
    return declared, body


def _parse_value(raw: str) -> Any:
    """Wandelt einen Roh-Wert in einen Python-Typ um."""
    if raw == "ONULL":
        return None
    if raw == "TRUE":
        return True
    if raw == "FALSE":
        return False
    # MS_OID(Cls);123 → 123
    m = _MSOID_RE.match(raw)
    if m:
        return int(m.group(2))
    # Tuple: (a,b,c,...)
    if raw.startswith("(") and raw.endswith(")"):
        inner = raw[1:-1]
        parts = inner.split(",")
        try:
            return tuple(int(p) if p.lstrip("-").isdigit() else float(p) for p in parts)
        except ValueError:
            return raw
    # int / float
    try:
        if "." in raw:
            return float(raw)
        return int(raw)
    except ValueError:
        pass
    return raw  # plain string


def _split_subref(token: str) -> list[int]:
    """`$0` → [], `$3;3;12;21` → [3,12,21]."""
    assert token.startswith("$")
    parts = token[1:].split(";")
    if not parts or parts[0] == "":
        return []
    n = int(parts[0])
    ids = [int(p) for p in parts[1:1 + n]] if n > 0 else []
    return ids


def parse_otx(text: str) -> OtxFile:
    """Hauptparser. Ein .otx-Inhalt → OtxFile."""
    declared, body = _strip_comments_and_header(text)
    result = OtxFile(declared_count=declared)

    # Jede Zeile im Body ist eigentlich ein Top-Level-Objekt-Stream.
    # Wir parsen sie einzeln.
    for line in body.split("\n"):
        if not line.strip():
            continue
        tokens = line.split("|")
        # Trailing leerer Token (durch Endkante) entfernen
        while tokens and tokens[-1] == "":
            tokens.pop()
        idx = 0
        top, idx = _parse_object(tokens, idx, result)
        if top is not None:
            result.top_level.append(top)

    return result


def _parse_object(
    tokens: list[str],
    idx: int,
    file: OtxFile,
    parent_attr: str | None = None,
) -> tuple[OtxObject | None, int]:
    """Parst ein Objekt beginnend mit `#Klasse` und schluckt es bis `!`.

    Tokens werden in-place konsumiert (idx hochgezählt).
    Inline-Sub-Objekte werden rekursiv geparst und mit OID in file.by_oid registriert.
    """
    if idx >= len(tokens):
        return None, idx
    first = tokens[idx]
    if not first.startswith("#"):
        raise ValueError(f"Erwartet #Klasse als Objekt-Start, erhalten: {first!r} bei idx={idx}")
    klass = first[1:]
    obj = OtxObject(klass=klass)
    idx += 1

    while idx < len(tokens):
        tok = tokens[idx]
        # Objekt-Abschluss
        if tok == "!":
            idx += 1
            break
        if tok == "$!":
            # kombiniert: leerer Basisklassen-Abschluss + Klassen-Abschluss
            obj.sub_refs.append([])
            idx += 1
            break
        # Basisklassen-Abschluss mit Sub-Refs
        if tok.startswith("$"):
            obj.sub_refs.append(_split_subref(tok))
            idx += 1
            continue
        # Sonst: attr;value[;#Inline-Klasse]
        parts = tok.split(";")
        attr = parts[0]
        if len(parts) == 1:
            # Nur Attribut-Name, kein Wert? → leerer String
            obj.attrs[attr] = ""
            idx += 1
            continue
        # parts[1] ist der eigentliche Wert
        value_raw = parts[1]
        rest = parts[2:]
        # Spezialfall MS_OID(Cls);123 — wird durch ; getrennt
        if value_raw.startswith("MS_OID("):
            # Wir bekommen MS_OID(Cls), 123 als zwei aufeinanderfolgende Parts
            if rest:
                combined = value_raw + ";" + rest[0]
                obj.attrs[attr] = _parse_value(combined)
                rest = rest[1:]
            else:
                obj.attrs[attr] = value_raw
        else:
            obj.attrs[attr] = _parse_value(value_raw)
        idx += 1
        # Sind im rest noch weitere ; -getrennte Komponenten? Z.B. attr;val;#InlineKlasse
        if rest and rest[0].startswith("#"):
            # Inline-Objekt — wir setzen den nächsten Token-Index zurück,
            # da `#Inline` als eigenes Token noch ungelesen vorlag
            # Aber tatsächlich ist `#Inline` Teil DIESES Tokens (nach ; getrennt).
            # Wir müssen es separat parsen.
            inline_klass = rest[0][1:]
            # Erzeuge einen "virtuellen Token-Stream" für das Inline-Objekt,
            # beginnend mit `#Klasse` und weiter mit den restlichen Tokens.
            inline_tokens = [f"#{inline_klass}"] + tokens[idx:]
            inline_obj, consumed = _parse_object(inline_tokens, 0, file, parent_attr=attr)
            if inline_obj is not None:
                # OID des Inline-Objekts ist der vorherige Wert
                oid_val = obj.attrs.get(attr)
                if isinstance(oid_val, int):
                    inline_obj.oid = oid_val
                    file.by_oid[oid_val] = inline_obj
                obj.inline_children[attr] = oid_val if isinstance(oid_val, int) else -1
            # consumed enthält die virtuellen Token; tatsächlich verbraucht haben wir consumed-1
            idx += consumed - 1
        elif rest:
            # Mehrere Werte im selben Token? Z.B. Tuple-Komponenten? Wir packen sie
            # als Roh-String an das Attribut an.
            obj.attrs[attr + "_extra"] = rest

    # Auch das Top-Level-Objekt registrieren, falls es eine OID-Annotation hat
    if "m_dwObjID" in obj.attrs and isinstance(obj.attrs["m_dwObjID"], int):
        obj.oid = obj.attrs["m_dwObjID"]
        file.by_oid[obj.oid] = obj
    return obj, idx


def parse_otx_file(path: str | Path) -> OtxFile:
    p = Path(path)
    text = p.read_text(encoding="latin-1")  # Jeergs Format ist CP1252/Latin-1
    return parse_otx(text)
