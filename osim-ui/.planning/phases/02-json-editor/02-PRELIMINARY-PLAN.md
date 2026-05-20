# Phase 2 — JSON-Modell-Schema via Engine-Reflection + minimaler Form-Editor

**Milestone:** v0.1.0  
**Stand:** 2026-05-20 (Entwurf, vor Discussion-Phase)  
**Aufwand-Schätzung:** 2–3 Wochen (1 Dev), davon ~1 Woche enge Engine-Koordination

---

## 1. Ziel der Phase

User kann ein OSim-Modell **direkt im UI als JSON anlegen und editieren**, ohne `.otx`-Upload. Die JSON-Schema-Definition wird **automatisch aus der `osim-engine`-Codebase abgeleitet** (Reflection), sodass die Engine die Single Source of Truth bleibt und Schema-Drift unmöglich ist.

---

## 2. Architektur-Entscheidung (festgelegt 2026-05-20)

> **JSON-Schema wird per Engine-Reflection generiert**, nicht hand-geschrieben.

Vorteile:
- Engine bleibt Ground Truth — UI kann nicht schemaseitig "abweichen"
- Neue Knoten-Typen in der Engine erscheinen automatisch im UI nach Schema-Re-Generation
- Pydantic-Schemas mit korrekten Types, Required-Flags, Defaults out-of-the-box

Aufwand:
- Engine braucht eine **introspektierbare Klassen-Registry** oder ein **Generator-Modul** in `osim_engine`
- osim-ui-Backend ruft den Generator → produziert Pydantic-Schemas → exportiert OpenAPI/JSON-Schema fürs Frontend
- Schema-Refresh-Skript wird Teil von CI/dev-loop

---

## 3. Akzeptanzkriterien

1. ✅ `python -m osim_engine.schema dump > schema.json` erzeugt ein vollständiges JSON-Schema aller `PSimulator`/`PAusloeser`/`PDlplKnoten`/`PDpKa*`/`PRess*`-Klassen mit Pflicht-/Optional-Feldern.
2. ✅ osim-ui-Backend hat einen Endpoint `GET /api/v1/schema/model` der das aktuelle Schema ausliefert.
3. ✅ Frontend rendert auf Basis des Schemas einen **automatischen Form-Editor** (z. B. via `react-jsonschema-form` oder `@rjsf/core` oder eigener Generator mit shadcn).
4. ✅ User kann ein Minimal-Modell mit 1 Auslöser + 2 Knoten + 1 Kante im Browser anlegen.
5. ✅ User kann das angelegte Modell speichern → wird als `model.json` in GCS abgelegt, Postgres-Row entsteht.
6. ✅ Das gespeicherte Modell kann mit dem Phase-1-Sim-Submit-Flow **erfolgreich simuliert** werden (Vollständigkeit der Reflection).
7. ✅ OTX-Modelle aus Phase 1 lassen sich via `convert_otx_to_json` in das neue JSON-Format überführen — und ergeben den gleichen Sim-Output (Bit-Reproduzierbarkeitstest).
8. ✅ Schema-Validierung beim Speichern lehnt invalide Modelle mit klarer Fehlermeldung ab.
9. ✅ Beim ersten Speichern eines Modells ohne explizite ID wird eine UUID vergeben.

---

## 4. Engine-Koordinations-Punkte (BLOCKERS)

Phase 2 ist **nicht** ohne Engine-Erweiterung möglich. Folgende Arbeiten müssen im `osim-engine`-Repo passieren:

| Engine-Task | Beschreibung |
|---|---|
| E2.1 Class-Registry | Modul `osim_engine.schema.registry` mit Liste aller Public-Loader-Klassen (PSimulator + alle Auslöser/Knoten/Kanten/Ressourcen) |
| E2.2 Field-Introspection | Jede Klasse exponiert via `__sim_fields__` Dict-Spec ihrer Public-Attribute (Typ, Default, Beschreibung). Alternative: Pydantic-Mirror-Modelle direkt in der Engine |
| E2.3 Schema-Generator | `python -m osim_engine.schema dump` CLI, schreibt JSON-Schema (Draft 2020-12) auf stdout |
| E2.4 JSON-Loader | `osim_engine.io.json_loader.load_model_from_json(dict) -> PSimulator` — schließt das Skelett aus heute |
| E2.5 JSON-Dumper | `osim_engine.io.json_loader.dump_simulator_to_json(sim) -> dict` (für OTX→JSON-Konvertierung) |
| E2.6 Round-Trip-Test | Pytest in osim-engine: `parse_otx → dump_json → load_json → run` == `parse_otx → run` bit-genau |

Diese Tasks sind **Voraussetzung** für osim-ui Phase 2. Empfehlung: vor Start von Phase 2 ein Engine-Sprint einlegen, der E2.1–E2.6 fertigstellt.

---

## 5. Task-Wellen (osim-ui-seitig)

### Welle 1 — Schema-Pipeline (3 Tage)
| ID | Task | Deps |
|---|---|---|
| 1.1 | Engine-Schema-Generator in CI integrieren: `uv run python -m osim_engine.schema dump > app/static/model-schema.json` | E2.3 |
| 1.2 | Endpoint `GET /api/v1/schema/model` liefert das Schema | 1.1 |
| 1.3 | Endpoint `GET /api/v1/schema/version` liefert Engine-Version + Schema-Hash | 1.1 |
| 1.4 | Tests: Schema enthält alle erwarteten Top-Level-Klassen | 1.1 |

### Welle 2 — Backend-Modell-CRUD (3 Tage)
| ID | Task | Deps |
|---|---|---|
| 2.1 | `app/services/model_service.py`: `create_from_json(payload)` mit Pydantic-Validation gegen aktuelles Schema | 1.2 |
| 2.2 | `app/services/model_service.py`: `update_json(id, payload)` mit Versionsstempel | 2.1 |
| 2.3 | `POST /api/v1/models` (JSON-Body) | 2.1 |
| 2.4 | `PUT /api/v1/models/{id}` | 2.2 |
| 2.5 | `DELETE /api/v1/models/{id}` (Soft-Delete + Audit-Log) | 2.1 |
| 2.6 | `POST /api/v1/models/convert-otx` (akzeptiert OTX, liefert JSON) | E2.4, E2.5 |

### Welle 3 — Frontend-Form-Editor (5 Tage)
| ID | Task | Deps |
|---|---|---|
| 3.1 | Lib-Wahl: `@rjsf/core` mit shadcn-Theme ODER eigener Generator | — |
| 3.2 | Schema-Loader-Hook `useModelSchema()` (TanStack-Query, cached) | 1.2 |
| 3.3 | Generic Form-Component `<ModelForm schema={…} value={…} onChange={…} />` | 3.1, 3.2 |
| 3.4 | Custom-Widgets für: Verteilungen (Mittelwert+Varianz-Combo), GObjType-Picker (Dropdown mit Symbol), Knoten-/Auslöser-Referenz (Combo aus Modell selbst) | 3.3 |
| 3.5 | Modell-Editor-Page `/models/new` und `/models/{id}/edit` | 3.3 |
| 3.6 | Validation-Feedback inline (Pydantic-Fehler → Field-Errors) | 3.5 |
| 3.7 | Save-As-Copy + Versionierung-Banner | 3.5 |

### Welle 4 — OTX→JSON-Migration (2 Tage)
| ID | Task | Deps |
|---|---|---|
| 4.1 | UI-Button "Als JSON konvertieren" auf OTX-Modellen aus Phase 1 | 2.6 |
| 4.2 | Round-Trip-Sanity-Check: nach Konvertierung Sim laufen lassen, vergleichen mit Original-Trace | 4.1 |
| 4.3 | Liste der nicht-konvertierbaren Klassen wird dem User angezeigt | 2.6 |

