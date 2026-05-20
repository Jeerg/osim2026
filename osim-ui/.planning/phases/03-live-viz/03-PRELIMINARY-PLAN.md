# Phase 3 — Live-Visualisierung mit GraphObject-Schicht

**Milestone:** v0.1.0  
**Stand:** 2026-05-20 (Entwurf, vor Discussion-Phase)  
**Aufwand-Schätzung:** 3–4 Wochen (1 Dev)  
**Voraussetzungen:** Phase 1 und Phase 2 abgeschlossen.

---

## 1. Ziel der Phase

User sieht den Sim-Lauf **live im Browser** mit:
1. einem **graphischen Durchlaufplan-Editor + Viewer** im Stil des `OSim2004`-Originals (Knoten färben sich, Animation),
2. einem **Live-KPI-Dashboard** (Recharts) parallel zur Graph-Ansicht,
3. einem **WebSocket-Kanal** vom Worker zum Browser, der EventBus-Events nahezu in Echtzeit durchreicht.

**Architektur-Kern:** Eine eigene **TypeScript-`GraphObject`-Schicht** über React Flow, die die bewährten Konzepte aus `OSim2004/inc/GraphObj.h` (GObject/GObjLink/GLink/Region-Check/Phantom-Drawing/Animation-Hooks/4-Layer-Drawing/hierarchische Sub-Container) in das React-Modell überträgt.

> **Querschnitts-Foundation, NICHT Phase-3-Detail.** Wie im OSim2004-Original viele Viewer (`PDurchlaufplanViewer`, `PRessBelegMatrixViewer`, `AEinsatzWunschViewer`, `PSimulatorViewerGfx`, …) auf `GObject`/`OGraphView` basieren, sollen in osim-ui ebenfalls viele graphische Viewer auf der `GraphObject`-Schicht aufbauen. Phase 3 baut die Foundation und liefert als ersten Konsumenten den Durchlaufplan-Live-Viewer; spätere Phasen erben (Reports/Phase 5, Ressourcen-/Matrix-/Gantt-Viewer Phase 7+).

---

## 2. Warum eigene GraphObject-Schicht (nicht nur React Flow)?

`GraphObj.h` (2914 Zeilen, J.W. Fischer, OSim2004) enthält ein durchdachtes Objekt-Modell:

| Konzept aus GraphObj.h | Was es liefert | React-Flow allein? |
|---|---|---|
| `GObject` als Basisklasse | einheitliche Lifecycle-/Draw-/Hit-Test-API für ALLE Diagramm-Elemente | ⚠️ Nur Node/Edge-Unterscheidung, kein Polymorphismus |
| `GObjLink` mit `m_InList`/`m_OutList` | Knoten kennt seine ein- und ausgehenden Kanten direkt | ❌ React Flow speichert Kanten separat, Lookup über Edge-Array |
| `GLDirection` (16 Richtungs-Enum) | präzises Routing von Linkpfeilen relativ zum Knotenrand | ⚠️ React Flow hat Handles, aber weniger ausdifferenziert |
| `GLinkPoint` mit bis zu 6 Wegpunkten + `CheckNeighbourhood` | automatisch elegante Polylines | ❌ React Flow nutzt Bezier/Step/Smoothstep, kein Multi-Waypoint-Editor |
| `GORegion` (R_MOVE, R_EDIT, R_LINK_EDIT, R_LEFT, R_RIGHT) | unterschiedliche Aktionen je nach Knotenregion auf Klick | ⚠️ Nur via Custom-Node-Handler nachbaubar |
| `ShowPhantom`/`HidePhantom` | invertierter Drag-Preview während Move/Resize | ⚠️ React Flow hat Drag-Indikator, weniger flexibel |
| `DrawBackground` / `Draw` / `DrawForeground` / `DrawHelpers` | 4 Zeichen-Layer für Hintergrund-Overlay, Vordergrund, Hilfslinien | ❌ React Flow rendert flach, Layering nur über z-index-Tricks |
| `GObjSub` (= GObjLink + OGraphView) | hierarchische **Durchlaufpläne in Durchlaufplänen** | ✅ React-Flow-Sub-Flow-Plugin existiert |
| `OGraphView` 4 Layer-Listen (BG/Grid/Links/FG) | strukturiertes Z-Ordering | ⚠️ Manuell zu organisieren |
| `OGraphGrid` mit Row/Col-Operations | Tabellenartige Anordnung mit Insert/Remove/Resize per Row/Col | ❌ React Flow ist free-positioning; Grid-Snap und Row/Col-Logik selbst zu bauen |
| `GObjType`-Enum (18 OSim-Typen) | typisierte Knoten mit eigenen Symbolen | ✅ Custom Node Types in React Flow |
| `m_bAnimate` + `DrawRed(HowMuchRed)` | Live-Color-Animation während Sim | ✅ einfach state-driven |
| `CopyToClipboard`/`RestoreFromClipboard` + `RestoreInLink` | Copy/Paste-Untermodelle inkl. Re-Wiring von Cross-Referenzen | ⚠️ Eigene Logik nötig |

