// Plan 01-05 Task 2: TYPE_MAP-Buchhaltung fuer Plan-05-Klassen.
//
// Erweitert das aus Plan 04 angelegte interne TYPE_MAP in OCtrl.types.ts
// um Klassen-spezifische Property-Whitelists + Default-Werte fuer
// addChild-Skeletons (Task 3).
//
// Spiegelt das Backend-TYPE_MAP aus app/services/json_tree_service.py 1:1
// fuer die Phase-1-Frontend-relevanten Klassen. Die Liste ist NICHT
// vollstaendig — sie deckt die Klassen ab, die Plan 05–08 brauchen.
//
// Synchronisation: Backend ist die Quelle der Wahrheit (es serialisiert
// nach diesem Schema). Wenn das Backend-TYPE_MAP geaendert wird, MUSS
// dieses File mitgepflegt werden. Plan 09 / Phase 2 koennte das per
// Engine-Reflection automatisieren — siehe risks-Block im PLAN.

import {
  registerTypeMetadata,
  type OCtrlMetadata,
} from "@/viewers/core/OCtrl.types";
import type { Klass, PropertyValue } from "@/viewers/core/types";

/**
 * Default-Werte fuer addChild-Skeleton (Task 3). Pro Klasse die
 * Properties + leere/0-Werte, damit der Backend-Roundtrip ein
 * vollstaendiges Objekt sieht.
 *
 * Ausserdem dient diese Map als kanonische Liste der "Hauptfelder" einer
 * Klasse — `PGObjBaseViewer` faellt drauf zurueck, wenn ein Objekt keine
 * properties[] aus dem Backend mitbringt.
 */
const DEFAULTS: Record<Klass, Record<string, PropertyValue>> = {};

export function registerDefaults(
  klass: Klass,
  defaults: Record<string, PropertyValue>,
): void {
  DEFAULTS[klass] = { ...(DEFAULTS[klass] ?? {}), ...defaults };
}

/**
 * Liefert die Default-Properties fuer eine neu anzulegende Klasse —
 * Task-3-addChild-Hilfsfunktion. Liefert leeres Objekt fuer unbekannte
 * Klassen (Server wird dann nur die mitgesendeten Felder akzeptieren).
 */
export function getDefaultProperties(
  klass: Klass,
): Record<string, PropertyValue> {
  return { ...(DEFAULTS[klass] ?? {}) };
}

/**
 * Erleichtert die kombinierte Registrierung von Metadata + Defaults.
 */
export function registerKlass(
  klass: Klass,
  metadata: Record<string, OCtrlMetadata>,
  defaults?: Record<string, PropertyValue>,
): void {
  registerTypeMetadata(klass, metadata);
  if (defaults) registerDefaults(klass, defaults);
}

// ---------------------------------------------------------------------------
// Registrierungen
//
// Die Reihenfolge der Properties ist die Display-Reihenfolge im Viewer
// (Object.keys() liefert die Insertion-Order zurueck).
// ---------------------------------------------------------------------------

// ASimulator: Top-Level-Modell. m_name (OSimulator-Basis) UND m_sName (PSimulator).
registerKlass(
  "ASimulator",
  {
    m_name: { type: "string", label: "Modell-Name (intern)" },
    m_sName: { type: "string", label: "Modell-Name" },
    m_keim: { type: "int", label: "Seed (LCG)" },
    m_aktKeim: { type: "int", label: "Aktueller Seed" },
    m_periodLen: { type: "int", label: "Perioden-Laenge (s)" },
    m_periodNum: { type: "int", label: "Anzahl Perioden" },
    m_periodBegin: { type: "int", label: "Perioden-Beginn" },
    m_iProduktionBezugsPeriode: {
      type: "int",
      label: "Produktions-Bezugsperiode",
    },
    m_iProduktionEnde: { type: "int", label: "Produktions-Ende" },
    m_bIsProduktionEnde: { type: "bool", label: "Produktions-Ende aktiv" },
    m_sStartDate: { type: "string", label: "Start-Datum" },
    m_sEndDate: { type: "string", label: "End-Datum" },
  },
  {
    m_sName: "",
    m_keim: 0,
    m_periodLen: 86400,
    m_periodNum: 30,
  },
);

// _group: synthetischer Folder-Node. Keine Edit-Properties.
registerKlass("_group", {}, {});

// Ausloeser
registerKlass(
  "PAslEinzel",
  {
    m_sName: { type: "string", label: "Name" },
    m_iBeginTermin: { type: "int", label: "Begin-Termin (s)" },
  },
  {
    m_sName: "Neuer Ausloeser",
    m_iBeginTermin: 0,
  },
);

registerKlass(
  "EPAslEntAufExtern",
  {
    m_sName: { type: "string", label: "Name" },
    m_iBeginTermin: { type: "int", label: "Begin-Termin (s)" },
    m_bTaeglichWiederholen: {
      type: "bool",
      label: "Taeglich wiederholen",
    },
    m_iSollDauer: { type: "int", label: "Soll-Dauer (s)" },
    m_iMaxWarteZeit: { type: "int", label: "Max. Wartezeit (s)" },
  },
  {
    m_sName: "Neuer Ext-Ausloeser",
    m_iBeginTermin: 0,
    m_bTaeglichWiederholen: false,
    m_iSollDauer: 0,
    m_iMaxWarteZeit: 0,
  },
);

registerKlass(
  "ACOAnt",
  {
    m_sName: { type: "string", label: "Name" },
    m_iBeginTermin: { type: "int", label: "Begin-Termin (s)" },
    m_iPlanZeit: { type: "int", label: "Plan-Zeit (s)" },
    m_iRealeAuftragsdauer: { type: "int", label: "Reale Auftragsdauer (s)" },
  },
  {
    m_sName: "Neuer Auftrag",
    m_iBeginTermin: 0,
    m_iPlanZeit: 0,
    m_iRealeAuftragsdauer: 0,
  },
);

