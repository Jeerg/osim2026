/**
 * useModelStore — Zentraler Modell-State mit Undo/Redo (Plan 01-07 Task 3).
 *
 * Architektur:
 *  - Zustand als Store-Foundation (Plan-Vorlage: 3fls tree-builder-store).
 *  - Immer-Middleware für mutative Updates auf `wire.objects` (drafts werden
 *    in immutable Snapshots umgewandelt). Ohne Immer wäre der spread-/clone-
 *    Boilerplate für `wire.objects[oid].attrs[key] = ...` unzumutbar.
 *  - Zundo-Middleware für Undo/Redo. `partialize` schneidet `selection`,
 *    `dirty` und `modelId` aus der History weg — UI-State und Bookkeeping
 *    sollen nicht durch Undo zurückgespielt werden. Limit: 100 History-Steps.
 *
 * Entscheidung selection-Ownership (siehe Plan-Hinweis):
 *  - model-store.selection ist die KANONISCHE Quelle für "welches Object ist
 *    im Editor". UI-Logik liest sie via Selector-Hook.
 *  - viewer-store.viewerHint trägt nur die Variante (std vs. design). Das
 *    sind orthogonale Achsen.
 *
 * Pitfall (Plan-Hinweis): Undo darf selection NICHT mit-versetzen — sonst
 * springt der User in der Sidebar zurück, sobald er einen falsch eingegebenen
 * Property-Wert rückgängig macht. `partialize` löst das.
 */

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { temporal } from "zundo";

import type { ModelTreeWire } from "@/api/models";
import type { AttrValue, OBaseObj } from "@/viewers/core/types";

interface ModelState {
  wire: ModelTreeWire | null;
  modelId: string | null;
  selection: number | null;
  dirty: boolean;
}

interface ModelActions {
  /**
   * Setzt die aktive Modell-ID ohne Wire zu laden (live.tsx-Picker-Auswahl).
   * Ermöglicht modulübergreifende Persistenz der gewählten Modell-ID ohne
   * den Wire-Load-Pfad zu berühren (Vorauswahl auf /live, Plan 01-15 Fix).
   * Setzt selection + dirty NICHT zurück — nur modelId.
   */
  setActiveModelId: (modelId: string) => void;
  /**
   * Lädt einen frischen Wire-Tree. Setzt `dirty=false`. `selection` wird
   * atomar auf `initialSelection` gesetzt wenn definiert (Welle G13:
   * Reload-Persistenz via URL-Search-Params), sonst auf den Simulator-Root.
   * Caller (Workspace) muss zusätzlich `useModelStore.temporal.getState().
   * clear()` aufrufen, um Undo-History vom vorigen Modell zu verwerfen —
   * die Implementation lässt das bewusst dem Caller, weil der temporal-
   * Slice eine separate Identität hat und die load-Aktion selbst sonst
   * die History korrumpiert (Pitfall #6 RESEARCH).
   *
   * Welle G13: `initialSelection` muss ATOMAR in derselben set()-Aktion
   * gesetzt werden wie `wire` und `modelId`. Wenn man stattdessen erst
   * loadFromWire ruft und danach selectObject(initialSelection), entsteht
   * ein Zwischen-State mit `selection=simulator_oid` — den triggert
   * react-arborist beim ModelTree-Mount mit einem `onSelect(simulator_oid)`-
   * Callback, der via handleSelectionChange → syncUrlState die URL
   * überschreibt und den intendierten initial-Wert wegwirft.
   */
  loadFromWire: (
    modelId: string,
    wire: ModelTreeWire,
    initialSelection?: number | null,
  ) => void;
  selectObject: (oid: number | null) => void;
  /**
   * Patcht einzelne Attribute eines Objekts (merge-semantic). Setzt
   * `dirty=true`. Wenn die OID nicht existiert, ist patchObject ein no-op
   * (defensive — Race wenn das Object gerade gelöscht wurde).
   */
  patchObject: (oid: number, patch: Record<string, AttrValue>) => void;
  /**
   * Legt ein neues Objekt an. Vergibt eine OID als `max(existing) + 1` (siehe
   * RESEARCH §Example 4 Z.1162-1170). Returnt die vergebene OID.
   *
   * Wichtig: Setzt `dirty=true`. Der neue Objekt-Eintrag wird in das
   * `wire.objects`-Dict eingehängt; sub_refs des Parent-Objekts werden NICHT
   * automatisch aktualisiert — das ist die Verantwortung des aufrufenden
   * Viewers (z.B. OCtrlList.onCreate dispatches `sub_refs_update`).
   */
  createObject: (klass: string, attrs: Record<string, AttrValue>) => number;
  /**
   * Löscht ein Objekt. Bereinigt zusätzlich alle `sub_refs`-Listen der
   * übrigen Objekte (filter OID raus) — damit bleiben keine dangling
   * Referenzen zurück. Setzt `dirty=true`.
   */
  deleteObject: (oid: number) => void;
  /**
   * Hängt eine Child-OID an einen bestimmten `sub_refs`-Slot des Parents an.
   * Wenn der Slot noch nicht existiert (sub_refs.length <= slot), werden
   * Zwischen-Slots als leere Arrays aufgefüllt.
   *
   * Use-Case: Design-Viewer (Plan 10) fügt neue Knoten an
   * `plan.sub_refs[0]` und neue Kanten an `plan.sub_refs[1]` an.
   *
   * Idempotenz: Mehrfaches Anhängen derselben OID erzeugt Duplikate (kein
   * Set-Verhalten) — das ist absichtlich, weil OSim-LList-Slots in seltenen
   * Fällen Multi-Listings erlauben (z.B. zwei alternative Knoten-Pfade über
   * dasselbe Ressourcen-Set).
   */
  appendSubRef: (parentOid: number, slot: number, childOid: number) => void;
  /**
   * Entfernt eine Child-OID aus einem bestimmten `sub_refs`-Slot des
   * Parents (alle Vorkommen). No-op wenn Parent/Slot nicht existiert.
   *
   * Use-Case: Design-Viewer Delete-Operation muss neben deleteObject() auch
   * den Slot bereinigen (deleteObject macht das schon — `removeSubRef` ist
   * primär für gezieltes Aushängen ohne das Objekt selbst zu löschen).
   */
  removeSubRef: (parentOid: number, slot: number, childOid: number) => void;
  resetDirty: () => void;
  clear: () => void;
}