**Schlussfolgerung:** React Flow als Renderer (Performance, Drag/Drop, Selection) **plus eine `GraphObject`-Abstraktions-Schicht in TypeScript**, die die fehlenden Konzepte (Polymorphismus, In/Out-Listen, Region-Check, Multi-Waypoint-Links, 4-Layer-Drawing, Grid-Operations, hierarchische Sub-Container) hinzufügt.

---

## 3. Akzeptanzkriterien

1. ✅ Ein Sim-Lauf zeigt im Browser einen **graphischen Durchlaufplan** mit ein-/ausgehenden Kanten korrekt verdrahtet.
2. ✅ Knoten **färben sich live während des Sim-Laufs** je nach Status (frei/belegt/wartend/abgeschlossen). Latenz <500 ms zwischen Engine-Event und visueller Reaktion.
3. ✅ Multi-Waypoint-Links können vom User per Maus editiert werden (Wegpunkte verschieben).
4. ✅ Region-Check funktioniert: Klick auf Knoten-Mitte = Edit-Properties, Klick auf Knoten-Rand = Link-ziehen.
5. ✅ Hierarchische Durchlaufpläne: Doppelklick auf einen `GObjSub`-Knoten öffnet dessen Sub-Plan in eigenem Reiter/Panel.
6. ✅ Grid-Layout-Modus: User kann Spalten/Zeilen einfügen und entfernen.
7. ✅ Copy/Paste eines Knoten-Subgraphen funktioniert inkl. Link-Restore.
8. ✅ Live-KPI-Charts (Recharts) zeigen mindestens: aktuelle Sim-Zeit, abgeschlossene Aufträge, Maschinen-Auslastung. Update <1 s.
9. ✅ WebSocket-Reconnect bei Verbindungsabbruch automatisch ≤3 s.
10. ✅ Stress-Test: mittelgroßes Modell (`Fertigungsstruktur1_mit_AslFj.otx`, ~50 Knoten) läuft mit ~30 FPS Animation.

---

## 4. GraphObject-TypeScript-Skizze

Verzeichnis-Layout im Frontend — `portal/src/graph/core/` ist Foundation für ALLE graphischen Viewer; `portal/src/graph/osim/` hostet domänenspezifische Subklassen.

