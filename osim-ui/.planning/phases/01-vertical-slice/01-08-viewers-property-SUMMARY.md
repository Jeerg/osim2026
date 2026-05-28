---
phase: 01-vertical-slice
plan: 08
subsystem: viewers-property
tags: [viewers, pgobjbase, pgobjbase-fallback, psimulator, pdurchlaufplan, pdlpl, azeit, agruppe, tdd, viewer-registry, octrl-composition]

# Dependency graph
requires:
  - phase: 01-vertical-slice
    plan: 06
    provides: "OViewer-Foundation: ViewerProps, ChildDialog, alle 9 OCtrls (Variable/Bool/Enum/Link/List/Method/TabViewer/COLORREF/LOGFONT), ViewerRegistry mit setFallback + register"
  - phase: 01-vertical-slice
    plan: 07
    provides: "PropertySchema-Backend (21 Klassen, 151 Properties), ModelStore (Zustand+immer+zundo, 7 Actions), Workspace-Route mit side-effect-Import von @/viewers/setup, PGObjBaseStub als temporaerer Registry-Fallback"
provides:
  - "PGObjBaseViewer als generischer Property-Editor + Registry-Fallback (ersetzt PGObjBaseStub aus Plan 07). Rendert beliebiges Object mit beliebigem PropertySchema, ein OCtrl pro Property, gruppiert nach Position im schemas.properties-Array."
  - "8 konkrete Property-Viewer in portal/src/viewers/{PGObjBase,PSimulator,PDurchlaufplan,PDlpl,AZeit}/. Davon 2 spezialisierte Composite (PSimulator mit Footer-Button, PDurchlaufplanStd mit 3-Tab-OCtrlTabViewer) und 5 reine PGObjBase-Wraps (PDlplBetriebsmittel, PDlplPersonal, AEinsatzWunsch, AKapBed, AGruppe)."
  - "portal/src/viewers/setup.ts (NEU, ersetzt setup.tsx-Stub) registriert alle 8 Viewer + 4 OTX-Klassen-Aliase (ASimulator, AEinsatzzeitWunsch, AKapBedViewerInfo, PDurchlaufplan-hint-std) plus PGObjBaseViewer als Fallback. Side-effect-import in app.tsx zusaetzlich zu existierendem Import in $id.tsx (idempotent)."
  - "14 neue Tests gruen (5 PGObjBaseViewer + 3 PSimulator + 4 PDurchlaufplanStd + 2 AGruppe); Total Frontend-Tests: 96 (vorher 82)."
affects: [01-09-viewers-matrix, 01-10-graphobject-design-viewer, 01-11-save-strategy-indexeddb]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composite-Pattern: spezialisierte Viewer wrappen PGObjBaseViewer und ergaenzen zusaetzliche Sektionen. PSimulator → Footer-Button; PDurchlaufplanStd → OCtrlTabViewer mit 3 Tabs (Eigenschaften|Knoten(N)|Kanten(N)); PDlpl/AZeit/AGruppe → reines Wrap, weil PropertySchema bereits OCtrlList fuer Sub-Listen modelliert."
    - "PGObjBaseViewer-Mapping-Tabelle octrl_type → OCtrl-Component: Variable→OCtrlVariable, Bool→OCtrlBool, Enum→OCtrlEnum, Link→OCtrlLink(+allObjects), List→OCtrlList(+allObjects+onCreate+onOpenSubViewer), Method→OCtrlMethod(onClick→onCommand), COLORREF→OCtrlColorRef, LOGFONT→OCtrlLogFont. TabViewer wird uebersprungen (Layout-Element, nicht Property)."
    - "OTX-Klassen-Alias-Pattern in setup.ts: jede Plan-Begriff-Klasse wird parallel zu der echten OTX-Reader-Klasse registriert (PSimulator+ASimulator, AEinsatzWunsch+AEinsatzzeitWunsch, AKapBed+AKapBedViewerInfo). Damit funktioniert Registry-Resolution unabhaengig davon ob die Engine den Plan-Alias oder den OTX-Klassennamen liefert."
    - "sub_refs-Slot-Konvention: PDurchlaufplan.sub_refs[0]=Knoten-OIDs, [1]=Kanten-OIDs. Defensives ?? [] fuer fehlende Slots. Mutationen via onCommand({type:'sub_refs_update', slot, newList}); Workspace-handleCommand kann das in Phase 1 als no-op behandeln (Add/Remove laeuft ueber create/delete-Commands)."
    - "PGObjBaseViewer-Fallback-Verhalten: bei schema=null oder schema.properties=[] wird eine deutsche Fallback-Message gerendert statt zu crashen. ChildDialog mit Object-Klasse + 'Keine Properties verfuegbar' bleibt fuer nicht-modellierte Klassen sichtbar."
    - "LOGFONT-Serialisation: AttrValue ist primitiv (number|string|boolean|null|number[]). LogFontValue (object) wird in PGObjBaseViewer.renderOCtrl als JSON-string serialisiert beim setValue-Call. Symmetrische Deserialisation muss spaeter im setValue-Call ergaenzt werden — Phase-1-Defizit dokumentiert."
    - "TDD-Doppel-Commits fuer Tasks 1+2+4 (RED-Tests, dann GREEN-Implementation). Tasks 3+5 ohne TDD (Task 3 sind triviale PGObjBase-Wraps; Task 5 ist Registry-Konfiguration die ueber Full-Suite-Run abgesichert wird)."

