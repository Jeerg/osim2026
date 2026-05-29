---
phase: 01-live-viewer-bridge
plan: 12
type: execute
wave: 2
depends_on: [01-11]
gap_closure: true
autonomous: true
requirements: [O-2, O-3]
files_modified:
  - osim-ui/portal/src/routes/_authenticated/live.tsx
  - osim-ui/portal/src/features/live-stream/stream-router.tsx
  - osim-ui/portal/src/features/live-stream/components/AuswertungTable.tsx
  - osim-ui/portal/src/features/live-stream/components/DurchlaufplanGantt.tsx
  - osim-ui/portal/src/features/live-stream/components/SchichtTable.tsx
  - osim-ui/portal/src/features/live-stream/viewer-config.ts
  - osim-ui/portal/src/features/live-stream/__tests__/AuswertungTable.spec.tsx
  - osim-ui/portal/src/features/live-stream/__tests__/stream-router.spec.tsx
user_setup: []

must_haves:
  truths:
    - "Die /live-Tabs tragen die echten OSim-Viewer-Namen (Durchlaufplan, Einsatzzeit, Schicht) + die Auswertungs-Tabs (Gesamt, Produktionsaufträge, Bestellaufträge, Personal, Betriebsmittel, Kauf-/Eigenlager, Kalkulation, Warteschlange, Nicht bearbeitet) statt der rohen Stream-Tags"
    - "Jede Auswertung rendert als Tabelle mit den EXAKTEN deutschen OSim-Spalten-Headern (1:1 aus dem ISimulatorViewerAusw*.cpp)"
    - "Now-buildable Auswertungen zeigen echte Werte; slice-gated Felder zeigen '(Slice offen)' statt erfundener Zahlen"
    - "Der Durchlaufplan-Tab rendert einen faithful Gantt-Viewer über die bestehende GanttRow/GObject-Pipeline"
    - "vitest grün; die berührten Dateien sind lint-clean (repo-weiter Lint-Stand mit ~77 Pre-existing nicht angefasst)"
  artifacts:
    - path: "osim-ui/portal/src/features/live-stream/viewer-config.ts"
      provides: "OSim-Viewer-/Tab-Registry: Tab-Label, kind-Mapping, exakte deutsche Spalten-Header je Auswertung"
      contains: "Produktionsaufträge"
    - path: "osim-ui/portal/src/features/live-stream/components/AuswertungTable.tsx"
      provides: "Tabellen-Renderer je Auswertung mit echten OSim-Spalten + (Slice offen)-Markern"
      contains: "(Slice offen)"
    - path: "osim-ui/portal/src/routes/_authenticated/live.tsx"
      provides: "/live mit den echten OSim-Viewer-Tabs"
      contains: "Durchlaufplan"
  key_links:
    - from: "osim-ui/portal/src/routes/_authenticated/live.tsx"
      to: "osim-ui/portal/src/features/live-stream/viewer-config.ts"
      via: "Tab-Liste aus der Viewer-Registry"
      pattern: "viewer.?config|VIEWER"
    - from: "osim-ui/portal/src/features/live-stream/stream-router.tsx"
      to: "osim-ui/portal/src/features/live-stream/components/AuswertungTable.tsx"
      via: "Auswertungs-Tab → AuswertungTable mit kind-spezifischen Spalten"
      pattern: "AuswertungTable"
---

<objective>
Die `/live`-Sicht von den rohen Stream-Tags (lifecycle/gantt_durchlauf/
kpi_auswertung/…) auf die **echten OSim2004-Viewer-Namen** umstellen und jede
Auswertung als Tabelle mit den **exakten deutschen OSim-Spalten-Headern**
rendern. Die vorherige UI (01-02/01-05) zeigte technische Tags und generische
KPI-Kacheln (count + Trend) — für einen Anwender bedeutungslos und nicht
OSim-treu.

Neue Tab-Struktur (echte OSim-Namen):
- **Durchlaufplan** (gantt_durchlauf — faithful Gantt-Viewer über GanttRow/GObject)
- **Einsatzzeit** (gantt_einsatz)
- **Schicht** (gantt_schicht — Tabelle Person/Schichten/Überstunden/Einheiten)
- Auswertungen (kpi_auswertung, je kind ein eigener Tab): **Gesamt**,
  **Produktionsaufträge**, **Bestellaufträge**, **Personal**, **Betriebsmittel**,
  **Kauf-/Eigenlager**, **Kalkulation**, **Warteschlange**, **Nicht bearbeitet**.