```
portal/src/graph/
├── core/
│   ├── GObject.ts           # Basisklasse mit Draw/HitTest/Region/State
│   ├── GObjLink.ts          # GObject + In/Out-Link-Listen
│   ├── GLink.ts             # Basis-Link (zwei Endpunkte, eine Direction)
│   ├── GLinkPoint.ts        # Multi-Waypoint-Link mit AutoRouting
│   ├── GObjSub.ts           # GObjLink + OGraphView (hierarchisch)
│   ├── GraphView.ts         # 4-Layer-Container (BG/Grid/Links/FG)
│   ├── GraphCollection.ts   # Abstrakte Collection
│   ├── GraphList.ts         # Free-Position-Collection
│   ├── GraphGrid.ts         # Row/Col-Collection mit Insert/Remove
│   └── types.ts             # Enums: GLDirection, GORegion, GObjType, GObjState
│
├── osim/
│   ├── nodes/                        # Durchlaufplan-Knoten (Phase 3 Welle 2)
│   │   ├── PDpKnKonstant.tsx       # GObjOSimDlp-Subklasse: Konstante Zeit
│   │   ├── PDpKnVerteilung.tsx     # Stochastische Zeit
│   │   ├── PDpKnAlternativ.tsx     # Alternative Logik
│   │   ├── PDpKnRuecksprung.tsx    # Loopback
│   │   └── ...                     # weitere 14 GObjType-Klassen
│   ├── edges/                        # Durchlaufplan-Kanten (Phase 3 Welle 2)
│   │   ├── PDlplKante.tsx          # Standard-Kante
│   │   ├── PDpKaUebergang.tsx      # Übergang
│   │   └── PDpKaExtern.tsx         # Externer Übergang
│   ├── viewers/                      # Phase 5+ und Phase 7+ bauen hier weiter
│   │   ├── (PDurchlaufplanViewer.tsx — eigentlich Phase 3, einfacher Konsument)
│   │   ├── (PRessBelegMatrixViewer.tsx — Phase 7+)
│   │   ├── (AEinsatzWunschViewer.tsx — Phase 7+)
│   │   ├── (PSimulatorViewerGfx.tsx — Phase 3, das Live-Dashboard-Element)
│   │   └── (PAuslastungsChartViewer.tsx — Phase 5 Reports)
│   └── animation/
│       └── status-color.ts         # Mapping Sim-Event → DrawRed(0..1)
│
├── react-flow-adapter/
│   ├── GraphObjectNode.tsx         # generische React-Flow-Custom-Node, delegiert an GObject.draw()
│   ├── GraphObjectEdge.tsx         # generische Custom-Edge mit Waypoints
│   ├── useGraphView.ts             # Hook: GraphView ↔ React-Flow-State sync
│   ├── useRegionHitTest.ts         # Hook: mousedown → CheckRegion → Action-Dispatch
│   └── usePhantomDrag.ts           # Drag-Preview-Hook
│
├── persistence/
│   ├── clipboard.ts                # CopyToClipboard / RestoreFromClipboard
│   └── serializer.ts               # GraphView ↔ JSON (für Engine-Übergabe)
│
└── live/
    ├── ws-client.ts                # WebSocket-Verbindung mit Reconnect
    ├── event-router.ts             # Engine-Topic → GObject.onSimEvent()
    └── kpi-aggregator.ts           # JSONL-Stream → Recharts-Datapoints
```

### Kern-Interfaces (TypeScript-Skizze)

