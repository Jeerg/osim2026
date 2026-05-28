/**
 * Viewer-Setup — registriert alle konkreten Viewer-Komponenten in der
 * ViewerRegistry und setzt PGObjBaseViewer als Fallback.
 *
 * Side-Effect-Import: Dieses Modul wird in `app.tsx` (App-Root) einmalig
 * importiert, damit die Registry beim App-Start gefüllt ist. Im
 * Workspace-Route (`/_authenticated/models/$id`) wird der Import nochmals
 * referenziert — TypeScript ist idempotent gegenüber Mehrfach-Imports
 * (Side-Effects laufen nur einmal pro Modul).
 *
 * Registry-State nach Plan 10:
 *   PSimulator          → PSimulatorViewer           (Top-Level-Modellsicht)
 *   PDurchlaufplan      → PDurchlaufplanViewerStd    (Standard-Ansicht,
 *                                                     hint optional / "std")
 *   PDurchlaufplan/design → PDurchlaufplanViewerDesign (graphisch,
 *                                                     React-Flow-Canvas)
 *   PDlplBetriebsmittel → PDlplBetriebsmittelViewer  (Knoten↔BM-Verknüpfung)
 *   PDlplPersonal       → PDlplPersonalViewer        (Knoten↔Person-Verknüpfung)
 *   AEinsatzWunsch      → AEinsatzWunschViewer       (Schicht-Editor)
 *   AKapBed             → AKapBedViewer              (Kapazitätsbedarf)
 *   AGruppe             → AGruppeViewer              (Personalgruppe)
 *   PRessMenge/matrix   → PRessMengeMatrixViewer     (Mengen-Matrix)
 *   (Fallback)          → PGObjBaseViewer            (generischer
 *                                                     Property-Editor)
 *
 * Hinweis Pre-Cleanup 01.2-01 (2026-05-25): die Phase-1-Stubs
 * `PRessBelegMatrixViewer` (flache Property-Liste statt 2D-Matrix) und
 * `PRessVerknuepfungViewer` (erfundene Wire-Klass `PRessVerknuepfung`)
 * wurden entfernt. Die echte 2D-Belegungs-Matrix entsteht in Welle 1.2-E
 * (Plan 06) unter `portal/src/viewers/PRessBelegMatrix/` auf Basis der
 * neuen MatrixGrid-Foundation (Welle 1.2-A–D). Der `PAssozBeleg`-Reflection-
 * Alias wird dort gemeinsam mit dem echten OTX-Schema verdrahtet (siehe
 * .planning/phases/01.2-…/01.2-SCHEMA-MAP.md zu den Wire-Slot-Indizes).
 *
 * Hinweis OTX-Klassennamen-Aliase: Das PropertySchema (Plan 07) führt
 * BEIDE Schreibweisen parallel (Plan-Begriff + OTX-Reader-Klassen). Wir
 * registrieren beide Schreibweisen, damit die Registry-Resolution für
 * echte OTX-Daten (z.B. `ASimulator`) UND Plan-Aliase (z.B. `PSimulator`)
 * den richtigen Viewer findet.
 *
 * Design-Viewer (PDurchlaufplanDesign) ist seit Plan 10 registriert. Der
 * Sidebar/Workspace-ViewerHintSwitcher muss `viewerHint='design'` setzen
 * (Backlog Plan 11) — heute landet jeder Sidebar-Click auf einen Plan im
 * Std-Viewer.
 *
 * Sidebar-Knoten "Belegungsressourcen" / "Mengenressourcen" muss
 * viewerHint='matrix' setzen, sobald der Tree-Builder Gruppen-Knoten
 * unterscheidet (siehe Plan 11 Backlog).
 */