Jede Auswertung rendert als Tabelle mit den EXAKTEN OSim-Spalten-Headern (aus
den .cpp gepinnt, an die 01-11-Feldnamen gebunden). Now-buildable Werte echt;
slice-gated Felder als "(Slice offen)" — NIE erfundene Zahlen. Optik darf modern/
schöner sein (3FLS-Style-Guide), das PRINZIP ist OSim.

Purpose: O-2 + O-3 in der UI ehrlich erfüllen — benannte Viewer + faithful
Analysen statt technischer Tags.
Output: neue/umgebaute Tab-Route + Viewer-Registry + AuswertungTable +
DurchlaufplanGantt + SchichtTable + vitest-Specs.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-live-viewer-bridge/01-SPEC.md
@.planning/phases/01-live-viewer-bridge/01-CONTEXT.md
@.planning/phases/01-live-viewer-bridge/01-05-SUMMARY.md
@.planning/phases/01-live-viewer-bridge/01-09-SUMMARY.md
@.planning/phases/01-live-viewer-bridge/01-11-SUMMARY.md
@osim-ui/CLAUDE.md
@osim-ui/docs/3FLS-EAM-STYLE-GUIDE.md

<interfaces>
<!-- Bestehende UI-Bausteine, die wiederverwendet/umgebaut werden -->

Frame-Typ (features/live-stream/types.ts):
- `Frame { t, stream: StreamTag, seq, v: Record<string, unknown>, wall_t?, meta_event? }`
- `StreamTag = lifecycle | gantt_durchlauf | gantt_einsatz | gantt_schicht | kpi_auswertung | reporting_record`

Store (features/live-stream/store.ts):
- `useLiveStreamStore` mit `byStream[tag]: Frame[]`, `activeStream`, `setActiveStream`,
  `ingest`, `setMeta`, `streamStatus[tag]`, `schemaMismatch`, `hasGap`, `reset`

Bestehende Render-Komponenten:
- `GanttRow` (features/live-stream/components/GanttRow.tsx) — GObject-Geometrie, props {auftragId, frames, pxPerSecond}; WIEDERVERWENDEN für DurchlaufplanGantt
- `RecordTable` (components/RecordTable.tsx) — @tanstack/react-table mit Sort/Filter/Windowing; Pattern-Vorlage für AuswertungTable
- `KpiTile` (components/KpiTile.tsx) — generische Kachel (wird durch die OSim-Tabellen ERSETZT für die Auswertungs-Tabs; KpiTile darf bleiben oder entfallen)
- `PartialBanner` (components/PartialBanner.tsx) — partial-Status + Schema-Mismatch-Banner; je Tab weiter rendern
- `StreamRouter` (stream-router.tsx) — multiplext Tag → Render-Komponente

01-11 liefert (Engine): kpi_auswertung-Frames mit kind-Diskriminator und den
echten OSim-Feldnamen; now-buildable kinds tragen v.records[], slice-gated kinds
tragen die echten Felder mit null + v.missing_slice. gantt_schicht-Frames tragen
person/schichten/ueberstunden/einheiten (+ missing_slice).

Style (osim-ui/CLAUDE.md + 3FLS-Guide): shadcn, Token-only (ad-hoc Hex
ESLint-blockiert), Segoe UI, Blau-Primary #1E4F9C, Monospace-IDs (Cascadia),
A11y :focus-visible, Status nie nur über Farbe. Deutsch in User-facing Texten.
</interfaces>

<osim_tab_and_column_reference>
<!-- Verbindlich: Tab-Label + exakte deutsche OSim-Spalten je Auswertung.
     Spalten 1:1 aus den ISimulatorViewerAusw*.cpp Printf-Headern. -->