```typescript
// types.ts
export enum GLDirection {
  DEFAULT, NORTH, SOUTH, EAST, WEST, MIDDLE,
  NORTH_EAST, NORTH_WEST, SOUTH_EAST, SOUTH_WEST,
  NORTH_NORTH_EAST, NORTH_EAST_EAST, NORTH_NORTH_WEST, NORTH_WEST_WEST,
  SOUTH_SOUTH_EAST, SOUTH_EAST_EAST, SOUTH_SOUTH_WEST, SOUTH_WEST_WEST,
}

export enum GORegion {
  R_NO, R_MOVE, R_EDIT, R_LINK_EDIT, R_LEFT, R_RIGHT,
}

export enum GObjState { HIDDEN, MARKED, NO_STATE, FOCUSED }

export enum GObjType {
  PDLPLKNOTEN, PDPKNZEITVORGABE, PDPKNVERTEILUNG, PDPKNKONSTANT,
  PDPKNMENGE, PDPKNMENGERUESTEN, PDPKNRUECKSPRUNG, PDPKNRUECKKONSTANT,
  PDPKNRUECKVERTEILUNG, PDPKNALTERNATIV, PDPKNALTERNATIVTYPID,
  PDPKNALTERNATIVEVERTEILUNG, PDPKNALTERNATIVLOGIK,
  PDLPLKANTE, PDPKAEXTERN, PDPKAUEBERGANG, PDPKAENTITAET, PDPKAENTITAETABLAGE,
  NO_TYPE,
}

export type DrawLayer = 'background' | 'main' | 'foreground' | 'helpers';

// core/GObject.ts
export abstract class GObject {
  id: string;
  text = '';
  state: GObjState = GObjState.NO_STATE;
  styles = 0;                  // bitfield: GS_LEFT_ALLIGN, GS_MIDDLE_ALLIGN, ...
  virtRect = { x: 0, y: 0, w: 200, h: 80 };
  backColor = '#ffffff';
  textColor = '#000000';

  // Animation-Hook (entspricht m_bAnimate + DrawRed)
  animate = false;
  howMuchRed = 0;              // 0..1

  protected parentCollection?: GraphCollection;

  // 4-Layer-Draw — überschreibbar je Subklasse
  abstract draw(ctx: GraphRenderContext, layer: DrawLayer): void;

  // Hit-Test
  abstract isHit(virtP: Point): boolean;

  // Region-Check (siehe GORegion)
  checkRegion(virtP: Point): GORegion {
    if (!this.isHit(virtP)) return GORegion.R_NO;
    // Default: Center=R_EDIT, Rand=R_LINK_EDIT
    const margin = 10;
    const r = this.virtRect;
    const inMargin =
      virtP.x < r.x + margin || virtP.x > r.x + r.w - margin ||
      virtP.y < r.y + margin || virtP.y > r.y + r.h - margin;
    return inMargin ? GORegion.R_LINK_EDIT : GORegion.R_EDIT;
  }

  // Phantom für Drag-Preview
  showPhantom(ctx: GraphRenderContext, virtP: Point): void { /* invertiert zeichnen */ }
  hidePhantom(ctx: GraphRenderContext): void { /* restore */ }

  // Notifications (entsprechen On*-Methoden in C++)
  onEditGo(virtP: Point): boolean { return false; }
  onCommand(cmd: string, payload?: unknown): boolean { return false; }
  onRectUpdate(newRect: Rect): boolean { this.virtRect = newRect; return true; }

  // Sim-Live-Event-Hook (neu, war im Original via Polling)
  onSimEvent(topic: string, data: Record<string, unknown>): void {}
}

// core/GObjLink.ts
export abstract class GObjLink extends GObject {
  inLinks: GLink[] = [];
  outLinks: GLink[] = [];

  addInLink(link: GLink): boolean { /* mit Dup-Check */ }
  addOutLink(link: GLink): boolean { /* mit Dup-Check */ }
  removeInLink(link: GLink): boolean { /* notify link */ }
  removeOutLink(link: GLink): boolean { /* notify link */ }

  // Startposition für ausgehende Kante in Richtung d
  getLinkStartPos(d: GLDirection, link?: GLink): Point {
    // Default: Mittelpunkt der Seite je nach Direction
  }

  // Notification: an dieser Mausposition wurde ein Link angedockt
  onInLinkAtMousePointerAdded(virtP: Point, link: GLink): boolean { return false; }
  onOutLinkAtMousePointerAdded(virtP: Point, link: GLink): boolean { return false; }
}

// core/GLink.ts
export class GLink extends GObject {
  prev?: GObjLink;             // m_Prev
  next?: GObjLink;             // m_Next
  stdGLDirPrev: GLDirection = GLDirection.DEFAULT;
  stdGLDirNext: GLDirection = GLDirection.DEFAULT;
  linkColor = '#000000';

  // Notifications
  onNodePrevAdded(node: GObjLink): boolean { return false; }
  onNodeNextAdded(node: GObjLink): boolean { return false; }
  onNodeMoved(node: GObjLink): boolean { return false; }
}

// core/GLinkPoint.ts
export class GLinkPoint extends GLink {
  static MAX_POINTS = 6;
  pointList: Point[] = [];     // bis zu MAX_POINTS Wegpunkte
  usedPointNum = 0;
  setState: 'auto' | 'help' | 'alone' | 'parent_moved' = 'auto';

  // Auto-Routing: berechnet usedPointNum aus Nachbar-Knotenstellung
  checkNeighbourhood(prevDir: GLDirection, nextDir: GLDirection): { count: number; isPrev: boolean } {
    /* portiert aus C++-Algorithmus */
  }

  changeWorkPoint(p: Point): void { /* Wegpunkt verschieben */ }
}

// core/GraphView.ts
export class GraphView {
  // 4 Layer entsprechen ID_BG_LIST, ID_STD_GRID, ID_LINK_LIST, ID_FG_LIST
  bgList: GraphList;
  stdGrid: GraphGrid;
  linkList: GraphList;
  fgList: GraphList;

  // Lebenszyklus
  invalidateView(): void { /* schedule re-render */ }
  isParentFrom(obj: GObject | GraphCollection, recursive = true): boolean { /* … */ }

  // Hit-Test geht alle 4 Layer durch (FG zuerst)
  isHit(virtP: Point): GObject[] { /* … */ }

  // Notifications
  onLMButtonDown(virtP: Point): void {}
  onDropped(virtP: Point, text: string): void {}
  onUserMessage(msg: string, data: unknown): void {}
}

// core/GraphGrid.ts
export class GraphGrid extends GraphCollection {
  cols: GridCol[] = [];
  rows: GridRow[] = [];

  // Grid-Operationen entsprechen C++-Methoden
  goIns(obj: GObject, x: number, y: number, repaint = true): boolean { /* … */ }
  goRemove(x: number, y: number, repaint = true): GObject | undefined { /* … */ }
  insertColBefore(x: number): void { /* … */ }
  insertRowBefore(y: number): void { /* … */ }
  removeCol(x: number): void { /* … */ }
  removeRow(y: number): void { /* … */ }
  getNextFreeGridPlace(): Point { /* … */ }
  isGridPlaceTaken(p: Point): boolean { /* … */ }
  copyCell(src: Point, dest: Point): boolean { /* … */ }
}

// osim/nodes/PDpKnKonstant.tsx (Beispiel-Subklasse)
export class PDpKnKonstant extends GObjOSimDlp {
  type = GObjType.PDPKNKONSTANT;
  durchfuehrungsZeit = 0;       // Sekunden

  draw(ctx: GraphRenderContext, layer: DrawLayer): void {
    if (layer === 'main') {
      // Rechteck mit Konstant-Symbol oben rechts
      ctx.drawRect(this.virtRect, this.backColor);
      ctx.drawText(this.text, this.virtRect, this.textColor);
      this.drawSymbol(ctx);
    }
    if (layer === 'foreground' && this.howMuchRed > 0) {
      // Animation-Overlay (Live während Sim)
      ctx.drawRedOverlay(this.virtRect, this.howMuchRed);
    }
  }

  drawSymbol(ctx: GraphRenderContext): void { /* Konstant-Klemme */ }

  onSimEvent(topic: string, data: Record<string, unknown>): void {
    if (topic === 'proz.bearbeit.start') {
      this.howMuchRed = 1;
      this.parentCollection?.getView()?.invalidateView();
    } else if (topic === 'proz.bearbeit.ende') {
      this.howMuchRed = 0;
      this.parentCollection?.getView()?.invalidateView();
    }
  }
}
```

