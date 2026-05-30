/**
 * viewer-config — Single source of truth für die OSim2004-Viewer-Struktur der
 * /live-Sicht (Plan 01-12 Task 1, O-2 / O-3).
 *
 * GAP-CLOSURE 01-12: ersetzt die rohen Stream-Tag-Tabs (lifecycle/
 * gantt_durchlauf/kpi_auswertung/…) durch die ECHTEN OSim2004-Viewer-Namen und
 * pinnt je Auswertung die EXAKTEN deutschen Spalten-Header 1:1 aus den
 * `ISimulatorViewerAusw*.cpp` / `ISimulatorViewerSchicht.cpp`. Die Spalten-keys
 * binden an die von 01-11 emittierten Feldnamen (siehe
 * engine/.../schemas/kpi_auswertung.json + gantt_schicht.json) — keine
 * erfundene Generik mehr.
 *
 * Reihenfolge der Tabs folgt OSim (Gfx-Viewer + ISimulatorViewerAuswertung):
 * zuerst die Gantt-/Zeit-Viewer (Durchlaufplan = der primäre Grafik-Viewer,
 * von dem aus der Lauf gesteuert wird — FSimulatorViewerGfx-treu), dann die
 * Schicht-Tabelle, dann die Auswertungen.
 *
 * Fidelity: das PRINZIP + die Labels sind OSim; die Optik darf modern/3FLS sein.
 * NIE erfundene Zahlen — wo 01-11 ein Feld als slice-gated (null +
 * missing_slice) emittiert, rendert die UI "(Slice offen)".
 */

import type { StreamTag } from "./types";

/** kpi_auswertung-kind-Diskriminator (1:1 die 11 OSim-Auswertungen aus 01-11). */
export type AuswertungKind =
  | "gesamt"
  | "prod_auftrag"
  | "best_auftrag"
  | "pers"
  | "betr"
  | "kauf"
  | "eigen"
  | "kalkulation"
  | "wschlange"
  | "nbearbeit";

/**
 * Render-Modus eines Auswertungs-kinds:
 *  - "records": now-buildable, v.records[] → eine Zeile je Record (echte Werte).
 *  - "snapshot": slice-gated Einzel-Snapshot, die echten Feldnamen werden direkt
 *    aus v gelesen; null + v.missing_slice → "(Slice offen)".
 *  - "sections": Block-/Kennzahlen-Layout (Kalkulation, Gesamt) als
 *    sektionierte Label-Wert-Tabelle.
 */
export type AuswertungRenderMode = "records" | "snapshot" | "sections";

/** Eine Spalten-Definition: stabiler key (= 01-11-Feldname) + OSim-Header. */
export interface OsimColumn {
  /** Feld-key, bindet an die 01-11-Engine-Feldnamen (v[...] bzw. record[...]). */
  key: string;
  /** EXAKTER deutscher OSim-Spalten-Header (1:1 aus der .cpp). */
  header: string;
}

/** Ein benannter Block einer sektionierten Auswertung (Kalkulation/Gesamt). */
export interface OsimSection {
  /** Block-Titel (OSim). */
  title: string;
  /** Label-Wert-Paare des Blocks (key bindet an 01-11-Feld). */
  rows: OsimColumn[];
}

/**
 * Eine Auswertungs-Definition: Render-Modus + (je nach Modus) Spalten oder
 * Sektionen. Die Spalten-/Sektions-Header sind verbindlich 1:1 aus den .cpp.
 */
export interface AuswertungDef {
  kind: AuswertungKind;
  mode: AuswertungRenderMode;
  /** Spalten (mode "records" / "snapshot"). */
  columns?: OsimColumn[];
  /** Sektionen (mode "sections"). */
  sections?: OsimSection[];
}

/** Spalten der Schicht-Tabelle (gantt_schicht, ISimulatorViewerSchicht FillList). */
export const SCHICHT_COLUMNS: OsimColumn[] = [
  { key: "person", header: "Person" },
  { key: "schichten", header: "Schichten" },
  { key: "ueberstunden", header: "Überstunden" },
  { key: "einheiten", header: "Einheiten" },
];