### Welle 5 — Verifikation (2 Tage)
| ID | Task | Deps |
|---|---|---|
| 5.1 | Playwright-E2E: User legt Modell an → speichert → simuliert → Trace passt | alle |
| 5.2 | Pytest: Schema-Validation rejects invalid models | 2.1 |
| 5.3 | Manueller Test mit `Dummy.otx` → Konvertiert in JSON → editiert → simuliert | 4.1 |
| 5.4 | Doku in `docs/PHASE-2-JSON-EDITOR.md` | alle |

---

## 6. Risiken & Unknowns

| Risiko | Mitigation |
|---|---|
| Engine-Class-Registry-Aufwand größer als gedacht (existierende Klassen sind nicht alle Pydantic-fähig) | Engine-Team früh involvieren; Iteration: erst PSimulator + 5 wichtigste Knoten, dann Rest |
| Reflection findet private/interne Attribute, die im JSON nichts verloren haben | Whitelist via Marker (Property-Decorator oder `__sim_fields__` explizit) |
| OTX → JSON konvertierte Modelle erzeugen nicht-bit-genau identischen Trace | Engine-Round-Trip-Test (E2.6) ist Gating-Criterion — wenn er fehlschlägt, ist die Konvertierung defekt |
| `@rjsf/core` zu generisch fürs OSim-Domänenmodell (zu hässlich, zu generisch) | Custom-Widgets für die wichtigsten Felder; im Extremfall eigener Generator mit shadcn-Komponenten |
| Schema-Versionierung bei Engine-Updates | Schema-Hash in `runs.config_schema_version` speichern; bei Mismatch Warning beim Edit |
| Migration alter Modelle bei Schema-Bruch | Pydantic-Migration-Hooks oder generische Schema-Diff-Anzeige |

---

## 7. Was Phase 2 NICHT liefert

- Visueller Drag-and-Drop-Editor (→ Phase 7+ oder später)
- Modell-Templates ("Wizard für neues Fertigungssystem") — könnte Phase 5 sein
- Modell-Versionierung mit Branch/Merge — Backlog
- Schema-Migration alter Modelle bei Engine-Updates — Backlog (vorerst nur Warning)
- Inline-Vorschau des entstehenden Modell-Graphen (das macht Phase 3)

---

## 8. Definition-of-Done

1. Alle 9 Akzeptanzkriterien grün
2. Round-Trip-Test (OTX → JSON → Sim) bit-genau gleich wie OTX → Sim (Akzeptanzkriterium 7)
3. Playwright-E2E grün
4. `docs/PHASE-2-JSON-EDITOR.md` + dokumentierter Schema-Refresh-Workflow in `docs/ENGINE-SYNC.md`

---

## 9. Diskuss-Punkte für `/gsd-discuss-phase`

1. **`@rjsf/core` vs. eigener Form-Generator?** rjsf ist schnell, eigene ist hübscher und genauer kontrollierbar. Empfehlung: Start mit rjsf + shadcn-Theme, Migration zu eigenem Generator wenn UX nicht reicht.
2. **Schema-Refresh-Frequenz:** automatisch bei Engine-Update, oder Manual? Vorschlag: in CI bei jedem Engine-Release.
3. **Custom-Widget-Set:** welche Felder verdienen eine eigene Komponente? (Verteilungen, GObjType-Picker, Knoten-Referenz sind sicher; Datums-Picker, Color-Picker?)
4. **Soft-Delete oder Hard-Delete bei Modell-Löschen?** Akademisch/beratungskonform: Soft-Delete mit "wirklich löschen" als Admin-Aktion.
5. **Modell-Vorlagen aus `OSim2004/Vorstellung04/` vorgenerieren** als Startpunkte? Wenn ja, Konvertierung nach JSON in CI.