### React-Flow-Adapter

```typescript
// react-flow-adapter/GraphObjectNode.tsx
import { NodeProps } from '@xyflow/react';
import { useRegionHitTest } from './useRegionHitTest';
import type { GObjLink } from '@/graph/core/GObjLink';

export function GraphObjectNode({ data }: NodeProps<{ gobj: GObjLink }>) {
  const { gobj } = data;
  const onMouseDown = useRegionHitTest(gobj);

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        width: gobj.virtRect.w,
        height: gobj.virtRect.h,
        background: gobj.backColor,
        color: gobj.textColor,
        position: 'relative',
      }}
      data-gobj-type={gobj.constructor.name}
      data-gobj-state={gobj.state}
    >
      <CanvasLayer gobj={gobj} layer="background" />
      <CanvasLayer gobj={gobj} layer="main" />
      <CanvasLayer gobj={gobj} layer="foreground" />
      {gobj.animate && gobj.howMuchRed > 0 && (
        <RedOverlay opacity={gobj.howMuchRed} />
      )}
    </div>
  );
}
```

---

## 5. Task-Wellen

### Welle 1 — GraphObject-Core (5 Tage)
| ID | Task | Deps |
|---|---|---|
| 1.1 | `core/types.ts` mit allen Enums (GLDirection, GORegion, GObjType, GObjState) | — |
| 1.2 | `core/GObject.ts` mit Draw/HitTest/Region/Phantom-API | 1.1 |
| 1.3 | `core/GObjLink.ts` mit In/Out-Link-Listen | 1.2 |
| 1.4 | `core/GLink.ts` + `core/GLinkPoint.ts` mit CheckNeighbourhood-Algorithmus (Port aus C++) | 1.3 |
| 1.5 | `core/GraphView.ts` + 4-Layer-Container | 1.2 |
| 1.6 | `core/GraphList.ts` + `core/GraphGrid.ts` mit Insert/Remove/Resize | 1.5 |
| 1.7 | `core/GObjSub.ts` (hierarchisch) | 1.3, 1.5 |
| 1.8 | Unit-Tests für alle Core-Klassen (vitest) | 1.7 |