/**
 * Auswertungs-Definitionen je kind. Spalten-keys = 01-11-Feldnamen
 * (kpi_auswertung.json), Header = exakte OSim-Spalten (ISimulatorViewerAusw*.cpp).
 */
export const AUSWERTUNG_DEFS: Record<AuswertungKind, AuswertungDef> = {
  // NOW-BUILDABLE (records[])
  prod_auftrag: {
    kind: "prod_auftrag",
    mode: "records",
    columns: [
      { key: "teil", header: "Teil" },
      { key: "menge", header: "Menge" },
      { key: "soll_beginn_tag", header: "Soll-Beginntermin (Tag)" },
      { key: "beschreibung", header: "Beschreibung" },
    ],
  },
  nbearbeit: {
    kind: "nbearbeit",
    mode: "records",
    columns: [
      { key: "teil", header: "zu produz. Teil" },
      { key: "menge", header: "Menge" },
      { key: "beginntermin", header: "Beginntermin" },
    ],
  },
  wschlange: {
    kind: "wschlange",
    mode: "records",
    columns: [
      { key: "bm_name", header: "Betriebsmittel" },
      { key: "teil", header: "zu produz. Teil" },
      { key: "restmenge", header: "Restmenge" },
      { key: "wartestatus", header: "aktueller Status" },
    ],
  },

  // SLICE-GATED Bestellaufträge (records leer + missing_slice) — Spalten dennoch
  // anzeigen (eine Zeile "(Slice offen)").
  best_auftrag: {
    kind: "best_auftrag",
    mode: "records",
    columns: [
      { key: "teil", header: "Teil" },
      { key: "menge", header: "Menge" },
      { key: "best_termin_tag", header: "Bestelltermin (Tag)" },
      { key: "auftrags_typ", header: "Auftragstyp" },
      { key: "beschreibung", header: "Beschreibung" },
    ],
  },

  // SLICE-GATED Snapshots (echte Feldnamen, null + missing_slice)
  pers: {
    kind: "pers",
    mode: "snapshot",
    columns: [
      { key: "name", header: "Personal" },
      { key: "schichten", header: "Anzahl Schichten" },
      { key: "ueberstunden_pct", header: "Überstunden" },
      { key: "kann_kap_pct", header: "verfügbare Kapazität" },
      { key: "auslastung_pct", header: "Auslastung" },
      { key: "kosten_pro_arbeitsstd", header: "Kosten pro Arbeitsstd." },
      { key: "kalk_stundensatz", header: "kalkulator. Stundensatz" },
      { key: "gesamtkosten_periode", header: "Gesamtkosten der Periode" },
    ],
  },
  betr: {
    kind: "betr",
    mode: "snapshot",
    columns: [
      { key: "name", header: "Betriebsmittel" },
      { key: "fixkosten_pro_stunde", header: "Fixkosten pro Stunde" },
      { key: "kosten_pro_arbeitsstd", header: "Kosten pro Arbeitsstd." },
      { key: "kalk_stundensatz", header: "kalkulator. Stundensatz" },
      { key: "gesamtkosten_periode", header: "Gesamtkosten der Periode" },
    ],
  },
  kauf: {
    kind: "kauf",
    mode: "snapshot",
    columns: [
      { key: "teil", header: "Teil" },
      { key: "aktueller_bestand", header: "aktueller Bestand" },
      { key: "verbrauchte_teile", header: "verbrauchte Teile" },
      { key: "gelieferte_teile", header: "gelieferte Teile" },
      { key: "vergebliche_anforderung", header: "vergebliche Anforderung" },
      { key: "teilewert_gesamt", header: "Teilewert gesamt" },
      { key: "teilewert_neuteile", header: "Teilewert Neuteile" },
      { key: "bestellkosten", header: "Bestellkosten" },
      { key: "lagerhaltungskosten", header: "Lagerhaltungskosten" },
      { key: "kapitalkosten", header: "Kapitalkosten" },
    ],
  },
  eigen: {
    kind: "eigen",
    mode: "snapshot",
    columns: [
      { key: "teil", header: "Teil" },
      { key: "aktueller_bestand", header: "aktueller Bestand" },
      { key: "prod_menge", header: "prod. Menge" },
      { key: "verbr_menge", header: "verbr. Menge" },
      { key: "teilewert_gesamt", header: "Teilewert gesamt" },
      { key: "teilewert_neuteile", header: "Teilewert Neuteile" },
      { key: "eingehend_teile", header: "eingehende Teile" },
      { key: "betrm_kosten", header: "Betr.M.-Kosten" },
      { key: "personalkosten", header: "Personalkosten" },
      { key: "lagerhaltungskosten", header: "Lagerhaltungskosten" },
      { key: "kapitalkosten", header: "Kapitalkosten" },
    ],
  },

  // SECTIONS (Block-/Kennzahlen-Layout)
  kalkulation: {
    kind: "kalkulation",
    mode: "sections",
    sections: [
      {
        title: "Kostenkalkulation",
        rows: [
          { key: "last_lgw", header: "Letzter Lagerwert" },
          { key: "betr_kost", header: "Betriebsmittelkosten" },
          { key: "pers_kost", header: "Personalkosten" },
          { key: "lager_kost", header: "Lagerhaltungskosten" },
          { key: "kapit_kost", header: "Kapitalbindungskosten" },
          { key: "besch_kost", header: "Beschaffungskosten" },
          { key: "teile_kost", header: "Zukaufteilekosten" },
          { key: "lagerwertabgang_p1", header: "Lagerwertabgang P1" },
          { key: "lagerwertabgang_p2", header: "Lagerwertabgang P2" },
          { key: "lagerwertabgang_p3", header: "Lagerwertabgang P3" },
          { key: "berechneter_lagerwert", header: "Berechneter Lagerwert" },
        ],
      },
      {
        title: "Lagerkalkulation (Kauf)",
        rows: [
          { key: "last_lgw_k", header: "Letzter Lagerwert" },
          { key: "lga_k_teile", header: "Abgegangener Lagerwert" },
          { key: "lgz_k_teile", header: "Zugegangener Lagerwert" },
          { key: "lgw_k_teile", header: "Aktueller Lagerwert" },
        ],
      },
      {
        title: "Lagerkalkulation (Eigen)",
        rows: [
          { key: "last_lgw_e", header: "Letzter Lagerwert" },
          { key: "lga_e_teile", header: "Abgegangener Lagerwert" },
          { key: "lgz_e_teile", header: "Zugegangener Lagerwert" },
          { key: "lgw_e_teile", header: "Aktueller Lagerwert" },
        ],
      },
      {
        title: "Lagerkalkulation (Produkt)",
        rows: [
          { key: "last_lgw_p", header: "Letzter Lagerwert" },
          { key: "lga_p_teile", header: "Abgegangener Lagerwert" },
          { key: "lgz_p_teile", header: "Zugegangener Lagerwert" },
          { key: "lgw_p_teile", header: "Aktueller Lagerwert" },
        ],
      },
      {
        title: "Lagerwert gesamt",
        rows: [
          { key: "lgw_fertig", header: "Materialwert in der Fertigung" },
          { key: "lgw_aktuell", header: "Aktueller Lagerwert" },
        ],
      },
    ],
  },
  gesamt: {
    kind: "gesamt",
    mode: "sections",
    sections: [
      {
        title: "Gesamtergebnis",
        rows: [{ key: "verkaufserloes", header: "Verkaufserlös" }],
      },
      {
        title: "Kennzahlen",
        rows: [
          { key: "verf_kapazitaet_pct", header: "Verfügbare Kapazität" },
          { key: "auslastung_pct", header: "Auslastung" },
          { key: "lieferfaehigkeit_pct", header: "Lieferfähigkeit" },
          { key: "mittl_herstellkosten", header: "Mittl. Herstellkosten" },
          { key: "mittlerer_lagerwert", header: "Mittlerer Lagerwert" },
        ],
      },
    ],
  },
};