// Durchlaufplan + Knoten/Kanten
registerKlass(
  "PDurchlaufplan",
  {
    m_sName: { type: "string", label: "Name" },
  },
  { m_sName: "Neuer Plan" },
);

// Knoten-Familie
registerKlass(
  "PDpKnKonstant",
  {
    m_sName: { type: "string", label: "Name" },
    m_iDurchfuehrungszeit: {
      type: "int",
      label: "Durchfuehrungszeit (s)",
    },
  },
  {
    m_sName: "Neuer Knoten",
    m_iDurchfuehrungszeit: 60,
  },
);

registerKlass(
  "PDpKnMenge",
  {
    m_sName: { type: "string", label: "Name" },
    m_iDfzProEinheit: { type: "int", label: "DFZ pro Einheit (s)" },
  },
  {
    m_sName: "Mengen-Knoten",
    m_iDfzProEinheit: 1,
  },
);

registerKlass(
  "PDpKnMengeRuesten",
  {
    m_sName: { type: "string", label: "Name" },
    m_iDfzProEinheit: { type: "int", label: "DFZ pro Einheit (s)" },
    m_iRuestzeit: { type: "int", label: "Ruestzeit (s)" },
  },
  {
    m_sName: "Mengen-Ruesten-Knoten",
    m_iDfzProEinheit: 1,
    m_iRuestzeit: 0,
  },
);

registerKlass(
  "PDpKnVerteilung",
  {
    m_sName: { type: "string", label: "Name" },
    m_iVerteilZeit: { type: "int", label: "Verteilungszeit (s)" },
  },
  {
    m_sName: "Verteilungs-Knoten",
    m_iVerteilZeit: 0,
  },
);

registerKlass(
  "PDpKnRueckKonstant",
  {
    m_sName: { type: "string", label: "Name" },
    m_iWiederholungenZiel: { type: "int", label: "Wiederholungen Ziel" },
  },
  {
    m_sName: "Rueckspr-Knoten",
    m_iWiederholungenZiel: 1,
  },
);

// Kanten
registerKlass(
  "PDlplKante",
  {
    m_sName: { type: "string", label: "Name" },
    m_iUebergangszeit: { type: "int", label: "Uebergangszeit (s)" },
  },
  { m_sName: "Neue Kante", m_iUebergangszeit: 0 },
);

registerKlass(
  "PDpKaUebergang",
  {
    m_sName: { type: "string", label: "Name" },
    m_iUebergangszeit: { type: "int", label: "Uebergangszeit (s)" },
  },
  { m_sName: "Uebergangs-Kante", m_iUebergangszeit: 0 },
);

// Verteilungen (haeufige)
registerKlass(
  "PVertKonstant",
  {
    m_sName: { type: "string", label: "Name" },
    m_fKonstante: { type: "float", label: "Konstante" },
  },
  { m_sName: "Konstant", m_fKonstante: 0 },
);

registerKlass(
  "PVertNormal",
  {
    m_sName: { type: "string", label: "Name" },
    m_fErwartungsw: { type: "float", label: "Erwartungswert" },
    m_fStandardabw: { type: "float", label: "Standardabweichung" },
  },
  { m_sName: "Normal", m_fErwartungsw: 0, m_fStandardabw: 1 },
);

// Ressourcen
registerKlass(
  "PBetriebsmittel",
  {
    m_sName: { type: "string", label: "Name" },
  },
  { m_sName: "Neue Maschine" },
);

registerKlass(
  "PPerson",
  {
    m_sName: { type: "string", label: "Name" },
  },
  { m_sName: "Neue Person" },
);

// Einsatzzeiten / Schichten
registerKlass(
  "PEinsatzzeitTag",
  {
    m_sName: { type: "string", label: "Name" },
    m_iBeginn: { type: "int", label: "Beginn (s)" },
    m_iEnde: { type: "int", label: "Ende (s)" },
    m_iPauseBeginn: { type: "int", label: "Pause Beginn (s)" },
    m_iPauseEnde: { type: "int", label: "Pause Ende (s)" },
    m_iPauseDauer: { type: "int", label: "Pausen-Dauer (s)" },
  },
  {
    m_sName: "Neuer Tag",
    m_iBeginn: 28800,
    m_iEnde: 61200,
    m_iPauseBeginn: 43200,
    m_iPauseEnde: 45000,
    m_iPauseDauer: 1800,
  },
);

// AGruppe — Personal-Gruppen (Backend-TYPE_MAP enthaelt AGruppe aktuell
// NICHT, weil der otx_loader Gruppen nicht direkt als Top-Level-Objekte
// liefert; das Pattern wird ueber EPAslEntAufExtern + PEinsatzzeit
// abgebildet. Wir registrieren AGruppe trotzdem als Foundation fuer den
// Viewer; die Properties stammen aus AGruppe.h (m_sName, m_sBeschreibung).
// Wenn echte AGruppe-Daten im Tree auftauchen, sind die Properties damit
// gerendert.)
registerKlass(
  "AGruppe",
  {
    m_sName: { type: "string", label: "Gruppen-Name" },
    m_sBeschreibung: { type: "string", label: "Beschreibung" },
  },
  { m_sName: "Neue Gruppe", m_sBeschreibung: "" },
);

// Re-export fuer Komponenten-Konsumenten.
export { registerTypeMetadata, getMetadataFor } from "@/viewers/core/OCtrl.types";