import { viewerRegistry } from "@/viewers/core/ViewerRegistry";
import { PGObjBaseViewer } from "@/viewers/PGObjBase/PGObjBaseViewer";
import { PSimulatorViewer } from "@/viewers/PSimulator/PSimulatorViewer";
import { PDurchlaufplanViewerStd } from "@/viewers/PDurchlaufplan/PDurchlaufplanViewerStd";
import { PDurchlaufplanViewerDesign } from "@/viewers/PDurchlaufplan/PDurchlaufplanViewerDesign";
import { PDlplBetriebsmittelViewer } from "@/viewers/PDlpl/PDlplBetriebsmittelViewer";
import { PDlplPersonalViewer } from "@/viewers/PDlpl/PDlplPersonalViewer";
import { AEinsatzWunschViewer } from "@/viewers/AZeit/AEinsatzWunschViewer";
import { AKapBedViewer } from "@/viewers/AZeit/AKapBedViewer";
import { AGruppeViewer } from "@/viewers/AZeit/AGruppeViewer";
import { PRessMengeMatrixViewer } from "@/viewers/PRess/PRessMengeMatrixViewer";
import { PRessBelegMatrixViewer } from "@/viewers/PRessBelegMatrix/PRessBelegMatrixViewer";
import { PDlplConnKnotenViewer } from "@/viewers/PDlplConnKnoten/PDlplConnKnotenViewer";
import { PRessVerknuepfungViewer } from "@/viewers/PRessVerknuepfung/PRessVerknuepfungViewer";
import { PEinsatzViewer } from "@/viewers/PEinsatz/PEinsatzViewer";

// PSimulator (Plan-Alias) + ASimulator (echter OTX-Klasse) → gleicher Viewer
viewerRegistry.register({ klass: "PSimulator", Component: PSimulatorViewer });
viewerRegistry.register({ klass: "ASimulator", Component: PSimulatorViewer });

// Arbeits-/Einsatzzeiten-Matrix auf dem Simulator (1:1 OSim2004 PEinsatzViewer,
// ebenfalls ein Simulator-Viewer). Hint "einsatzzeit" — erreichbar über den
// Tree-Gruppen-Knoten "Arbeitszeiten" + den ViewerHintSwitcher.
viewerRegistry.register({
  klass: "PSimulator",
  hint: "einsatzzeit",
  Component: PEinsatzViewer,
});
viewerRegistry.register({
  klass: "ASimulator",
  hint: "einsatzzeit",
  Component: PEinsatzViewer,
});
// Klick auf eine Schicht im Tree-Knoten "Arbeitszeiten" → Arbeitszeit-Matrix
// mit dieser Schicht aktiv (der Viewer löst den Simulator aus allObjects auf).
viewerRegistry.register({
  klass: "PEinsatzzeitTag",
  hint: "einsatzzeit",
  Component: PEinsatzViewer,
});

// PDurchlaufplan — Default ohne Hint (= "std") + Hint-Aliase.
// Plan 10 registriert zusätzlich die "design"-Variante (graphisch).
viewerRegistry.register({
  klass: "PDurchlaufplan",
  Component: PDurchlaufplanViewerStd,
});
viewerRegistry.register({
  klass: "PDurchlaufplan",
  hint: "std",
  Component: PDurchlaufplanViewerStd,
});
viewerRegistry.register({
  klass: "PDurchlaufplan",
  hint: "design",
  Component: PDurchlaufplanViewerDesign,
});

// Knoten↔Ressource-Verknüpfungen (Phase-1-MVP sind das PGObjBase-Wraps,
// hier aber als eigene Klasse registriert damit Plan 09/10 spezialisierte
// Varianten ohne Registry-Re-Wiring einhängen können).
viewerRegistry.register({
  klass: "PDlplBetriebsmittel",
  Component: PDlplBetriebsmittelViewer,
});
viewerRegistry.register({
  klass: "PDlplPersonal",
  Component: PDlplPersonalViewer,
});