/**
 * Spalten der "Verkaufsergebnisse"-Untertabelle des Gesamt-Viewers (je Produkt
 * 1-3 eine Zeile). v.verkaufsergebnisse ist ein Array von Records mit diesen
 * Feldern (kpi_auswertung.json, kind=gesamt).
 */
export const VERKAUFSERGEBNIS_COLUMNS: OsimColumn[] = [
  { key: "produkt", header: "Produkt" },
  { key: "vertriebswunsch", header: "Vertriebswunsch" },
  { key: "absatz", header: "Absatz" },
  { key: "herstellkosten", header: "Herstellkosten" },
  { key: "verkaufspreis", header: "Verkaufspreis" },
  { key: "erloes", header: "Erlös" },
];

/**
 * Ein Viewer-Tab der /live-Sicht. `source` ist der Stream-Tag, aus dem die
 * Frames gelesen werden; `kind` (nur bei kpi_auswertung) wählt die Auswertung.
 */
export interface ViewerTab {
  /** Stabile Tab-/Test-ID (eindeutig über alle Tabs). */
  id: string;
  /** Deutsches OSim-Label (User-facing Tab-Beschriftung). */
  label: string;
  /** Quell-Stream-Tag. */
  source: StreamTag;
  /** Auswertungs-kind (nur bei source === "kpi_auswertung"). */
  kind?: AuswertungKind;
}

