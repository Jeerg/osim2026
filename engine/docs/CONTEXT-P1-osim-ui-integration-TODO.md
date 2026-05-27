# Engine-TODO aus osim-ui-Integration (Stand 2026-05-27)

Diese Notiz kommt aus der **osim-ui**-Arbeit (Phase 1.2 Matrix-Viewer + Ressourcen).
Zwei Engine-seitige Lücken waren vermutet. **Untersuchung am 2026-05-27 (Engine-
Session) zeigt: beide sind großteils KEINE Engine-Lücken** — die Daten sind
geladen + round-trip-fähig. Die verbleibende Arbeit liegt überwiegend in osim-ui.
Details + Belege pro Abschnitt unten.

Quell-Kontext im UI-Repo:
`osim-ui/.planning/HANDOFF-2026-05-27.md` (vollständiger Stand) und
`osim-ui/portal/src/viewers/PRessBelegMatrix/PRessBelegMatrixViewer.tsx`.

## TL;DR der Untersuchung (2026-05-27)

- **P3 (Link-Status OTX-Round-Trip):** Engine ist OK. `PAssozBelegLinkStatusList`/
  `PAssozBelegLinkInfo` sind unsupported → Pass-Through, und der Pass-Through
  **round-trippt sie verlustfrei** (Counts/Attrs/sub_refs identisch — verifiziert
  an `embb_pre_run.otx`). Regression-Test ergänzt:
  `engine/tests/integration/io/test_otx_roundtrip.py::test_roundtrip_preserves_assoz_link_status`
  (9/9 grün). **Verbleibender Bug ist in osim-ui** (`_apply_wire_to_instances`),
  nicht in der Engine — siehe Abschnitt 1.
- **P2 (Arbeits-/Einsatzzeiten):** Die Daten sind **bereits voll im Wire** und
  loader-/writer-unterstützt — KEINE Engine-Wire-Exposure nötig. `embb_pre_run.otx`
  liefert 260× `PTagRess` (Ressource×Tag via `m_oRessBeleg`+`m_iTag`),
  3× `PTagesEinsatzzeit` (Schichten 6–14 / 14–22 / 6–22), 3× `PEinsatzzeitTag`
  (Pausen). **Verbleibende Arbeit ist ein osim-ui-Viewer** — siehe Abschnitt 2.

---

## 1. PAssozBeleg-Link-Status: OTX-Round-Trip prüfen/absichern

**Befund (verifiziert am Real-Modell `Embb-AslFj.otx`):** Der Belegungs-Status
einer Ressource an einem Knoten liegt NICHT als Skalar `m_eStatus` auf
`PAssozBeleg`, sondern **pro Ressource** in:

```
PAssozBeleg.attrs.m_LinkStatusList   → OID einer PAssozBelegLinkStatusList
PAssozBelegLinkStatusList.sub_refs[0] → Liste von PAssozBelegLinkInfo-OIDs
PAssozBelegLinkInfo.attrs            = { m_oRessBeleg, m_eStatus, m_eBaseStatus }
```

1:1 zu C++ `PAssozBelegLinkStatusList::SetLinkStatus/GetLinkStatus`
(`OSim2004/OSimV01(Fj)/OSimPro/PAssozRessource.cpp` Z.466-509). Default-Status
wenn kein Info vorhanden: `ABL_STD` (1 = "standard").

**Das UI schreibt jetzt genau diese Struktur** beim Cell-Edit (neuer
`PAssozBelegLinkInfo` in der `m_LinkStatusList`). Damit Cell-Edits den
Save→OTX→Reload-Round-Trip überleben, muss der **OTX-Writer**
(`engine/src/osim_engine/io/otx_writer.py`) diese Klassen sauber
serialisieren:

- `PAssozBelegLinkStatusList` (Container mit sub_refs[0]-Liste)
- `PAssozBelegLinkInfo` (mit `m_oRessBeleg`-Pointer + `m_eStatus`/`m_eBaseStatus`)

**Risiko = der G16-Befund von neulich** (Pass-Through-Klassen verloren ihre
Properties / Container-Pointer wurden nicht geschrieben).

**Status (2026-05-27): GEPRÜFT — Engine OK.** Round-Trip-Test ergänzt in
`engine/tests/integration/io/test_otx_roundtrip.py`
(`test_roundtrip_preserves_assoz_link_status`, 9/9 grün). Verifiziert an
`embb_pre_run.otx`: `load → dump → reparse` erhält 38 `PAssozBeleg`,
38 `PAssozBelegLinkStatusList`, 2 `PAssozBelegLinkInfo`; LinkInfo-Attrs
(`m_oRessBeleg`/`m_eStatus`/`m_eBaseStatus`) und LSL→LinkInfo-`sub_refs`
(`[[436]]`,`[[442]]`) bleiben identisch. Der G16-Verlust tritt NICHT ein.