// AZeit-Familie (Schichten, Kapazitätsbedarf, Personalgruppen).
// AEinsatzWunsch ist Plan-Alias; AEinsatzzeitWunsch ist echter OTX-Klassenname.
viewerRegistry.register({
  klass: "AEinsatzWunsch",
  Component: AEinsatzWunschViewer,
});
viewerRegistry.register({
  klass: "AEinsatzzeitWunsch",
  Component: AEinsatzWunschViewer,
});

// AKapBed (Plan-Alias) + AKapBedViewerInfo (echter OTX-Klassenname).
viewerRegistry.register({ klass: "AKapBed", Component: AKapBedViewer });
viewerRegistry.register({
  klass: "AKapBedViewerInfo",
  Component: AKapBedViewer,
});

viewerRegistry.register({ klass: "AGruppe", Component: AGruppeViewer });

// ---------------------------------------------------------------------------
// Matrix-Viewer-Familie (Plan 09) — Ressourcen-Perspektive Bereich C
// ---------------------------------------------------------------------------
//
// PRessMenge:
//   - OHNE Hint    → Fallback (PGObjBaseViewer = Property-Editor fuer das einzelne
//                    Objekt). Dieser Pfad bleibt fuer Sidebar-Click auf einen
//                    konkreten Eintrag.
//   - Mit Hint "matrix" → Matrix-Viewer fuer ALLE Objekte der Klasse. Dieser
//                    Pfad wird ausgeloest wenn der User in der Sidebar einen
//                    Gruppen-Knoten ("Mengenressourcen") anklickt.
//
// PRessBeleg/matrix (Welle 1.2-E, Plan 06):
//   Die echte 2D-Belegungs-Matrix Ressource × Knoten × PAssozBeleg-Status,
//   auf Basis der MatrixGrid-Foundation (Welle 1.2-A–D). Wire-Slot-
//   Indizes für die PAssozBeleg/PDpKn*-Wrapper-Indirektion (PRessBelegLList
//   / PAssozRessourceLList) sind in 01.2-SCHEMA-MAP.md dokumentiert; der
//   Cell-Create-Pfad implementiert Wrapper-Lazy-Create gemaess Plan-Audit.
viewerRegistry.register({
  klass: "PRessMenge",
  hint: "matrix",
  Component: PRessMengeMatrixViewer,
});

viewerRegistry.register({
  klass: "PRessBeleg",
  hint: "matrix",
  Component: PRessBelegMatrixViewer,
});

// Welle 1.2-H (Plan 09) — UI-Verdrahtung: PDurchlaufplan ist im Tree der
// klickbare Knoten, der den Belegungs-Viewer konsumieren soll (der Viewer
// liest `obj.attrs.m_lKnoten` als Spalten-Quelle aus dem Plan-Objekt). Plan
// 11 war Backlog, wird hier bereits gezogen, damit die E2E-Spec
// matrix-cell-edit-persistence.spec.ts ueberhaupt zur Matrix navigieren kann
// und der HintSwitcher den "Matrix"-Pillen-Button anzeigt (zusaetzlich zum
// schemas.json-Eintrag `viewer_hints: ["std","design","matrix"]` fuer
// PDurchlaufplan).
viewerRegistry.register({
  klass: "PDurchlaufplan",
  hint: "matrix",
  Component: PRessBelegMatrixViewer,
});

