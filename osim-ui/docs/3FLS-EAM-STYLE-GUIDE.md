# 3FLS-EAM Brand & UI Style Guide

**Stand:** 2026-05-24 · **rev. 2026-05-26** (Blau-Re-Key statt Cyan · Segoe UI statt Geist · Logo-Regel) · **Source:** 3FLS-EAM Phase 43 (ex-38) UI Redesign Discuss-Phase, 24 LOCKED Decisions.

Verbindlicher Style-Guide für jedes Frontend, das im 3FLS-EAM-Brand-Klima auftritt. In andere Repos kopieren als `docs/3FLS-EAM-STYLE-GUIDE.md` oder Dateinamen Ihrer Wahl. Im konsumierenden Repo per Block in `CLAUDE.md` verlinken (Snippet am Ende).

---

## 1. Brand-Identität

### 1.1 Primary-Farbe — Blau (verbindlich · rev. 2026-05-26)

Re-keyed von Cyan `#0EA5C7` auf die Blau-Familie aus `Farbverlauf neu.png` (User-Lock 2026-05-26). Magenta bleibt strikt logo-bound (§1.2). Die Token-Namen mit `-cyan`-Suffix sind historisch beibehalten (brand-neutraler Alias) — nur die Werte wurden getauscht.

| Token | Hex | Verwendung |
|---|---|---|
| `--color-primary` | `#1E4F9C` | Brand-Primary, Active-States, Item-Icons, Focus-Rings, Buttons |
| `--color-primary-hover` | `#18407F` | Button-Hover, Pressed |
| `--color-primary-light` | `#C7D7EF` | Active-Item-Background in Sidebar, Vertikale Cell-Borders |
| `--color-primary-mid` | `#4A6FAC` | Optional zwischen `-primary` und `-light` für Charts/Graphen |
| `--color-primary-dark` | `#15265F` | Navy — Disabled/Pressed, Topbar-Gradient-Start |
| `--color-surface-soft-cyan` | `#EEF3FB` | Hover-Item in Sidebar (Wert jetzt Soft-Blau) |
| `--color-surface-soft-cyan-2` | `#E2EAF6` | Sidebar-Background (Wert jetzt Soft-Blau, statt pures Weiß) |

### 1.2 Magenta — strikt Logo-Bound

- **Magenta `#C026D3` darf NUR im Logo-Swirl (PNG-Asset) leben.**
- KEIN Magenta in der UI: keine CTA, kein Active-Marker, keine Indicator-Dots, keine Notification-Badges, keine Hover-States.
- Konsequenz: Mono-chromatisches UI mit Blau als einziger Brand-Farbe. Logo bleibt einziger Eye-Catcher.

### 1.3 Logo

- Asset: `Logo.png` (3FLS-Swirl mit Cyan/Grün/Magenta/Lila + Wordmark "3-fls" + Tagline "3 - feedback loops"). **Unverändert verwenden** — nicht beschneiden, nicht einfärben, Wordmark nicht abtrennen (User-Lock 2026-05-26).
- Platzierung: Topbar rechts, **direkt auf dem Verlauf ohne weiße Platte/Backdrop**. Das rechte Topbar-Verlauf-Ende ist dafür ins helle Ice-Blau (`#B2C9E8`) aufgehellt, damit die dunkle Wordmark trägt.
- KEINE inline-SVG-Re-Render in MVP — PNG-Asset reicht.

---

## 2. Layout

### 2.1 Topbar (D-L01, D-LD01)

- **Höhe:** 80–100 px (CSS-Variable `--header-height`).
- **Background:** diagonaler Blau-Gradient (135°) `linear-gradient(135deg, #1F264C 0%, #1C366B 28%, #1E4F94 52%, #6E93C8 78%, #B2C9E8 100%)` — dunkles Navy oben-links → aufgehelltes Ice-Blau oben-rechts. Basis aus `Farbverlauf neu.png`, das rechte Ende ist bewusst aufgehellt für den Logo-Bereich (rev. 2026-05-26).
- **Text:** weiß (`--color-text-inverse`). Page-Title/Breadcrumb links auf dem dunklen Bereich (hoher Kontrast).
- **Logo:** rechts, direkt auf dem Verlauf — **kein Backdrop/Kästchen**. Das aufgehellte rechte Verlauf-Ende trägt die dunkle Wordmark (§1.3).
- **Sticky/Fixed** beim Scroll.

### 2.2 Sidebar (D-LD02)

