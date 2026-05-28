# Migration-Plan — Foundation-Kern in `@osim/graphobject`

**Stand 2026-05-28b.** Dieser Plan ist die explizite Vorbereitung der
mechanischen Folge-Welle, die die 21 Pur-Foundation-Dateien aus
`portal/src/graph/foundation/` nach `portal/packages/graphobject/src/`
verschiebt und die 208 bestehenden `@/graph/foundation`-Imports auf
`@osim/graphobject` umstellt.

## Warum nicht in dieser Session?

Track C1 hat den **Package-Vertrag** etabliert (Workspace-Setup, Public-API,
Path-Alias, Vertrags-Tests). Track C2 wäre der **physische Move**.

Die Session 2026-05-28b hatte vier Tracks (D, A, B, C) zu erledigen.
Track B brachte 6 neue Foundation-Klassen-Portierungen (B0-B5), die alle
ihre Tests + Verifikation gebraucht haben. Eine 208-Import-Umstellung
inmitten der Session erhöht das Bruch-Risiko ohne strategischen Mehrwert
— der Vertrag steht bereits über den `@osim/graphobject`-Alias.

## Pur-Dateien für den Move

21 Pur-Dateien (renderer-agnostisch). Vollständige Liste:

```
portal/src/graph/foundation/constants.ts
portal/src/graph/foundation/types.ts
portal/src/graph/foundation/LNULL.ts
portal/src/graph/foundation/DrawContext.ts                   (B4)
portal/src/graph/foundation/GObject.ts
portal/src/graph/foundation/GObjLink.ts
portal/src/graph/foundation/GObjSub.ts
portal/src/graph/foundation/GObjElements.ts                  (B0)
portal/src/graph/foundation/GObjCEdit.ts                     (B1)
portal/src/graph/foundation/GObjShapes.ts                    (B3)
portal/src/graph/foundation/GLink.ts
portal/src/graph/foundation/GLinkPoint.ts
portal/src/graph/foundation/GLinkSquare.ts
portal/src/graph/foundation/OGraphCollection.ts
portal/src/graph/foundation/OGraphList.ts
portal/src/graph/foundation/OGraphView.ts
portal/src/graph/foundation/OGraphGrid.ts
portal/src/graph/foundation/OGGridAlt.ts                     (B2)
portal/src/graph/foundation/OGPosition.ts
portal/src/graph/foundation/OGPositionGrid.ts
portal/src/graph/foundation/GOGridCol.ts
portal/src/graph/foundation/GOGridRow.ts
portal/src/graph/foundation/PhantomController.ts             (B5)
portal/src/graph/foundation/matrix/ (Unterverzeichnis)
portal/src/graph/foundation/wire-to-grid.ts
```

Plus die Tests unter `portal/src/graph/foundation/__tests__/`.

## RF-Adapter-Dateien (bleiben in src/graph/, wandern später in
`@osim/graphobject-react-flow` — Track C3)

```
portal/src/graph/foundation/GraphFlowCanvas.tsx
portal/src/graph/foundation/GridBackground.tsx
portal/src/graph/foundation/OsimNode.tsx
portal/src/graph/foundation/view-adapter.ts
portal/src/graph/foundation/interactions.ts
```

## Schematischer Ablauf der Folge-Welle (für einen Folge-Executor)

### Phase 1 — Dateien verschieben (atomic per File-Family)

```bash
# Pur-Kern (24 Dateien inkl. Matrix-Subfolder + Tests)
git mv portal/src/graph/foundation/constants.ts portal/packages/graphobject/src/
git mv portal/src/graph/foundation/types.ts portal/packages/graphobject/src/
# ... usw. für alle 21 + matrix/ + __tests__/
```

### Phase 2 — Interne Imports in den verschobenen Files

Innerhalb von `packages/graphobject/src/` müssen die `@/graph/foundation/X`-
Imports auf entweder relative Pfade `./X` ODER `@osim/graphobject/X`
umgestellt werden. Empfehlung: **relative Pfade** (`./X`) — sie sind klar
intra-paket und brechen nicht bei einer späteren Paket-Umbenennung.

```bash
# Alle internen Imports gleichzeitig (sed mit Vorsicht!)
find portal/packages/graphobject/src -name "*.ts" -o -name "*.tsx" | \
  xargs sed -i 's|"@/graph/foundation/|"./|g'
```

Anschließend `npx tsc --noEmit` → bei Fehlern manuell nachbessern
(z.B. wenn eine Datei auf einen Pfad zeigt, der jetzt in einem Sub-
Verzeichnis liegt — `./matrix/` o.ä.).

### Phase 3 — Externe Imports (208 Vorkommen außerhalb des Pakets)

Sucher-Ersetzer:

```bash
find portal/src -name "*.ts" -o -name "*.tsx" | \
  xargs sed -i 's|"@/graph/foundation"|"@osim/graphobject"|g'
find portal/src -name "*.ts" -o -name "*.tsx" | \
  xargs sed -i 's|"@/graph/foundation/|"@osim/graphobject/|g'
```

Achtung: die zweite Regel ersetzt auch RF-Adapter-Imports
(`GraphFlowCanvas`, `OsimNode`, etc.). Die müssen vor C3 entweder
zurückgemappt oder mit den RF-Adaptern zusammen migriert werden.

### Phase 4 — Verifikation

```bash
cd portal && npx tsc --noEmit && npx vitest run
```

Alle Tests (heute: 353 passed / 2 skipped) müssen grün bleiben.

### Phase 5 — Aufräumen

- `portal/src/graph/foundation/index.ts` löschen (wird durch
  `@osim/graphobject` ersetzt).
- `portal/packages/graphobject/src/index.ts` von Re-Export auf direkte
  Exports umstellen (alle `@/graph/foundation/X` → `./X`).

## Risiko-Bewertung

- **Niedrig:** TS-Type-Checking fängt alle import-Pfad-Brüche.
- **Niedrig:** Mechanische sed-Operation; idempotent wenn man sauber
  zwischen den Phasen separiert.
- **Mittel:** Vitest- + Vite-Aliase müssen alle drei Variante kennen
  (`@osim/graphobject`, `@osim/graphobject/X`, default-Exports). Stand
  2026-05-28b ist das eingerichtet.
- **Hoch:** wenn jemand parallel an Foundation-Dateien arbeitet und
  Merge-Konflikte. Daher die Folge-Welle als 1-Commit-Operation in einem
  separaten Branch.

## Was passiert mit den B-Wellen-Files?

Die in 2026-05-28b neu geschriebenen Files (B0 GObjElements, B1 GObjCEdit,
B2 OGGridAlt, B3 GObjShapes, B4 DrawContext, B5 PhantomController) leben
schon im `foundation/`-Verzeichnis. Sie wandern im selben Folge-Schritt
mit.