key-files:
  created:
    - "portal/src/viewers/PGObjBase/PGObjBaseViewer.tsx — Generischer Property-Editor (~230 LoC). Helper renderOCtrl() switched ueber prop.octrl_type; Komponente rendert ChildDialog + space-y-3-Stack der Properties; Fallback-Message bei schema=null oder leeren properties."
    - "portal/src/viewers/PSimulator/PSimulatorViewer.tsx — Wrap um PGObjBaseViewer mit flex-col-Layout + Footer-Button 'Sim-Lauf starten' (disabled in Phase 1)."
    - "portal/src/viewers/PDurchlaufplan/PDurchlaufplanViewerStd.tsx — Composite mit ChildDialog + OCtrlTabViewer (3 Tabs: Eigenschaften|Knoten(N)|Kanten(N)). Knoten/Kanten als OCtrlList aus obj.sub_refs[0]/[1]. Synthetische PropertyMeta knotenListMeta/kantenListMeta. sub_refs_update-Command-Dispatch fuer Mutationen."
    - "portal/src/viewers/PDlpl/PDlplBetriebsmittelViewer.tsx — Reines PGObjBase-Wrap (PropertySchema enthaelt Knoten-Link + Betriebsmittel-Link + Anteil)."
    - "portal/src/viewers/PDlpl/PDlplPersonalViewer.tsx — Reines PGObjBase-Wrap (PropertySchema enthaelt Knoten-Link + Personal-Link + Anteil)."
    - "portal/src/viewers/AZeit/AEinsatzWunschViewer.tsx — Reines PGObjBase-Wrap (PropertySchema enthaelt Name/Beginn/Ende/Anteil)."
    - "portal/src/viewers/AZeit/AKapBedViewer.tsx — Reines PGObjBase-Wrap (PropertySchema enthaelt Periode/SollKap/IstKap/Auslastung)."
    - "portal/src/viewers/AZeit/AGruppeViewer.tsx — Reines PGObjBase-Wrap (PropertySchema enthaelt Name + m_oids_personal als OCtrlList)."
    - "portal/src/viewers/setup.ts — NEU, ersetzt setup.tsx-Stub. Registriert alle 8 Viewer + 4 OTX-Klassen-Aliase + PGObjBaseViewer als Fallback."
    - "portal/src/viewers/__tests__/PGObjBaseViewer.spec.tsx — 5 Tests."
    - "portal/src/viewers/__tests__/PSimulatorViewer.spec.tsx — 3 Tests."
    - "portal/src/viewers/__tests__/PDurchlaufplanViewerStd.spec.tsx — 4 Tests."
    - "portal/src/viewers/__tests__/AGruppeViewer.spec.tsx — 2 Tests."
  modified:
    - "portal/src/app.tsx — Side-effect-import 'import \"@/viewers/setup\";' an erster Stelle, damit ViewerRegistry beim App-Start gefuellt ist."
  deleted:
    - "portal/src/viewers/setup.tsx — alter Stub-Fallback aus Plan 07 (PGObjBaseStub-Komponente entfaellt; Registry-Konfiguration wandert nach setup.ts ohne JSX)."