### Welle 2 — OSim-Subklassen (4 Tage)
| ID | Task | Deps |
|---|---|---|
| 2.1 | `osim/nodes/PDpKnKonstant.tsx` als Referenz-Implementierung | 1.7 |
| 2.2 | Weitere 13 Knoten-Subklassen (Verteilung, Alternativ, Rücksprung, …) | 2.1 |
| 2.3 | 5 Kanten-Subklassen (Kante, Übergang, Extern, Entität, EntitätAblage) | 1.4 |
| 2.4 | `osim/animation/status-color.ts`: Mapping Engine-Topic → Color/Opacity | 2.1 |
| 2.5 | Storybook (oder shadcn-Demo-Page) zeigt alle Knoten-Typen | 2.2 |

### Welle 3 — React-Flow-Adapter (4 Tage)
| ID | Task | Deps |
|---|---|---|
| 3.1 | `react-flow-adapter/GraphObjectNode.tsx` (Custom-Node delegiert an GObject) | 1.2 |
| 3.2 | `react-flow-adapter/GraphObjectEdge.tsx` (Custom-Edge mit Waypoints) | 1.4 |
| 3.3 | `react-flow-adapter/useGraphView.ts` Hook | 1.5 |
| 3.4 | `react-flow-adapter/useRegionHitTest.ts` Hook | 1.2 |
| 3.5 | `react-flow-adapter/usePhantomDrag.ts` Hook | 1.2 |
| 3.6 | Hierarchische Sub-Flows aktivieren (Doppelklick öffnet Sub-Plan) | 1.7 |
| 3.7 | Grid-Snap-Modus (optional via Toolbar-Toggle) | 1.6 |

### Welle 4 — Persistenz (2 Tage)
| ID | Task | Deps |
|---|---|---|
| 4.1 | `persistence/serializer.ts`: GraphView ↔ JSON (Schema gemeinsam mit Phase 2) | Phase 2 |
| 4.2 | `persistence/clipboard.ts`: Copy/Paste mit Link-Restore | 1.3 |

### Welle 5 — Live-Kanal (3 Tage)
| ID | Task | Deps |
|---|---|---|
| 5.1 | Backend: WebSocket-Endpoint `/ws/runs/{run_id}` mit Auth-Token-Check (Firebase-JWT im Query-Param) | Phase 1 |
| 5.2 | Backend: Sink, der EventBus-Events vom Worker an WS-Clients multiplexed (in-Process-Queue) | Phase 1 |
| 5.3 | Frontend: `live/ws-client.ts` mit Auto-Reconnect (Backoff) | 5.1 |
| 5.4 | Frontend: `live/event-router.ts` → ruft `GObject.onSimEvent()` für betroffene Knoten | 5.3, 2.4 |
| 5.5 | Frontend: `live/kpi-aggregator.ts` → Recharts-Datasets | 5.3 |

### Welle 6 — Live-Dashboard (3 Tage)
| ID | Task | Deps |
|---|---|---|
| 6.1 | Page `/runs/{id}/live` mit Split-Layout: Graph links, KPI-Charts rechts | 5.5 |
| 6.2 | KPI-Charts: Sim-Zeit, abgeschlossene Pläne, Maschinen-Auslastung | 5.5 |
| 6.3 | Steuerungs-Panel (Start/Stop bzw. Cancel, falls Engine es unterstützt) | 5.1 |
| 6.4 | Status-Banner (queued/running/succeeded/failed) | 5.3 |