VIEWER-TABS (Reihenfolge wie OSim ISimulatorViewerAuswertung.cpp + Gfx-Viewer):
- "Durchlaufplan" → gantt_durchlauf (Gantt)
- "Einsatzzeit" → gantt_einsatz
- "Schicht" → gantt_schicht (Tabelle: Person · Schichten · Überstunden · Einheiten)
- "Gesamt" → kpi_auswertung kind=gesamt
- "Produktionsaufträge" → kind=prod_auftrag
- "Bestellaufträge" → kind=best_auftrag
- "Personal" → kind=pers
- "Betriebsmittel" → kind=betr
- "Kauf-/Eigenlager" → kinds kauf + eigen (zwei Tabellen-Blöcke in einem Tab)
- "Kalkulation" → kind=kalkulation
- "Warteschlange" → kind=wschlange
- "Nicht bearbeitet" → kind=nbearbeit

EXAKTE DEUTSCHE SPALTEN (je Analyse, 1:1 aus .cpp):
- Produktionsaufträge (prod_auftrag): "Teil" · "Menge" · "Soll-Beginntermin (Tag)" · "Beschreibung"
- Bestellaufträge (best_auftrag): "Teil" · "Menge" · "Bestelltermin (Tag)" · "Auftragstyp" · "Beschreibung"
- Nicht bearbeitet (nbearbeit): Titel "Nicht abgearbeitete Produktionsaufträge"; "zu produz. Teil" · "Menge" · "Beginntermin"
- Warteschlange (wschlange): "Betriebsmittel" · "zu produz. Teil" · "Restmenge" · "aktueller Status"
- Personal (pers): "Personal" · "Anzahl Schichten" · "Überstunden" · "verfügbare Kapazität" · "Auslastung" · "Kosten pro Arbeitsstd." · "kalkulator. Stundensatz" · "Gesamtkosten der Periode"
- Betriebsmittel (betr): "Betriebsmittel" · "Fixkosten pro Stunde" · "Kosten pro Arbeitsstd." · "kalkulator. Stundensatz" · "Gesamtkosten der Periode"
- Kauf (kauf): "Teil" · "aktueller Bestand" · "verbrauchte Teile" · "gelieferte Teile" · "vergebliche Anforderung" · "Teilewert gesamt" · "Teilewert Neuteile" · "Bestellkosten" · "Lagerhaltungskosten" · "Kapitalkosten"
- Eigen (eigen): "Teil" · "aktueller Bestand" · "prod. Menge" · "verbr. Menge" · "Teilewert gesamt" · "Teilewert Neuteile" · "eingehende Teile" · "Betr.M.-Kosten" · "Personalkosten" · "Lagerhaltungskosten" · "Kapitalkosten"
- Kalkulation (kalkulation): zwei Blöcke. Kostenkalkulation: "Letzter Lagerwert" · "Betriebsmittelkosten" · "Personalkosten" · "Lagerhaltungskosten" · "Kapitalbindungskosten" · "Beschaffungskosten" · "Zukaufteilekosten" · "Lagerwertabgang P1/P2/P3" · "Berechneter Lagerwert". Lagerkalkulation (K/E/P): "Letzter/Abgegangener/Zugegangener/Aktueller Lagerwert" je K, E, P · "Materialwert in der Fertigung" · "Aktueller Lagerwert".
- Gesamt (gesamt): "Gesamtergebnis" (Verkaufserlös); "Verkaufsergebnisse" je Produkt 1-3 (Vertriebswunsch · Absatz · Herstellkosten · Verkaufspreis · Erlös); "Kennzahlen" (Verfügbare Kapazität · Auslastung · Lieferfähigkeit · Mittl. Herstellkosten · Mittlerer Lagerwert).
- Schicht (gantt_schicht): "Person" · "Schichten" · "Überstunden" · "Einheiten"