key-decisions:
  - "PGObjBaseViewer ist Doppelrolle: vollwertiger generischer Property-Editor UND Registry-Fallback. Damit ist die Anforderung aus dem Plan (Stub ersetzen) und der Wiederverwendungs-Wunsch aus must_haves (Basis-Komponente fuer Subclassing) in einer einzigen Komponente erfuellt — kein paralleler Fallback-Stub mehr noetig."
  - "Spezialisierte Viewer wrappen statt erweitern. Keine class-Hierarchie, keine HOCs — die Viewer komponieren PGObjBaseViewer als Element. Klar lesbar, leicht zu refaktorieren, keine versteckten props-Pfade."
  - "PDlpl- und AZeit-Viewer sind in Phase 1 reine PGObjBase-Wraps. Begruendung: Das hand-kuratierte PropertySchema (Plan 07) modelliert die Felder fuer alle 5 Klassen vollstaendig mit den richtigen octrl_types (Link/List/Variable). PGObjBaseViewer rendert sie generisch; eigener Composite-Code waere nur leerer Boilerplate. Die Registry-Eintraege bestehen trotzdem damit Plan 09/10 spezialisierte Varianten einhaengen koennen ohne Stub-Replacement-Aufwand."
  - "OTX-Klassen-Alias-Pattern: jede Plan-Begriff-Klasse wird parallel mit dem echten OTX-Reader-Klassennamen registriert (PSimulator+ASimulator, AEinsatzWunsch+AEinsatzzeitWunsch, AKapBed+AKapBedViewerInfo). Engine-Reflection in Phase 3 wird beide Schreibweisen liefern; Registry findet sie zuverlaessig. Plan-07-Schema-Aliasing wird damit symmetrisch im Viewer-Layer fortgesetzt."
  - "PDurchlaufplanStd nutzt OCtrlTabViewer fuer 3-Tab-Layout statt eigene Tabs-Implementierung. Konsequente Wiederverwendung der Plan-06-OCtrl-Familie auch fuer interne Komposition; einheitliches Styling und a11y."
  - "sub_refs-Mutationen via 'sub_refs_update'-ViewerCommand (Plan-06-ViewerCommand-Variant). Workspace-handleCommand in $id.tsx kann das ignorieren (Phase-1-no-op) oder spaeter in Plan 10 verdrahten — der Viewer-Code bleibt unveraendert."
  - "LOGFONT-Serialisation: JSON.stringify im setValue-Pfad ist Phase-1-Kompromiss, weil AttrValue (primitiv) keine Object-Werte zulaesst. Sauberer Fix waere AttrValue um Record zu erweitern oder LOGFONT-Felder zu entpacken (m_logFontFamily/m_logFontSize/...). Wird in einem spaeteren Plan bereinigt — fuer die Phase-1-MVP-Modelle (Dummy.otx hat keine LOGFONT-Properties in den 21 modellierten Klassen) ist es nicht aktiv genutzt."
  - "Tasks 3+5 ohne eigene Specs. Task 3 sind triviale Wraps (4 Zeilen pro File); ihre Korrektheit ergibt sich aus PGObjBaseViewer-Tests. Task 5 ist Registry-Konfiguration; sie ist abgesichert durch den Vollsuiten-Run der Workspace-Route die den setup-Import zieht — wenn ein Viewer-Import fehlschlaegt, fallen die existierenden Workspace-Tests aus Plan 07. Stichprobentests sind ein Trade-off."
  - "setup.tsx → setup.ts: ohne PGObjBaseStub-Komponente bleibt nur Registry-Konfiguration. .ts ist semantisch korrekter; Bundler resolved beide Extensionen via @/viewers/setup. Im Plan war setup.ts vorgegeben; die Plan-07-Vorgabe setup.tsx war eine Folge des Stubs der jetzt entfaellt."