/**
 * Geordnete Viewer-Registry der /live-Sicht — die EINZIGE Quelle für die
 * Tab-Liste + die Tab-Reihenfolge. Reihenfolge = OSim (Gfx-Viewer zuerst, dann
 * Schicht, dann die Auswertungen in ISimulatorViewerAuswertung-Reihenfolge).
 *
 * "Durchlaufplan" ist der PRIMÄRE Grafik-Viewer (FSimulatorViewerGfx-treu): von
 * ihm aus wird der Lauf gesteuert und live gerendert (Default-Tab).
 */
export const VIEWER_TABS: ViewerTab[] = [
  { id: "durchlaufplan", label: "Durchlaufplan", source: "gantt_durchlauf" },
  { id: "einsatzzeit", label: "Einsatzzeit", source: "gantt_einsatz" },
  { id: "schicht", label: "Schicht", source: "gantt_schicht" },
  { id: "ausw-gesamt", label: "Gesamt", source: "kpi_auswertung", kind: "gesamt" },
  {
    id: "ausw-prod_auftrag",
    label: "Produktionsaufträge",
    source: "kpi_auswertung",
    kind: "prod_auftrag",
  },
  {
    id: "ausw-best_auftrag",
    label: "Bestellaufträge",
    source: "kpi_auswertung",
    kind: "best_auftrag",
  },
  { id: "ausw-pers", label: "Personal", source: "kpi_auswertung", kind: "pers" },
  { id: "ausw-betr", label: "Betriebsmittel", source: "kpi_auswertung", kind: "betr" },
  {
    id: "ausw-lager",
    label: "Kauf-/Eigenlager",
    source: "kpi_auswertung",
    kind: "kauf",
  },
  {
    id: "ausw-kalkulation",
    label: "Kalkulation",
    source: "kpi_auswertung",
    kind: "kalkulation",
  },
  {
    id: "ausw-wschlange",
    label: "Warteschlange",
    source: "kpi_auswertung",
    kind: "wschlange",
  },
  {
    id: "ausw-nbearbeit",
    label: "Nicht bearbeitet",
    source: "kpi_auswertung",
    kind: "nbearbeit",
  },
];

/** Default-Tab beim Betreten von /live = der primäre Grafik-Viewer. */
export const DEFAULT_VIEWER_TAB_ID = "durchlaufplan";