GATED-RENDER-REGEL: wo das Feld in v null ist (slice-gated, v.missing_slice
gesetzt), die Zelle als "(Slice offen)" rendern (Token-muted, A11y-Text, NICHT
nur Farbe). Niemals 0 oder erfundene Werte zeigen.
</osim_tab_and_column_reference>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Viewer-Registry + AuswertungTable mit den exakten OSim-Spalten</name>
  <files>osim-ui/portal/src/features/live-stream/viewer-config.ts, osim-ui/portal/src/features/live-stream/components/AuswertungTable.tsx, osim-ui/portal/src/features/live-stream/components/SchichtTable.tsx, osim-ui/portal/src/features/live-stream/__tests__/AuswertungTable.spec.tsx</files>
  <read_first>
    - osim-ui/portal/src/features/live-stream/components/RecordTable.tsx (Tabellen-Pattern: @tanstack/react-table, ColumnDef, Windowing, test-ids)
    - osim-ui/portal/src/features/live-stream/types.ts (Frame/StreamTag)
    - osim-ui/portal/src/features/live-stream/components/KpiTile.tsx (LABEL_BY_KIND — bisherige kind-Labels)
    - das <osim_tab_and_column_reference>-Block oben (verbindliche Spalten/Labels)
    - .planning/phases/01-live-viewer-bridge/01-11-SUMMARY.md (echte kpi_auswertung-Felder + records-Struktur + missing_slice)
    - osim-ui/docs/3FLS-EAM-STYLE-GUIDE.md (Token-only, A11y, Tabellen-Styling)
  </read_first>
  <behavior>
    - viewer-config.ts exportiert eine geordnete Viewer-Registry: je Tab {id, label (deutsch), source: StreamTag, kind?} und je Auswertungs-kind die exakten Spalten-Definitionen {key, header} aus <osim_tab_and_column_reference>.
    - AuswertungTable rendert für ein gegebenes kind die Tabelle mit genau den OSim-Spalten-Headern dieses kinds.
    - Now-buildable kind (z.B. prod_auftrag) mit v.records[] → eine Zeile je Record, echte Werte in den Zellen.
    - Slice-gated kind (z.B. pers) mit null-Feldern + v.missing_slice → Zellen zeigen "(Slice offen)" (Token-muted, aria-Label).
    - SchichtTable rendert Person/Schichten/Überstunden/Einheiten; gated → "(Slice offen)".
    - Test: AuswertungTable für prod_auftrag zeigt die 4 exakten Header und eine Record-Zeile mit echten Werten.
    - Test: AuswertungTable für pers zeigt die 8 exakten Header und "(Slice offen)" in den gated-Zellen, KEINE 0/erfundenen Zahlen.
    - Test: SchichtTable zeigt die 4 Schicht-Header.
  </behavior>
  <action>
    Lege viewer-config.ts als single source of truth für die OSim-Viewer-Struktur
    an: eine geordnete Tab-Registry (Reihenfolge + deutsches Label + source-Tag +
    optional kind) und pro Auswertungs-kind die Spalten-Liste mit den EXAKTEN
    deutschen Headern aus <osim_tab_and_column_reference>. Die Header-Strings sind
    1:1 aus den .cpp; die Spalten-keys binden an die 01-11-Feldnamen.

    Baue AuswertungTable.tsx generisch: nimmt kind + die kind-Frames, liest die
    Spalten aus viewer-config, rendert eine shadcn-Table (Pattern aus
    RecordTable.tsx — Token-only, kein ad-hoc Hex). Für now-buildable kinds (mit
    v.records[]) eine Zeile je Record; für slice-gated kinds eine Zeile mit den
    echten Spalten, deren Werte aus v gelesen werden — ist ein Wert null und
    v.missing_slice gesetzt, rendere "(Slice offen)" (muted-Token + aria-Label,
    A11y: Information nicht nur über Farbe). Kalkulation/Gesamt sind Block-/
    Kennzahlen-Layouts (Label-Wert-Paare statt flacher Zeilen) — bilde sie als
    sektionierte Tabelle ab, Header je Block aus der Registry.

    Baue SchichtTable.tsx analog für gantt_schicht (4 Spalten Person/Schichten/
    Überstunden/Einheiten, gated "(Slice offen)").

    Vergib stabile data-testids: ausw-table-{kind}, ausw-header-{kind}-{key},
    ausw-cell-gated, schicht-table. Schreibe die Specs (RED → GREEN) gegen die
    exakten Header + den Gated-Marker.
  </action>
  <verify>
    <automated>cd osim-ui/portal && npm run test:run -- src/features/live-stream/__tests__/AuswertungTable.spec.tsx</automated>
  </verify>
  <done>viewer-config.ts trägt die geordnete OSim-Viewer-Registry + exakte Spalten je kind; AuswertungTable + SchichtTable rendern die echten Header, echte Werte (now-buildable) bzw. "(Slice offen)" (slice-gated); Spec grün.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: /live-Tabs auf OSim-Viewer-Namen umstellen + DurchlaufplanGantt + Router-Verdrahtung</name>
  <files>osim-ui/portal/src/routes/_authenticated/live.tsx, osim-ui/portal/src/features/live-stream/stream-router.tsx, osim-ui/portal/src/features/live-stream/components/DurchlaufplanGantt.tsx, osim-ui/portal/src/features/live-stream/__tests__/stream-router.spec.tsx</files>
  <read_first>
    - osim-ui/portal/src/routes/_authenticated/live.tsx (aktuelle Tab-Leiste STREAM_LABELS + STREAM_TAGS-Loop — wird durch die Viewer-Registry ersetzt)
    - osim-ui/portal/src/features/live-stream/stream-router.tsx (aktueller Multiplex Tag→Komponente — wird um die kind-Auswertungs-Tabs + DurchlaufplanGantt erweitert)
    - osim-ui/portal/src/features/live-stream/components/GanttRow.tsx (GObject-Pipeline, props — WIEDERVERWENDEN)
    - osim-ui/portal/src/features/live-stream/viewer-config.ts (aus Task 1)
    - osim-ui/portal/src/features/live-stream/components/PartialBanner.tsx (je Tab weiter rendern)
    - das <osim_tab_and_column_reference>-Block oben (Tab-Reihenfolge + Labels)
  </read_first>
  <behavior>
    - /live rendert die Tab-Leiste aus der Viewer-Registry (Task 1): echte deutsche OSim-Labels in OSim-Reihenfolge, nicht die rohen Stream-Tags.
    - Tab-Wechsel setzt activeStream (für tag-basierte Streams) bzw. wählt für kpi_auswertung-Tabs zusätzlich das kind.
    - StreamRouter rendert: Durchlaufplan → DurchlaufplanGantt; Einsatzzeit → bestehende Einsatz-Darstellung; Schicht → SchichtTable; jeder Auswertungs-Tab → AuswertungTable für sein kind (gefiltert auf die kind-Frames).
    - DurchlaufplanGantt rendert eine GanttRow je Auftrag über die bestehende GObject-Pipeline (faithful Durchlaufplan: Zeilen = Aufträge/Prozesse, X = Zeit).
    - Über jedem Panel weiter der PartialBanner.
    - Test: /live zeigt einen Tab "Produktionsaufträge" und "Durchlaufplan" (echte OSim-Labels), nicht "kpi_auswertung"/"gantt_durchlauf" als Anzeige-Text.
    - Test: Auswahl eines Auswertungs-Tabs rendert die AuswertungTable mit dem kind-spezifischen Header und NICHT die anderen Panels (Stream-Isolation, AC-4).
  </behavior>
  <action>
    Ersetze in live.tsx die STREAM_LABELS/STREAM_TAGS-Tab-Generierung durch die
    Viewer-Registry aus viewer-config.ts: die TabsList iteriert über die Registry
    und zeigt die echten deutschen OSim-Labels in OSim-Reihenfolge. Behalte den
    bestehenden Run-Setup-Bereich (Modell-Picker, Lauf starten, run_id, coverage-
    /gap-Banner) und den 200ms-Tail-/30Hz-Coalescing-Tick UNVERÄNDERT (01-09-
    Wiring). Pro Auswertungs-Tab wird zusätzlich zum source-Tag das kind an den
    Router durchgereicht (z.B. via TabsContent value = registry-id, Router liest
    source+kind aus der Registry).

    Erweitere stream-router.tsx: ein Auswertungs-Tab (source kpi_auswertung +
    kind) filtert byStream["kpi_auswertung"] auf Frames dieses kinds und rendert
    <AuswertungTable kind=… frames=…>. gantt_schicht → <SchichtTable>.
    gantt_durchlauf → <DurchlaufplanGantt>. Der bisherige KpiTile-Grid-Pfad
    entfällt für die Auswertungs-Tabs (durch die OSim-Tabellen ersetzt). Stream-
    Isolation (AC-4) bleibt: genau ein Panel je aktivem Tab. PartialBanner je Tab.

    Baue DurchlaufplanGantt.tsx, das die gantt_durchlauf-Frames nach Auftrag
    gruppiert und je Auftrag eine GanttRow (bestehende GObject-Pipeline)
    rendert — übernimm die Gruppierungs-/Achsen-Logik aus dem bisherigen
    GanttPanel im stream-router (verschiebe sie in die dedizierte Komponente).
    Faithful Durchlaufplan: Zeilen = Aufträge/Prozesse, X = Zeit; Optik darf
    3FLS-modern sein, das Prinzip ist OSim PDlplViewerStd.

    Aktualisiere die stream-router-Spec (RED → GREEN): echte Tab-Labels sichtbar,
    Auswertungs-Tab rendert die AuswertungTable mit kind-Header, Isolation
    gewahrt. Token-only Styling, A11y-Tab-Fokus-Ring (3FLS-Guide).
    Repo-weiten Lint-Stand (~77 Pre-existing) NICHT anfassen.
  </action>
  <verify>
    <automated>cd osim-ui/portal && npm run test:run -- src/features/live-stream && npx eslint src/routes/_authenticated/live.tsx src/features/live-stream/stream-router.tsx src/features/live-stream/components/DurchlaufplanGantt.tsx src/features/live-stream/components/AuswertungTable.tsx src/features/live-stream/components/SchichtTable.tsx src/features/live-stream/viewer-config.ts</automated>
  </verify>
  <done>/live trägt die echten OSim-Viewer-Tabs; StreamRouter multiplext auf DurchlaufplanGantt/SchichtTable/AuswertungTable je kind (Isolation gewahrt); DurchlaufplanGantt reused GanttRow; vitest grün; berührte Dateien lint-clean.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| stream.jsonl → UI-Render | Vom Backend gelieferte Frame-Werte werden in Tabellen gerendert; gated/null-Werte dürfen nicht als echte Zahlen erscheinen (Fehlinformation). |