// ---------------------------------------------------------------------------
// Knoten-Detail-Graph (Welle 1.2-F, Plan 07)
// ---------------------------------------------------------------------------
//
// PDlplConnKnotenViewer ist der Knoten-zentrierte Detail-Graph: zentral der
// gewählte PDlplKnoten (SetMoveForbidden + SetDeleteForbidden), drumherum
// die Assoz-Ressourcen + Speicher-Assoziationen via Wrapper-Indirektion
// (PAssozRessourceLList / PRessBelegLList / PSpeicherProzLList — siehe
// 01.2-SCHEMA-MAP.md und 01.2-07-CPP-AUDIT.md).
//
// Konsumiert die GraphObject-Foundation aus Phase 1.1 (OGraphGrid +
// GObjLink + GLink + GraphFlowCanvas). Der "conn"-Hint kommt aus dem
// C++-Klassennamen PDlplConnKnotenViewer ("Conn" = "Connections" zwischen
// Knoten und seinen Verknüpfungen).
//
// Phase 1.2 ist Read-Only (disabled default true). Der Listener-Hook
// useSimulationListener ist Phase-4-Vorbereitung (WebSocket /ws/runs/{run_id}).
viewerRegistry.register({
  klass: "PDlplKnoten",
  hint: "conn",
  Component: PDlplConnKnotenViewer,
});
viewerRegistry.register({
  klass: "PDpKnKonstant",
  hint: "conn",
  Component: PDlplConnKnotenViewer,
});
viewerRegistry.register({
  klass: "PDpKnAlternativ",
  hint: "conn",
  Component: PDlplConnKnotenViewer,
});
viewerRegistry.register({
  klass: "PDpKnRuecksprung",
  hint: "conn",
  Component: PDlplConnKnotenViewer,
});
viewerRegistry.register({
  klass: "PDpKnAELogikSteuerung",
  hint: "conn",
  Component: PDlplConnKnotenViewer,
});

// ---------------------------------------------------------------------------
// Ressource-Verknüpfungs-Graph (Welle 1.2-G, Plan 08)
// ---------------------------------------------------------------------------
//
// PRessVerknuepfungViewer ist der Ressource-zentrierte Detail-Graph: zentral
// die Ressource (PBetriebsmittel / PPerson / PRessBeleg), drumherum alle
// PDpKn*-Knoten, die die Ressource via Belegungs-Assoz referenzieren —
// gefunden per Reverse-Index über alle PDpKn*-Objekte mit Wrapper-Pfad
// (knoten.m_lAssozRess → PAssozRessourceLList → PAssozBeleg.m_lRessourcen
// → PRessBelegLList → ressOid). Links: pro Verknüpfung 2 Links Knoten→Assoz
// + Assoz→Ress (1:1 C++ PRessVerknuepfungViewer dFillAssoz Z.207-215).
//
// Anders als der gelöschte Phase-1-Stub (siehe 01.2-01-SUMMARY.md) wird KEINE
// erfundene Wire-Klass `PRessVerknuepfung` mehr geschrieben — der Viewer
// liest existierende OSim2004-Strukturen rückwärts (siehe 01.2-08-CPP-AUDIT.md).
//
// Layout: links TTY-Pane (w-48) mit Knoten-Listeneinträgen,
// rechts Graph-Pane mit Kennzahl-Slot-Placeholder oben rechts.
// Der Kennzahl-Slot ist visueller Phase-4-Vorgriff (m_drawKennzahl + m_iKnz
// + m_dScaleKnz + m_dMax aus PGObjBaseViewer.h Z.157-160); Backend-
// Verdrahtung über WebSocket /ws/runs/{run_id} kommt in Phase 4.
//
// Phase 1.2 ist Read-Only (disabled default true). Listener-Hook
// useSimulationListener wird aus Welle 1.2-F re-used (single source of truth).
viewerRegistry.register({
  klass: "PRessBeleg",
  hint: "verknuepfung",
  Component: PRessVerknuepfungViewer,
});
viewerRegistry.register({
  klass: "PBetriebsmittel",
  hint: "verknuepfung",
  Component: PRessVerknuepfungViewer,
});
viewerRegistry.register({
  klass: "PPerson",
  hint: "verknuepfung",
  Component: PRessVerknuepfungViewer,
});

// Fallback für unregistrierte Klassen (z.B. PDpKnKonstant, PDlplKante,
// PBetriebsmittel, PPerson, PAslEinzel, …). Das ist der Hauptgrund warum
// PGObjBaseViewer existiert — er rendert generisch über das PropertySchema.
viewerRegistry.setFallback(PGObjBaseViewer);

// Marker-Export, damit der Import nicht weg-optimiert wird.
export const VIEWER_SETUP_DONE = true;