/** Lookup eines Tabs über seine id. */
export function viewerTabById(id: string): ViewerTab | undefined {
  return VIEWER_TABS.find((t) => t.id === id);
}

// ---------------------------------------------------------------------------
// Menübaum der /live-Sicht (LIVE-LAYOUT-SPEC) — spiegelt das PSim-Menü:
//   Gruppe "Simulation" (Grafikfenster, 3 Modi) + Gruppe "Auswertung" (KPI).
// Die flache VIEWER_TABS-Registry oben bleibt Quelle für StreamRouter; der
// Menübaum ist die NEUE Navigation. Durchlaufplan-/Einsatzzeit-Gantt sind
// bewusst NICHT im Baum (Modellierung bzw. redundant zum Belegungs-Modus).
// ---------------------------------------------------------------------------

/** Grafikfenster-Modus (dupliziert aus Grafikfenster.tsx, um Zyklen zu vermeiden). */
export type GrafikModusKey = "belegung" | "warteschlangen" | "qualifikation";

/**
 * Spezifikation einer Kennzahl-Auswertung (3D-Balken, OChartCtrl-treu).
 * Bindet eine Berechnungsfunktion (kennzahlen.ts) an ein Bezugsobjekt
 * (Gruppierungs-Schlüssel) — KENNZAHLEN-SPEC §1.
 */
export interface KennzahlSpec {
  /** Stabile id (= Menü-Blatt-id). */
  id: string;
  /** Chart-Titel (= OSim-Kennzahl-Name). */
  title: string;
  /** Welche Berechnungsfunktion (kennzahlen.ts). */
  fn:
    | "mittlereDurchlaufzeit"
    | "anzahlAusloesungen"
    | "ressourcenAuslastungApprox";
  /** Gruppierungs-Feld im start-Frame (Auslöser vs. Durchlaufplan). */
  gruppeKey?: "auftrag_oid" | "durchlaufplan_oid";
  /** Feld für den Kategorie-Anzeigenamen (Default auftrag_id). */
  nameKey?: "auftrag_id" | "durchlaufplan_id";
}

/**
 * Ein Blatt im Menübaum.
 *  - kind "grafik"   → Grafikfenster mit `modus` (Simulationsgrafik).
 *  - kind "viewer"   → StreamRouter mit `tabId` (Auswertungs-Tabelle).
 *  - kind "kennzahl" → KennzahlChartPanel mit `kennzahl` (3D-Balken-Diagramm).
 */
export interface LiveMenuLeaf {
  /** Stabile, eindeutige Blatt-/Test-ID. */
  id: string;
  /** Anzeige-Label (deutsch, OSim). */
  label: string;
  kind: "grafik" | "viewer" | "kennzahl";
  /** Grafikfenster-Modus (nur kind "grafik"). */
  modus?: GrafikModusKey;
  /** VIEWER_TABS-id (nur kind "viewer"). */
  tabId?: string;
  /** Kennzahl-Spezifikation (nur kind "kennzahl"). */
  kennzahl?: KennzahlSpec;
}

/** Eine Gruppe (oberste Baum-Ebene). */
export interface LiveMenuGroup {
  id: string;
  label: string;
  children: LiveMenuLeaf[];
}

/**
 * Der Menübaum der /live-Sicht. Reihenfolge folgt dem PSim-Menü:
 * Simulation (Grafik) zuerst, dann Auswertung (in VIEWER_TABS-Reihenfolge,
 * Schicht als Tabelle am Ende der Auswertungen).
 */