| Frame.v → DOM-Zelle | v ist Record<string, unknown> (ungetypt); fehlerhafte/große Werte könnten den Render fluten oder unsanitisiert dargestellt werden. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-12A | Information Disclosure | slice-gated Zellen | mitigate | Gated-Felder rendern "(Slice offen)" statt null/0 — verhindert Fehlinterpretation als echter KPI (User-Direktive "nicht erfinden"). Spec prüft, dass keine 0/Schein-Zahl in gated-Zellen steht. |
| T-01-12B | Denial of Service | AuswertungTable Record-Listen | mitigate | Tabellen-Windowing-Cap analog RecordTable (T-01-12 aus 01-05) bei großen records[]; sichtbares Fenster begrenzt das DOM. |
| T-01-12C | Tampering | Frame.v-Zellinhalt | accept | React escapt String-Inhalte by default; v-Werte sind read-only Anzeige, keine dangerouslySetInnerHTML. |
| T-01-12-SC | Tampering | npm/pip/cargo installs | mitigate | Keine neuen npm-Installs (Wiederverwendung von @tanstack/react-table + shadcn-Table aus 01-05). |
</threat_model>

<verification>
- `cd osim-ui/portal && npm run test:run -- src/features/live-stream` grün.
- `npx eslint` der sechs berührten Code-Dateien → 0 errors (repo-weiter Lint-Stand mit ~77 Pre-existing nicht angefasst, dokumentiert).
- /live-Tabs zeigen echte OSim-Labels (Durchlaufplan, Produktionsaufträge, …), nicht die rohen Stream-Tags.
- Slice-gated Zellen zeigen "(Slice offen)", keine erfundenen Zahlen.
</verification>

<success_criteria>
- /live trägt die echten OSim-Viewer-Tabs in OSim-Reihenfolge.
- Jede Auswertung rendert mit den exakten deutschen OSim-Spalten-Headern.
- Now-buildable Werte echt; slice-gated als "(Slice offen)".
- Durchlaufplan-Tab = faithful Gantt über GanttRow/GObject.
- vitest grün; berührte Dateien lint-clean.
</success_criteria>

<output>
Create `.planning/phases/01-live-viewer-bridge/01-12-SUMMARY.md` when done
</output>