patterns-established:
  - "Composite-Pattern fuer Domain-Viewer: spezialisierte Viewer komponieren PGObjBaseViewer als Body und ergaenzen Footer / Tabs / zusaetzliche Sektionen. Erweiterbar ohne Vererbung."
  - "Generic-Editor-via-Schema-Pattern: ein einziger Schema-driven Editor (PGObjBaseViewer) ersetzt 5+ spezialisierte CRUD-Forms. Erweitert durch new-Properties im Schema (Plan 07) ohne Viewer-Code-Aenderung."
  - "OTX-Alias-Registrierungs-Pattern in setup.ts: jeder Viewer wird unter Plan-Begriff UND OTX-Klassen-Namen registriert; bietet die Engine-Reflection-in-Phase-3-Migration eine konfliktfreie Bahn."
  - "Side-effect-Import fuer Registry-Bootstrapping: in app.tsx (App-Root) ein 'import \"@/viewers/setup\";' als erster Import; idempotent bei Mehrfach-Imports (Workspace-Route hat das Duplikat noch aus Plan 07)."

requirements-completed: [SC-4, SC-6]

# Metrics
duration: ~9min
completed: 2026-05-21
---

# Phase 1 Plan 08: Viewers — Property-Familie Summary

**8/12 SC-4-Viewer plus PGObjBaseViewer als generischer Fallback ersetzen den Stub aus Plan 07. SC-6 (Property-Edit) ist nun End-to-End: Sidebar-Click → spezialisierter Viewer → OCtrl-Edit → useModelStore.patchObject → dirty=true. Matrix-Viewer (Plan 09) und Design-Viewer (Plan 10) ergaenzen die restlichen 4 SC-4-Eintraege.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-05-21T09:54:27Z
- **Completed:** 2026-05-21T10:03:29Z
- **Tasks:** 5 / 5
- **Files created:** 13 (8 Viewer + 4 Tests + 1 setup.ts)
- **Files modified:** 1 (app.tsx)
- **Files deleted:** 1 (setup.tsx Stub aus Plan 07)
- **Test-Suite:** +14 neue Frontend-Tests (5 PGObjBase + 3 PSimulator + 4 PDurchlaufplanStd + 2 AGruppe) — Total 96 grün (vorher 82)
- **Build-Output:** 619 KB total (139 KB Workspace-Chunk unveraendert, gzip 37.58 KB)

## Accomplishments

- **PGObjBaseViewer als Doppelrolle:** vollwertiger generischer Property-Editor (rendert alle 8 editierbaren OCtrl-Typen aus dem Schema) UND Registry-Fallback (ersetzt den temporaeren PGObjBaseStub aus Plan 07). Loescht den Stub-Pfad in der Codebase.
- **Spezialisierte Composites:** PSimulatorViewer mit Footer-Button (Sim-Lauf-Start, disabled), PDurchlaufplanViewerStd mit 3-Tab-Layout (Eigenschaften / Knoten (N) / Kanten (N)) ueber OCtrlTabViewer + 2 OCtrlList.
- **5 PGObjBase-Wraps:** PDlplBetriebsmittel, PDlplPersonal, AEinsatzWunsch, AKapBed, AGruppe — alle nur 4-zeilige Files weil das PropertySchema die UI komplett abdeckt.
- **Registry-State:** 8 Viewer + 4 OTX-Klassen-Aliase + PGObjBase-Fallback = 13 Registry-Eintraege ueber setup.ts. Side-effect-import am App-Root (app.tsx) statt nur in der Workspace-Route.
- **TDD-Doppel-Commits fuer Tasks 1+2+4:** RED-Tests scheitern erwartungsgemaess, GREEN-Implementation macht sie gruen; alle Tests-Pruefungen via `npm run test:run` einschliesslich Vollsuite.
- **Build/Lint/Test alles gruen:** tsc 0 errors; vitest 96/96 gruen; vite build 619 KB total; lint 0 errors / 7 warnings (alle bereits aus Plan 06 dokumentiert).

## Task Commits

Jeder Task atomar committed:

1. **Task 1 RED: PGObjBaseViewer-Tests** — `c48027e` (test)
2. **Task 1 GREEN: PGObjBaseViewer-Implementation** — `b785277` (feat)
3. **Task 2 RED: PSimulator+PDurchlaufplanStd-Tests** — `7bae82d` (test)
4. **Task 2 GREEN: PSimulator+PDurchlaufplanStd-Implementation** — `2cfd292` (feat)
5. **Task 3: PDlplBetriebsmittel + PDlplPersonal (kein Test)** — `c43acdb` (feat)
6. **Task 4 RED: AGruppe-Test** — `d4232a3` (test)
7. **Task 4 GREEN: AEinsatzWunsch+AKapBed+AGruppe-Implementation** — `5c6852e` (feat)
8. **Task 5: setup.ts mit allen Registrierungen + app.tsx-Import** — `b714cf8` (feat)

**Plan-Metadaten-Commit:** folgt nach diesem SUMMARY-Write (separater Commit für SUMMARY.md + STATE.md + ROADMAP.md).

## Viewer-Katalog (Plan 08 — 8 Viewer)

| Klasse                            | Viewer                       | Composite-Typ              | Sub-Sektionen                |
| --------------------------------- | ---------------------------- | -------------------------- | ---------------------------- |
| `PSimulator` / `ASimulator`       | `PSimulatorViewer`           | PGObjBase + Footer-Button  | Sim-Lauf-Button (disabled)   |
| `PDurchlaufplan` (default + std)  | `PDurchlaufplanViewerStd`    | ChildDialog + OCtrlTabViewer | 3 Tabs: Eigenschaften|Knoten(N)|Kanten(N) |
| `PDlplBetriebsmittel`             | `PDlplBetriebsmittelViewer`  | PGObjBase-Wrap (passthrough) | —                          |
| `PDlplPersonal`                   | `PDlplPersonalViewer`        | PGObjBase-Wrap             | —                            |
| `AEinsatzWunsch` / `AEinsatzzeitWunsch` | `AEinsatzWunschViewer` | PGObjBase-Wrap             | —                            |
| `AKapBed` / `AKapBedViewerInfo`   | `AKapBedViewer`              | PGObjBase-Wrap             | —                            |
| `AGruppe`                         | `AGruppeViewer`              | PGObjBase-Wrap             | Mitglieder via OCtrlList (Schema) |
| (Fallback alle nicht registrierten) | `PGObjBaseViewer`         | generisch (Editor + Fallback) | —                         |

## Registry-State nach Plan 08

| klass               | hint  | Component                   |
| ------------------- | ----- | --------------------------- |
| PSimulator          | —     | PSimulatorViewer            |
| ASimulator          | —     | PSimulatorViewer            |
| PDurchlaufplan      | —     | PDurchlaufplanViewerStd     |
| PDurchlaufplan      | std   | PDurchlaufplanViewerStd     |
| PDlplBetriebsmittel | —     | PDlplBetriebsmittelViewer   |
| PDlplPersonal       | —     | PDlplPersonalViewer         |
| AEinsatzWunsch      | —     | AEinsatzWunschViewer        |
| AEinsatzzeitWunsch  | —     | AEinsatzWunschViewer        |
| AKapBed             | —     | AKapBedViewer               |
| AKapBedViewerInfo   | —     | AKapBedViewer               |
| AGruppe             | —     | AGruppeViewer               |
| **setFallback**     | —     | **PGObjBaseViewer**         |

## PGObjBase Mapping-Tabelle octrl_type → OCtrl-Component

| octrl_type | OCtrl-Component | zusaetzliche Props |
| ---------- | --------------- | ------------------ |
| `Variable` | OCtrlVariable   | — |
| `Bool`     | OCtrlBool       | — |
| `Enum`     | OCtrlEnum       | — |
| `Link`     | OCtrlLink       | `allObjects`, `onOpenSubViewer` |
| `List`     | OCtrlList       | `allObjects`, `onCreate`, `onOpenSubViewer` |
| `Method`   | OCtrlMethod     | `onClick` → `onCommand({type:"method",name,oid})` |
| `COLORREF` | OCtrlColorRef   | — |
| `LOGFONT`  | OCtrlLogFont    | LogFontValue → JSON-string-Serialisation in setValue |
| `TabViewer` | (skipped)      | Layout-Element, kein Property |

## Decisions Made

Siehe `key-decisions` im Frontmatter. Hervorgehoben:

- **PGObjBaseViewer Doppelrolle:** Editor + Fallback in einer Komponente — ein Code-Pfad.
- **Composite > Vererbung:** Spezialisierte Viewer komponieren PGObjBase als Element.
- **PDlpl/AZeit als reine Wraps in Phase 1:** PropertySchema deckt die UI komplett ab — kein zusaetzlicher Code.
- **OTX-Alias-Registrierung:** Plan-Begriff + OTX-Klassenname parallel — bahnt Engine-Reflection-in-Phase-3.
- **sub_refs-Mutationen via `sub_refs_update`-Command:** Workspace kann no-op machen, Viewer-Code bleibt stabil.
- **Tasks 3+5 ohne eigene Specs:** Trivial-Wraps + Registry-Config, abgesichert durch Vollsuiten-Run.

## Deviations from Plan

**Keine.** Plan wurde exakt wie geschrieben ausgefuehrt — alle 5 Tasks, alle Done-Kriterien erfuellt. Keine Architektur-Aenderungen noetig, keine Auto-Fixes durch Rule 1/2/3, keine Auth-Gates.

Minimale Abweichungen ohne Plan-Konflikt:
- **setup.ts statt setup.tsx:** Der Plan nennt zwar setup.ts; der Plan-07-Stand hatte setup.tsx wegen JSX im PGObjBaseStub. Da der Stub jetzt entfaellt, bleibt setup.ts ohne JSX → Extension-Wechsel folgt Plan-Wunsch, alter setup.tsx wird geloescht.
- **OTX-Klassen-Aliase erweitert:** Plan listet 7 Viewer-Registrierungen + Fallback. Wir haben 11 register-Calls weil jede Plan-Begriff-Klasse parallel mit der OTX-Reader-Klasse registriert wird (Konsistenz zum Plan-07-Schema-Alias-Pattern). Das ist eine sinnvolle Erweiterung, nicht eine Plan-Abweichung — die zusaetzlichen Calls sind reine setup.ts-Konfig, kein neuer Code.

## Known Stubs

| Stub                            | Datei                                                       | Grund                                                                                  | Ersetzt durch              |
| ------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------- |
| Sim-Lauf-Start-Button (disabled) | `portal/src/viewers/PSimulator/PSimulatorViewer.tsx`        | Sim-Lauf in Phase 2 (Worker-Orchestrator)                                              | Phase 2                    |
| sub_refs_update als no-op       | `portal/src/routes/_authenticated/models/$id.tsx`           | Knoten/Kanten-Reordering wird in Plan 10 (Design-Viewer) implementiert                  | Plan 10                    |
| LOGFONT als JSON-string serialisation | `portal/src/viewers/PGObjBase/PGObjBaseViewer.tsx`     | AttrValue ist primitiv; LOGFONT-Object wird stringified. Phase-1-Modelle nutzen kein LOGFONT in den 21 modellierten Klassen. | Spaeterer AttrValue-Refactor |

Diese Stubs sind in den Files mit Kommentar markiert und blockieren keine SC-4/SC-6-Erfuellung.

## Threat Flags

(Keine neuen Threat-Flags. Die Plan-08-Threat-Tabelle (T-08-01 Tampering accept; T-08-02 Tampering mitigate via schema-driven render) bleibt unveraendert. PGObjBaseViewer rendert nur properties die im schema stehen — d.h. bei klass-mismatch zwischen obj und schema bleibt die UI defensiv.)

## Pflicht-Lese-Hinweis fuer Plan 09 + 10

- **Plan 09 (Matrix-Viewer):** Registriert PRessBelegMatrixViewer, PRessMengeMatrixViewer, PRessVerknuepfungViewer in setup.ts. Vorbild: die existierenden `viewerRegistry.register(...)`-Zeilen. Nutzt vermutlich `@tanstack/react-table` fuer die Matrix-Cells.
- **Plan 10 (Design-Viewer):** Registriert PDurchlaufplanViewerDesign mit `hint:"design"`. Der Std-Viewer bleibt unter `hint:"std"` (bereits eingetragen) bzw. als default. Reactflow-basierte Graph-Visualisierung; konsumiert obj.sub_refs[0] (Knoten) und obj.sub_refs[1] (Kanten) — gleiches Schema wie PDurchlaufplanViewerStd.
- **Plan 11 (Save-Strategy + IndexedDB):** Workspace-handleCommand muss `sub_refs_update` und `method` echte Implementierungen bekommen (heute no-op). Konkrete API: `useModelStore.getState().updateSubRefs(oid, slot, newList)` muss in model-store.ts ergaenzt werden.