export const LIVE_MENU: LiveMenuGroup[] = [
  {
    id: "simulation",
    label: "Simulation",
    children: [
      { id: "grafik-belegung", label: "Belegung", kind: "grafik", modus: "belegung" },
      {
        id: "grafik-warteschlangen",
        label: "Warteschlangen",
        kind: "grafik",
        modus: "warteschlangen",
      },
      {
        id: "grafik-qualifikation",
        label: "Qualifikation",
        kind: "grafik",
        modus: "qualifikation",
      },
    ],
  },
  {
    id: "kennzahlen",
    label: "Kennzahlen (Diagramme)",
    children: [
      {
        id: "kz-dlz-ausloeser",
        label: "Mittlere Durchlaufzeit · Auslöser",
        kind: "kennzahl",
        kennzahl: {
          id: "kz-dlz-ausloeser",
          title: "mittlere Durchlaufzeit (Auslöser)",
          fn: "mittlereDurchlaufzeit",
          gruppeKey: "auftrag_oid",
          nameKey: "auftrag_id",
        },
      },
      {
        id: "kz-dlz-dlpl",
        label: "Mittlere Durchlaufzeit · Durchlaufplan",
        kind: "kennzahl",
        kennzahl: {
          id: "kz-dlz-dlpl",
          title: "mittlere Durchlaufzeit (Durchlaufplan)",
          fn: "mittlereDurchlaufzeit",
          gruppeKey: "durchlaufplan_oid",
          nameKey: "durchlaufplan_id",
        },
      },
      {
        id: "kz-anz-ausloeser",
        label: "Anzahl Auslösungen · Auslöser",
        kind: "kennzahl",
        kennzahl: {
          id: "kz-anz-ausloeser",
          title: "Anzahl fertiggestellter Auslösungen",
          fn: "anzahlAusloesungen",
          gruppeKey: "auftrag_oid",
          nameKey: "auftrag_id",
        },
      },
      {
        id: "kz-auslastung",
        label: "Ressourcenauslastung (Näherung)",
        kind: "kennzahl",
        kennzahl: {
          id: "kz-auslastung",
          title: "Auslastung (Näherung: belegte Zeit / Periode)",
          fn: "ressourcenAuslastungApprox",
        },
      },
    ],
  },
  {
    id: "auswertung",
    label: "Auswertung (Tabellen)",
    children: [
      { id: "m-ausw-gesamt", label: "Gesamt", kind: "viewer", tabId: "ausw-gesamt" },
      {
        id: "m-ausw-prod_auftrag",
        label: "Produktionsaufträge",
        kind: "viewer",
        tabId: "ausw-prod_auftrag",
      },
      {
        id: "m-ausw-best_auftrag",
        label: "Bestellaufträge",
        kind: "viewer",
        tabId: "ausw-best_auftrag",
      },
      { id: "m-ausw-pers", label: "Personal", kind: "viewer", tabId: "ausw-pers" },
      { id: "m-ausw-betr", label: "Betriebsmittel", kind: "viewer", tabId: "ausw-betr" },
      { id: "m-ausw-lager", label: "Kauf-/Eigenlager", kind: "viewer", tabId: "ausw-lager" },
      {
        id: "m-ausw-kalkulation",
        label: "Kalkulation",
        kind: "viewer",
        tabId: "ausw-kalkulation",
      },
      {
        id: "m-ausw-wschlange",
        label: "Warteschlange",
        kind: "viewer",
        tabId: "ausw-wschlange",
      },
      {
        id: "m-ausw-nbearbeit",
        label: "Nicht bearbeitet",
        kind: "viewer",
        tabId: "ausw-nbearbeit",
      },
      { id: "m-schicht", label: "Schicht", kind: "viewer", tabId: "schicht" },
    ],
  },
];

/** Default-Auswahl beim Betreten von /live = Simulation → Belegung (NICHT Gantt). */
export const DEFAULT_MENU_LEAF_ID = "grafik-belegung";

/** Lookup eines Menü-Blatts über seine id (über alle Gruppen). */
export function liveMenuLeafById(id: string): LiveMenuLeaf | undefined {
  for (const g of LIVE_MENU) {
    const leaf = g.children.find((c) => c.id === id);
    if (leaf) return leaf;
  }
  return undefined;
}

/** Marker-Text für slice-gated Felder (NIE erfundene Zahlen). */
export const SLICE_OPEN_LABEL = "(Slice offen)";
