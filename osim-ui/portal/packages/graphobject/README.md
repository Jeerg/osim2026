# @osim/graphobject

**Renderer-agnostische GraphObject-Foundation** — der portable Client-Container,
der 1:1 zum OSim2004 C++-Original (`OSim2004/inc/GraphObj.h`) portiert ist und
über osim-ui hinaus in allen GraphObject-Projekten nutzbar sein soll.

## Strategischer Hintergrund

Aus dem Architektur-Audit 2026-05-28 (siehe
`.planning/HANDOFF-2026-05-28.md` im osim-ui-Repo):

> GraphObject soll ein Client-Container werden, den ich in ALLEN meinen
> Projekten weiterentwickeln will.

Dieses Paket isoliert den Foundation-Kern. Renderer-Adapter (React Flow,
Canvas, SVG) sind separate Pakete (`@osim/graphobject-react-flow`,
`@osim/graphobject-canvas`).

## Stand 2026-05-28b

- ✅ Workspace-Setup + Package-Vertrag (Public-API über `src/index.ts`)
- ✅ Path-Alias `@osim/graphobject` in `tsconfig.app.json` + `vite.config.ts`
- ⏳ **Physischer Move der Foundation-Dateien folgt in einer Folge-Welle.**
  Bis dahin re-exportiert dieses Paket aus `portal/src/graph/foundation/`.

Die Migration-Roadmap:

1. **Schritt 1 (diese Welle, Track C):** Workspace + Public-API + Validierung
   über `@osim/graphobject-canvas`-Prototyp. Konsumenten in osim-ui dürfen
   bereits jetzt `import { ... } from "@osim/graphobject"` schreiben.
2. **Schritt 2 (Folge-Welle):** physischer `mv` von `portal/src/graph/foundation/*`
   nach `portal/packages/graphobject/src/*`. Update der bestehenden
   208 `@/graph/foundation`-Imports auf `@osim/graphobject` (mechanische
   Operation, keine Semantik-Änderung).

## Inhalt der Public-API

### Basis-Typen
- `CPoint`, `CSize`, `CRect`, `cpoint`, `csize`, `crect`, `crectEmpty`
- `GObjState`, `GORegion`, `GLDirection`, `GOStateSub`

### 4-Layer-Drawing-API
- `DrawContext`, `DrawLayer` (`BACKGROUND`/`CONTENT`/`FOREGROUND`/`TEXT`/`HELPERS`/`OVERLAY`)
- `DrawStyle`, `DrawTextStyle`, `PolygonPoints`
- `NullDrawContext`, `RecordingDrawContext`

### Domain-Klassen
- `GObject`, `GObjLink`, `GObjSub`
- `GObjElements`, `GElement`, `GElementLinkinList`, `GObjElementKlickAction`
- `GObjCEdit`, `STD_ROUND_CORNER`
- `GObjOSimDlp`, `GObjSquare`, `GObjRect`, `GObjType`, `GSqrType`, `STD_PEAK_WIDTH`
- `GLink`, `GLinkPoint`, `GLinkSquare`

### Container
- `OGraphCollection`, `OGraphList`, `OGraphView`, `OGraphGrid`
- `OGGridAlt`, `OGGRIDALT_DEFAULT_TEXT_SPACE`

### Phantom-Preview
- `PhantomController`, `phantomController`, `ActivePhantom`

### Matrix-Foundation
- `MatrixGrid`, `MatrixCell`, `useBlockSelection`, `useInlineCellEdit`,
  `matrix-clipboard`

### Wire-Bridge
- `wireToGrid`, `WireToGridResult`

## Was NICHT in diesem Paket ist

- React-Flow-spezifischer Code (`GraphFlowCanvas`, `OsimNode`,
  `view-adapter`, `interactions`, `GridBackground`) → `@osim/graphobject-react-flow`
- Konkrete Renderer-Implementations → `@osim/graphobject-canvas`,
  zukünftig auch `@osim/graphobject-svg` etc.