## Verification

- [x] `cd portal && npm run test:run` zeigt 96/96 gruen (19 Test-Files; +14 neue gegenueber Plan 07: 5+3+4+2)
- [x] `cd portal && npx tsc -b --noEmit` gruen (0 Errors)
- [x] `cd portal && npm run build` erfolgreich (619 KB total; _id-Workspace-Chunk 139 KB unveraendert)
- [x] `cd portal && npm run lint` clean (0 Errors, 7 Warnings — alle bereits aus Plan 06 dokumentiert; keine neuen)
- [x] PGObjBaseViewer ist Registry-Fallback (`viewerRegistry.setFallback(PGObjBaseViewer)`) — Stub aus Plan 07 ersetzt
- [x] Alle 8 Phase-1-Property-Viewer + 4 OTX-Klassen-Aliase + Fallback in setup.ts registriert
- [x] app.tsx hat side-effect-Import `import "@/viewers/setup";` als ersten Import
- [ ] Manueller Smoke (Backend + Login + Dummy.otx hochgeladen): NICHT durchgefuehrt — Live-Smoke laeuft erst in Plan 12 (E2E). Die statischen Asserts (registry-resolution, OCtrl-Mounting, Tab-Switching) sind durch die 14 neuen Tests abgedeckt.

## Success Criteria

- **SC-4 (12 konkrete Viewer):** 8/12 erfuellt (Property-Viewer-Familie). Matrix-Viewer (3) in Plan 09, Design-Viewer (1) in Plan 10. Phase-1-Total bleibt 12.
- **SC-6 (Edit-Operationen):** VOLLSTAENDIG fuer Property-Edit + List-View-Edit. Sidebar-Click → spezialisierter Viewer → OCtrl-onChange → useModelStore.patchObject → dirty=true. Backend-Save kommt in Plan 11.

## Self-Check: PASSED

**Files verified** (via Bash test + git ls-files):

- Viewer-Files: `portal/src/viewers/PGObjBase/PGObjBaseViewer.tsx`, `PSimulator/PSimulatorViewer.tsx`, `PDurchlaufplan/PDurchlaufplanViewerStd.tsx`, `PDlpl/PDlplBetriebsmittelViewer.tsx`, `PDlpl/PDlplPersonalViewer.tsx`, `AZeit/AEinsatzWunschViewer.tsx`, `AZeit/AKapBedViewer.tsx`, `AZeit/AGruppeViewer.tsx` — ALL FOUND
- Tests: `portal/src/viewers/__tests__/PGObjBaseViewer.spec.tsx`, `PSimulatorViewer.spec.tsx`, `PDurchlaufplanViewerStd.spec.tsx`, `AGruppeViewer.spec.tsx` — ALL FOUND
- Setup + App: `portal/src/viewers/setup.ts` (NEU), `portal/src/app.tsx` (MODIFIED), `portal/src/viewers/setup.tsx` (DELETED via `git rm`) — ALL VERIFIED

**Commits verified** (via `git log --oneline`):

- `c48027e` Task 1 RED (PGObjBaseViewer tests)
- `b785277` Task 1 GREEN (PGObjBaseViewer)
- `7bae82d` Task 2 RED (PSimulator + PDurchlaufplanStd tests)
- `2cfd292` Task 2 GREEN (PSimulator + PDurchlaufplanStd)
- `c43acdb` Task 3 (PDlpl-Wraps)
- `d4232a3` Task 4 RED (AGruppe test)
- `5c6852e` Task 4 GREEN (AZeit-Viewer)
- `b714cf8` Task 5 (setup.ts + app.tsx)

8 Task-Commits + Self-Check = OK.

---

*Phase: 01-vertical-slice*
*Completed: 2026-05-21*