### Welle 7 — Verifikation (2 Tage)
| ID | Task | Deps |
|---|---|---|
| 7.1 | Playwright-E2E: ein vollständiger Live-Run mit `Fertigungsstruktur1` | alle |
| 7.2 | Performance-Test: 30 FPS bei 50 Knoten | alle |
| 7.3 | Stress-Test: WebSocket-Reconnect simulieren | 5.3 |
| 7.4 | Doku in `docs/PHASE-3-GRAPH-OBJECT.md` (Architektur + API) | alle |

---

## 6. Risiken & Unknowns

| Risiko | Mitigation |
|---|---|
| GraphObject-Abstraktion-Schicht wird zur Bremse für React-Flow-Performance | Profilen früh; im Zweifel kritische Hot-Paths direkt in React-Flow lassen |
| `CheckNeighbourhood`-Algorithmus aus C++ ist nicht-trivial zu portieren | Erstmal vereinfachte Variante (3 Punkte), volle 6-Punkt-Logik später nachziehen |
| WebSocket-Multiplexing in API-Process skaliert nicht über Replicas | Phase 3 nur in-Process; Cloud-fähig wird es in Phase 4 (Pub/Sub) |
| Engine liefert nicht alle benötigten Topics für die Animation | Topics gemeinsam mit Engine-Team auflisten und priorisieren; Recorder ggf. erweitern |
| React-Flow-Lizenz (xyflow) Pro-Features nicht nötig | nur MIT-Features nutzen; Sub-Flows sind in Community-Edition vorhanden |
| Grid-Layout konfligiert mit React-Flow free-positioning | Grid als optionaler Modus, kein Default; Snap-Helper statt strikten Constraint |
| Hierarchische Sub-Flows blow up bei tiefer Verschachtelung | Sub-Flow-Modal/Tab statt nested rendering ab Tiefe 2 |

---

## 7. Was Phase 3 NICHT liefert

- Modell-Editor mit Drag-and-Drop neuer Knoten aus einer Palette (→ Phase 7, optional)
- DAG-Pläne mit zyklischen Strukturen (Engine V2)
- Cloud-skalierende Live-Übertragung (→ Phase 4 mit Pub/Sub)
- Wiedergabe alter Läufe (Replay-Modus) — nur Live; Replay optional Phase 5
- Animations-Geschwindigkeit-Slider wie im Original ("Event Block Size") — Phase 3 zeigt einfach 1:1 was kommt

---

## 8. Definition-of-Done

1. Alle 10 Akzeptanzkriterien grün
2. Playwright-E2E grün
3. Performance-Budget eingehalten (30 FPS @ 50 Knoten, <500 ms Event-Latency)
4. GraphObject-Klassen-Tests > 70 % Coverage
5. `docs/PHASE-3-GRAPH-OBJECT.md` erklärt API + zeigt Beispiel-Subklasse
6. Demo-Video: Live-Lauf eines `Fertigungsstruktur1`-Modells
7. **Foundation-Bereitschaft:** API-Stabilität so, dass Phase 5 (Reports) und Phase 7+ (Matrix-/Gantt-Viewer) ohne Bruch konsumieren können. Mindestens 1 nicht-Durchlaufplan-Beispiel als Proof-of-Concept (z. B. ein einfacher Matrix-Viewer-Stub via GraphGrid).

---

## 9. Diskuss-Punkte für `/gsd-discuss-phase`

1. **Canvas oder DOM für Node-Rendering?** Canvas ist schneller bei vielen Knoten, DOM ist React-natürlicher und debugbar. Empfehlung: DOM bis 100 Knoten, Canvas-Fallback bei größeren Modellen.
2. **Sub-Flow-Tiefe:** Tab/Modal ab welcher Tiefe? Vorschlag: Inline bis Tiefe 1, Tab ab Tiefe 2.
3. **Wegpunkt-Editor-UX:** Drag mit Snap-to-Grid oder freies Verschieben?
4. **Was tun, wenn der Worker stirbt mid-run?** Live-View einfrieren mit Banner oder Auto-Reconnect-Versuch?
5. **Animation-Steuerung im UI:** Slider für Geschwindigkeit (wie OSim2004) oder hardgecodet 1:1?
6. **Engine-Coordination:** welche zusätzlichen Topics braucht die Engine? Liste mit Engine-Team durchgehen.