- **Background:** `var(--color-surface-soft-cyan-2)` (#E2EAF6 — zarte Blau-Tönung statt pures Weiß).
- **Width:** 300 px expanded, 64 px collapsed.
- **Position:** links.
- **Active-Item:** `background: var(--color-primary-light)` + `border-left: 3px solid var(--color-primary)`.
- **Hover-Item:** `background: var(--color-surface-soft-cyan)`.
- **Item-Icon in Active-State:** `color: var(--color-primary)`.

### 2.3 Workspace

- **Background:** Weiß (`var(--color-surface)`).
- Hauptbereich rechts neben Sidebar, unter Topbar.

### 2.4 Bottom-Stripe (D-L02, D-LD03)

- **Höhe:** 3–4 px.
- **Background:** `linear-gradient(90deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)`.
- **Position:** sticky am Body-Bottom — Brand-Echo aus `LayoutFarbverläufe.png`.

---

## 3. Token-Architektur

### 3.1 Datei-Struktur

- `src/styles/tokens.css` (separate Datei) — alle Design-Tokens.
- `src/styles/globals.css` — importiert `./tokens.css` und enthält nur base/reset-Regeln.

### 3.2 Sektionen (1:1 aus diesem Guide übernehmen)

1. **Primary** — Blau-Familie (siehe §1.1).
2. **Surface & Background** — `--color-surface` (#FFFFFF), `--color-bg` (#F0F2F5), `--color-surface-hover` (#F4F6F8), `--color-surface-soft-cyan(-2)`.
3. **Border** — `--color-border` (#DDE2EA), `--color-border-light` (#EAECF0).
4. **Text** — `--color-text` (#1F2937), `--color-text-muted` (#6B7280), `--color-text-inverse` (#FFFFFF).
5. **Semantic** — Success `#10B981`, Warning `#F59E0B`, Danger `#EF4444`, Info `#3B82F6` (jeweils mit `-hover`, `-bg`, `-border`-Stufen). Focus-Ring-Tokens pro Semantic.
6. **Status-Badges** — `--status-idle`, `--status-running`, `--status-finished`, `--status-failed`, `--status-aborted` (jeweils mit eigenen `bg` + `text`-Werten).
7. **Layout** — `--sidebar-width: 300px`, `--sidebar-width-collapsed: 64px`, `--header-height: 80px`.
8. **Typography** — siehe §4.
9. **Spacing** — siehe §5.
10. **Shape (Radius)** — `--radius-sm: 4px`, `--radius-md: 10px`, `--radius-lg: 16px`, `--radius-pill: 99px`.
11. **Shadow** — `--shadow-sm`, `--shadow-md`, `--shadow-lg` (sparsam einsetzen — Tree-/Data-Views sind flat).

### 3.3 Re-keying-Regel

Wenn der Guide in ein anderes Brand-Klima portiert wird:
- Nur Primary-Familie + abgeleitete Surface-Soft-Tokens austauschen.
- Surface/Border/Text-Tokens bleiben neutral (sind brand-agnostic).

---

## 4. Typography

### 4.1 Body-Font (D-B02 · rev. 2026-05-26)

- `font-family: "Segoe UI", "Inter", Arial, sans-serif`.
- Segoe UI ist systemnativ unter Windows (Zielplattform) — keine Web-Font-Ladezeit, kein FOUT, kein `@fontsource`-Bundle nötig.
- Inter / Arial als Fallback für Nicht-Windows-Browser.
- **Änderung 2026-05-26 (User-Lock):** vormals Geist Variable (`@fontsource-variable/geist`). Auf Segoe UI umgestellt. Die Geist-Dependency kann beim nächsten Token-Refresh aus dem Bundle entfernt werden.

### 4.2 Heading-Scale (D-B03)

| Element | Size | Weight | Line-Height |
|---|---|---|---|
| H1 | 1.75 rem | 650-700 | 1.3 |
| H2 | 1.375 rem | 650-700 | 1.3 |
| H3 | 1.125 rem | 600 | 1.3 |
| H4 | 1 rem | 600 | 1.3 |
| H5 | sm | 600 | 1.3 |
| H6 | xs | 600 | 1.3 |

- **Keine Display-Font** — gleiche Familie für Body und Headings.

### 4.3 Monospace (D-V08)

- `font-family: "Cascadia Code", "Fira Mono", Consolas, monospace`.
- **Anwendung:** IDs, external_id, UID-Anzeigen, Job-IDs, Error-Codes, Stable-Error-Code-Toasts.
- **Style:** `overflow: hidden; text-overflow: ellipsis`.

---

## 5. Spacing

4 px-Grid (Tailwind-kompatibel — 4 px = Tailwind `1`):

| Token | Wert | Tailwind |
|---|---|---|
| `--space-1` | 4 px | 1 |
| `--space-2` | 8 px | 2 |
| `--space-3` | 12 px | 3 |
| `--space-4` | 16 px | 4 |
| `--space-5` | 20 px | 5 |
| `--space-6` | 24 px | 6 |
| `--space-8` | 32 px | 8 |
| `--space-10` | 40 px | 10 |

---

## 6. Komponenten-Konvention

### 6.1 UI-Library: shadcn

- **shadcn ist die UI-Library** für 3FLS-EAM-Frontends. Kein Mantine, kein Custom-Komponenten-Layer.
- Bestehende shadcn-Komponenten ziehen die Tokens automatisch über CSS-Variables — **keine Component-Code-Migration nötig** beim Token-Wechsel.

### 6.2 Intent-Modell für Buttons (D-A02)

5 Intents, gemappt auf shadcn-Button `variant`-Prop:

| Intent | Token-Bindung | Use-Case |
|---|---|---|
| `primary` | `bg-primary text-primary-foreground border-primary` | Haupt-CTA pro View, max. 1 |
| `secondary` | `bg-secondary text-secondary-foreground border-secondary` | Sekundäre Aktionen |
| `ghost` | `bg-transparent text-foreground hover:bg-accent` | Tertiäre Actions, Toolbar-Icons |
| `danger` | `bg-destructive text-destructive-foreground border-destructive` | Löschen, irreversible Aktionen |
| `success` | `bg-success text-success-foreground border-success` | Bestätigung, Confirm-Dialogs |

- Umsetzung im existierenden `components/ui/button.tsx` (shadcn) via erweiterten `variant`-Prop.
- **KEIN neuer AppButton-Wrapper-File.**

### 6.3 Status-Pills (D-V09)

- `border-radius: var(--radius-pill)` (99 px), `height: 18 px`, `padding: 1px 7px`, `border + bg` aus `--status-*`-Familie.
- **Use-Cases:** NodeRevisionPill, Subtype-Marker, Status-Badges (idle/running/finished/failed/aborted).

---

## 7. Tree-View-Pattern

Verbindlich für jede hierarchische Liste im 3FLS-EAM-Brand.

### 7.1 Container (D-V10)

- Tree + Tabelle als **ein gemeinsames Panel**.
- Container: `border: 1px solid var(--color-border)` + `background: var(--color-surface)` + `border-radius: var(--radius-md)` + `overflow: hidden`.
- Tree-Spalte links **innerhalb** der Tabelle (eine `<th>`/`<td>` pro Row) — kein separater Tree-Komponent daneben.

### 7.2 Spaltenköpfe (D-V01)

- `background: var(--color-bg)` (Light-Grey).
- `color: var(--color-text-muted)`, `text-transform: uppercase`, `font-weight: 700`, `font-size: xs`.
- `sticky-top`.
- **NICHT Blau** — würde mit dem Topbar-Gradient konkurrieren. Der Brand-Akzent (Blau) wohnt in §7.5 Item-Icon.

### 7.3 Cell-Borders (D-V02)

- **Vertikal:** `border-right: 1px solid var(--color-primary-light)` (Blau).
- **Horizontal:** `border-bottom: 1px solid var(--color-border-light)` (neutral).

### 7.4 Density (D-V03, D-V04)

- Body-Row: `height: 32px`, `padding: 4px 10px`.
- Header: `padding: 8px 10px`.
- **Hover:** `background: var(--color-surface-hover)` — flat, kein Card-Shadow pro Row.
- **Selection-Row:** eigener Background, vorerst `var(--color-surface-soft-cyan)`.

### 7.5 Tree-Spezifika (D-V05, D-V06, D-V07, D-V11)

- **Indentation:** `padding-left: ${depth * 22}px` im Tree-Cell-Content (22 px pro Depth-Level).
- **Expander-Chevron:** 18×18 px (`width/height/min-width/min-height: 18px`, `flex: 0 0 18px`).
- **Spacer für Leaf-Rows:** gleiche Box-Maße wie Expander, leer — damit Item-Icons alignen.
- **Item-Icon:** `color: var(--color-primary)` (Blau), 16–18 px vor Node-Name. **Hier wohnt der Blau-Brand-Akzent.**
- **Element-Name:** `font-weight: 650` (leicht fetter als Body-Text `400`).

---

## 8. Accessibility

### 8.1 Focus-Ring (D-A05)

- `:focus-visible` mit Focus-Ring-Token pro Semantic:
  - `--color-focus-ring` (Primary, Blau)
  - `--color-focus-ring-success`
  - `--color-focus-ring-danger`
- Standard-Pattern: `box-shadow: 0 0 0 3px var(--color-focus-ring)` auf Buttons/Inputs/ActionIcons.
- **Niemals `outline: none` ohne ersetzendes Focus-Indikator-Pattern.**

### 8.2 Contrast

- Blau-Primary auf Weiß muss WCAG AA erfüllen (≥ 4.5:1 für Text, ≥ 3:1 für UI-Komponenten).
- Bei Blau-Background unbedingt Text-Token aus `--color-text-inverse` oder ausreichend dunkles `--color-text` verwenden.

### 8.3 Status nicht nur via Color

- Status muss zusätzlich zur Farbe ein Icon, Label oder Pattern haben.
- Z.B. Status-Pill: nicht nur grüner Background, sondern auch "Finished"-Text.

---

## 9. Code-Standards

### 9.1 ESLint-Guardrail (D-A06, D-C03)

Pflicht-Rule: blockt **ad-hoc Color-Strings** in TSX/CSS.

Blockierte Pattern:
- `bg-{red,blue,cyan,green,...}-{number}` (Tailwind-Default-Farbklassen ohne Token-Anbindung)
- Inline `style={{ color: '#abc123' }}` mit Hex-/RGB-Literals
- Legacy-Class-Namen wie `btn-primary`, `text-muted`, `button-row`, `field-group`

Whitelist:
- Tailwind-Klassen, die in `@theme` mit Tokens definiert sind (z.B. `bg-primary`, `text-foreground`).

### 9.2 Token-Pflicht

- **Tokens > ad-hoc Hex/RGB.**
- Neue Farbe nötig? Erst Token in `tokens.css` definieren, dann konsumieren.

### 9.3 Copy-Konvention

- Recurring Labels in zentralem `src/ui/copy.ts`.
- Beispiele: `Refresh`, `Reset Filters`, `Previous`, `Next`, `No records found`.
- Keine Inline-Strings für UI-Texte, die mehrfach vorkommen.

### 9.4 Feedback-Standard

- Single Notification-API: `src/ui/notify.ts`.
- Toast-Library: `sonner` (Position: bottom-right, Mantine-style).
- Stable-Error-Codes (`E_INVALID_LINK_TYPE` etc.) bekommen Code-zu-Text-Mapping im Frontend, Backend bleibt Code-only.

---

## 10. Followups (3FLS-EAM-spezifisch)

### 10.1 Clipboard (D-C01)

- `navigator.clipboard.writeText` mit User-Gesture-Bindung als Primary-Path.
- `document.execCommand('copy')` als Fallback.
- Browser-Permission-Prompt eliminieren über defined User-Gesture-Source.
- Datei: `src/lib/clipboard.ts`.

### 10.2 Panel-Persistenz (D-C02)

- `react-resizable-panels` exact-pin `3.0.6` (kein Drift zu v4 — Breaking).
- v3-API: `defaultLayout` + `onLayoutChanged` + `localStorage`.
- localStorage-Key-Pattern: `panel-layout:${user_uid}:${viewer_id}`.

---

## 11. Out of Scope (deferred)

- **Mantine-Migration** — shadcn bleibt, kein Library-Switch.
- **Dark-Mode-Refresh** — `.dark`-Block bleibt mit shadcn-Default-Slate-Values. Eigene Folge-Phase falls Dark-Mode aktiviert wird.
- **Mobile-Responsive** — Spec ist Desktop.
- **Print-Styles** — out of scope.
- **Custom-Display-Font** — gleiche Familie für H1/Wordmark.
- **Per-Tenant-Theme-Override** — Token-System unterstützt es, aber kein aktiver Use-Case.

---

## Integration in andere Repos

### Variante A — Datei kopieren + CLAUDE.md-Block

1. Diese Datei in das Ziel-Repo legen als `docs/3FLS-EAM-STYLE-GUIDE.md`.
2. Im Ziel-Repo `CLAUDE.md` folgenden Block ergänzen:

```markdown
## Brand & UI Style

Dieses Repo folgt dem 3FLS-EAM Brand & UI Style Guide. Bei jeder UI-/Frontend-/Branding-/Style-Arbeit ist `docs/3FLS-EAM-STYLE-GUIDE.md` verbindlich zu lesen und einzuhalten:

- Blau-Primary (`#1E4F9C`), Magenta nur Logo-Bound.
- shadcn als UI-Library, Token-Architektur per `tokens.css`.
- Tree-View-Pattern: Header neutral, Item-Icon Blau, Indentation 22 px, Monospace-IDs.
- ESLint-Guardrail gegen ad-hoc Color-Strings.
- Geist Variable als Body-Font, 4 px-Spacing-Grid.

Bei Unklarheiten: Guide-Datei konsultieren, nicht eigenmächtig Design-Entscheidungen treffen.
```

### Variante B — Sharing via Onboarding-Link

Wenn Claude Code im anderen Repo läuft: per `/shareOnboardingGuide`-Link diesen Guide einbinden — kein Datei-Copy nötig, immer aktueller Stand.