type ModelStore = ModelState & ModelActions;

const initialState: ModelState = {
  wire: null,
  modelId: null,
  selection: null,
  dirty: false,
};

// Schließe `set`/`get` aus `temporal(immer(...))` ein. Die TypeScript-
// Inferenz mit drei Middleware-Layern (temporal + immer + Zustand-Core) ist
// fragil; die Typ-Annotationen für `set` reichen aus, weil immer's draft-API
// nur intern verwendet wird.
/**
 * Welle G20-C: Mapping Klass → slot → m_l*-Attribut. Sync-Brücke zwischen
 * sub_refs (Engine-Save-Pfad) und m_l*-Listen (wire-to-grid / Anzeige).
 *
 * Wenn eine Klasse hier nicht gelistet ist, ist die Sync no-op — sub_refs
 * wird trotzdem geupdated. Erweitern wenn weitere Container-Klassen edited
 * werden müssen (ASimulator m_lAusl/m_lDlpl/etc., Knoten-Container etc.).
 */
function _slotToAttrName(klass: string, slot: number): string | null {
  if (klass === "PDurchlaufplan") {
    if (slot === 0) return "m_lKnoten";
    if (slot === 1) return "m_lKanten";
  }
  return null;
}

export const useModelStore = create<ModelStore>()(
  temporal(
    immer<ModelStore>((set) => {
      // createObject-Implementation braucht eine Closure-Variable für den
      // Return-Wert (set() returnt void, kann also keinen Wert weitergeben).
      // Pattern aus RESEARCH §Example 4 Z.1162-1170.
      const createObjectImpl = (
        klass: string,
        attrs: Record<string, AttrValue>,
      ): number => {
        let newOid = -1;
        set((state) => {
          if (!state.wire) {
            // Keine Wire geladen → no-op und sentinel-OID.
            newOid = -1;
            return;
          }
          const oids = Object.keys(state.wire.objects).map((k) => Number(k));
          newOid = (oids.length > 0 ? Math.max(...oids) : -1) + 1;
          const newObj: OBaseObj = {
            oid: newOid,
            klass,
            attrs: { ...attrs },
            sub_refs: [],
          };
          state.wire.objects[newOid] = newObj;
          state.dirty = true;
        });
        return newOid;
      };

      return {
        ...initialState,

        setActiveModelId: (modelId) =>
          set((state) => {
            state.modelId = modelId;
          }),

        loadFromWire: (modelId, wire, initialSelection) =>
          set((state) => {
            state.wire = wire;
            state.modelId = modelId;
            // Welle G13: atomic init. Wenn initialSelection eine gültige OID
            // im neuen Wire ist, sie nehmen; sonst Default = Simulator-Root.
            state.selection =
              initialSelection !== undefined &&
              initialSelection !== null &&
              wire.objects[initialSelection] !== undefined
                ? initialSelection
                : wire.simulator_oid;
            state.dirty = false;
          }),

        selectObject: (oid) =>
          set((state) => {
            state.selection = oid;
          }),

        patchObject: (oid, patch) =>
          set((state) => {
            if (!state.wire) return;
            const obj = state.wire.objects[oid];
            if (!obj) return;
            // Merge — vorhandene attrs bleiben, patch überschreibt.
            obj.attrs = { ...obj.attrs, ...patch };
            state.dirty = true;
          }),

        createObject: createObjectImpl,

        deleteObject: (oid) =>
          set((state) => {
            if (!state.wire) return;
            if (!(oid in state.wire.objects)) return;
            delete state.wire.objects[oid];
            // Welle G20-C: bereinige sub_refs UND alle m_l*-Listen-Attrs.
            // Beide sind nach Welle 9 (LList-Resolution) Quellen der Wahrheit:
            // sub_refs für Save-Pfad, m_l* für wire-to-grid + Anzeige. Wenn
            // hier nur sub_refs gefiltert wird, bleiben dangling OIDs in
            // m_lKnoten/m_lKanten → Re-Build des Grids crasht oder zeigt
            // leere Knoten-Slots.
            for (const otherOid of Object.keys(state.wire.objects)) {
              const other = state.wire.objects[Number(otherOid)];
              if (!other) continue;
              other.sub_refs = other.sub_refs.map((slot) =>
                slot.filter((refOid) => refOid !== oid),
              );
              // m_l*-Listen-Attrs: numerische Single-Refs werden zu null
              // gesetzt (war ONULL/0), Listen-Refs werden gefiltert.
              for (const [attrName, attrVal] of Object.entries(other.attrs)) {
                if (!attrName.startsWith("m_l")) continue;
                if (typeof attrVal === "number" && attrVal === oid) {
                  // Single-Ref-Pointer auf das gelöschte Objekt — null'n.
                  // ONULL wird vom Engine als int 0 serialisiert; im Wire
                  // markieren wir als null.
                  other.attrs[attrName] = null as never;
                } else if (Array.isArray(attrVal)) {
                  const filtered = attrVal.filter((v) => v !== oid);
                  if (filtered.length !== attrVal.length) {
                    other.attrs[attrName] = filtered as never;
                  }
                }
              }
            }
            // Wenn das gelöschte Objekt selektiert war, deselektieren.
            if (state.selection === oid) {
              state.selection = null;
            }
            state.dirty = true;
          }),

        appendSubRef: (parentOid, slot, childOid) =>
          set((state) => {
            if (!state.wire) return;
            const parent = state.wire.objects[parentOid];
            if (!parent) return;
            // Slot ggf. mit leeren Arrays auffüllen, bis er existiert.
            while (parent.sub_refs.length <= slot) {
              parent.sub_refs.push([]);
            }
            parent.sub_refs[slot].push(childOid);
            // Welle G20-C: gleichzeitig m_l*-Attr synchen.
            // PDurchlaufplan: slot 0 → m_lKnoten, slot 1 → m_lKanten.
            // Andere Klassen können andere Mappings haben — wir nutzen
            // eine generische Klass→slot→attrName-Map (erweiterbar wenn
            // weitere Container-Typen edited werden).
            const attrName = _slotToAttrName(parent.klass, slot);
            if (attrName) {
              const cur = parent.attrs[attrName];
              if (Array.isArray(cur)) {
                if (!cur.includes(childOid)) {
                  parent.attrs[attrName] = [...cur, childOid] as never;
                }
              } else {
                // Property existiert nicht oder ist Single-Ref — initialisieren.
                parent.attrs[attrName] = [childOid] as never;
              }
            }
            state.dirty = true;
          }),

        removeSubRef: (parentOid, slot, childOid) =>
          set((state) => {
            if (!state.wire) return;
            const parent = state.wire.objects[parentOid];
            if (!parent) return;
            const slotList = parent.sub_refs[slot];
            if (!slotList) return;
            parent.sub_refs[slot] = slotList.filter(
              (oid) => oid !== childOid,
            );
            // Welle G20-C: gleichzeitig m_l*-Attr synchen.
            const attrName = _slotToAttrName(parent.klass, slot);
            if (attrName) {
              const cur = parent.attrs[attrName];
              if (Array.isArray(cur)) {
                parent.attrs[attrName] = cur.filter(
                  (v) => v !== childOid,
                ) as never;
              }
            }
            state.dirty = true;
          }),

        resetDirty: () =>
          set((state) => {
            state.dirty = false;
          }),

        clear: () =>
          set((state) => {
            state.wire = null;
            state.modelId = null;
            state.selection = null;
            state.dirty = false;
          }),
      };
    }),
    {
      limit: 100,
      // partialize: nur `wire` geht in die History — selection (UI-State),
      // dirty (Bookkeeping) und modelId (Identity) bleiben außerhalb. Damit
      // ist Undo idempotent für UI-Position und löst Pitfall "Undo verschiebt
      // Sidebar-Selection".
      partialize: (state) => ({ wire: state.wire }),
      // equality: Wenn der wire-Snapshot unverändert ist (z.B. weil nur
      // selection geändert wurde — die ist aber durch partialize bereits
      // gefiltert), keinen neuen History-Eintrag schreiben. JSON.stringify
      // ist robust für Phase-1-Modellgrößen (~50 Knoten); für Phase 4 mit
      // Bosch2_wechseln-Wire (18 MB) wird das durch structural-equal-Compare
      // ersetzt — siehe T-07-03.
      equality: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    },
  ),
);