**ABER — der echte Bug liegt in osim-ui, nicht hier:** Der Save-Pfad
`osim-ui/app/services/otx_json_tree.py::_apply_wire_to_instances`
(a) verwirft **neu vom UI angelegte** Objekte (`instances.get(oid)` → None →
skip), und (b) der Engine-Pass-Through schreibt für unsupported-Klassen die
**Original**-`otx_obj.attrs` zurück — Wire-Mutationen an bestehenden LinkInfos
werden also ignoriert. Fix-Ort: osim-ui (Wire→OTX-Reconcile: bestehende
`otx_obj.attrs` aus dem Wire aktualisieren + neue Wire-Objekte als OtxObject
materialisieren). Enum-Mapping beachten: Wire-Status ist int 0..3
(bevorzugt/standard/notfalls/geblockt), OTX nutzt `ABL_*`-Token.

---

## 2. Arbeits-/Einsatzzeiten an Ressourcen (AZeit-Subsystem) im Wire exponieren

**User-Bedarf (osim-ui):** Arbeits-/Einsatzzeiten an den Ressourcen sind im UI
nicht sichtbar. Sie existierten im OSim2004-Original.

**Befund:** Das ist das separate **OSimAZeit**-Subsystem (Personal-/
Einsatzzeit-Planung), NICHT das PPS-Durchlaufplan-Modell:
- `OSim2004/OSimV01(Fj)/inc/OSimAZeit.h` (Modul-Aggregator)
- Klassen: `AEinsatzzeitWunsch`, `AEinsatzWunsch` (Wochen-Kalender:
  `m_iGesamtWoche`/`m_iAktWoche`/`m_itage`), `AKapBed` (Kapazitätsbedarf),
  `AGruppe`, `APerson`, `ASimulator` (AZeit-Simulator).
- Engine-Skelett existiert bereits: `engine/docs/CONTEXT-P1-azeit-skelett.md`.

**Heutiger Stand der PPS-Ressourcen im Wire** (`PBetriebsmittel`/`PPerson`):
nur `m_iAnwWahrsch` (Anwesenheits-Wahrscheinlichkeit) + `m_dPtkEinsatzzeit`
(mittlere Einsatzzeit = Ergebnis-Metrik, readonly). KEIN Arbeitszeit-Kalender /
Schicht-Modell.

**Befund (2026-05-27): die Arbeitszeit-Daten SIND bereits voll im Wire.**
`load_to_wire(embb_pre_run.otx)` liefert (verifiziert):
- **260× `PTagRess`** — je Ressource×Tag, mit `m_oRessBeleg` (→ Ressourcen-OID)
  + `m_iTag` (Tag-Nummer). Das ist die konkrete Arbeitszeit-Zuordnung pro
  Ressource pro Tag.
- **3× `PTagesEinsatzzeit`** — Schichtfenster `m_iEinsatzAnfang`/`m_iEinsatzEnde`:
  (6.0–14.0) Früh, (14.0–22.0) Spät, (6.0–22.0) Voll.
- **3× `PEinsatzzeitTag`** — Tages-Templates mit `m_lPausen` (Pausenzyklen),
  `m_iBeginn`/`m_iEnde`/`m_iPause*`.
- Der Simulator hält sie in `m_lTagRess` (Container-Pointer, G16-Liste).
- **Alle drei Klassen sind loader- UND writer-unterstützt** (`_HANDLERS` +
  `_WRITERS`) → sie round-trippen.

Das **volle AZeit-Subsystem** (`AEinsatzzeitWunsch`/`AGruppe`/`AKapBed*`) ist im
PPS-Modell dagegen nur als **leeres Skelett** vorhanden (1× `AEinsatzzeitWunsch`
ohne Wochen/Tage-Daten) — es lebt in eigenen `.otx` mit `ASimulator`-Wurzel
(test.otx/dc1.otx/AZ-Tool.otx), nicht im PPS-Modell.

**→ Keine Engine-Wire-Exposure nötig.** Entscheidung wandert nach osim-ui:
- **(Empfohlen) Viewer auf den vorhandenen Daten:** PTagRess (Ressource→Tag) +
  PTagesEinsatzzeit (Schichtfenster) + PEinsatzzeitTag (Pausen) als
  Arbeitszeit-Kalender pro Ressource rendern. Daten sind da, kein Engine-Change.
- Das volle AZeit-Subsystem (AGruppe/AEinsatzzeitWunsch-Wochenkalender) erst
  wenn ein AZeit-`.otx` (ASimulator-Wurzel) tatsächlich geladen werden soll —
  das wäre echte neue Engine-Arbeit (Phase 5 AZeit-Implementierung), heute nicht
  nötig für die User-Anforderung „Arbeitszeiten an Ressourcen sehen".

osim-ui hat Viewer-Stubs (`AEinsatzWunsch`/`AKapBed`/`AGruppe`) — die sind für
das volle Subsystem; für die vorhandenen Daten braucht es einen Viewer auf
`PTagRess`/`PTagesEinsatzzeit`/`PEinsatzzeitTag`.

---

_Angelegt von der osim-ui-Session am 2026-05-27. Nicht committed — bitte im
osim-engine-Workflow aufgreifen._
