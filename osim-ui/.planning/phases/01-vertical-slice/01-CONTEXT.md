# Phase 1: Vertical Slice — Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

> **Reframing während Discuss:** Die ursprüngliche Phase 1 ("Login → OTX-Upload → Sim-Lauf → Status → Trace-Download") wurde vom User explizit umgewidmet. Phase 1 ist jetzt **"Viewer-Framework + OTX-im-Browser-Modellierung"** — KEIN Sim-Lauf, KEINE Live-Visualisierung, KEINE Trace-Verarbeitung. Diese rücken in spätere Phasen. Der bisherige `01-PRELIMINARY-PLAN.md` ist NICHT mehr maßgeblich.

<domain>
## Phase Boundary

**Phase 1 liefert:**

Ein vollwertiges, beratungs-taugliches **Web-Modellierungs-Werkzeug für OSim-Modelle** im Browser, basierend auf dem `.otx`-Format als Speicher- und Austausch-Format. User können sich anmelden (Firebase Auth, Tenant-isoliert), ein OTX-Modell hochladen, im Browser über das Viewer-Framework (TypeScript-Port des C++-`OViewer`-Patterns) bearbeiten und periodisch zurück in OTX speichern.

**Konkret Phase 1 enthält:**
1. **Volle FastAPI-Backend-Foundation** (versionierte APIs, Service-Layer, SQLAlchemy, Alembic, Firebase-Auth-Middleware, structlog, RFC 7807, Health/Readiness, OpenAPI-Docs, Test-Infra). Auch wenn nicht alle Endpoints in Phase 1 produktiv sind — die Struktur und Konventionen sind angelegt.
2. **Server-seitiger OTX-Parser-Endpoint** (nutzt `osim_engine.io.otx_loader.load_otx_file()`), JSON-Tree-Serialization → Browser, JSON-Tree-Deserialization ← Browser, **OTX-Writer in Engine als Welle 0** (neu zu implementieren — Engine hat heute keinen).
3. **Multi-Tenant-Infrastruktur ab Tag 1:** Firebase Auth, Schema-per-Tenant in Postgres, Tenant-Bootstrap lazy beim ersten `/auth/me`.
4. **Browser ist Thick-Client:** Modell wird in In-Memory-State (Zustand) gehalten + IndexedDB-Snapshot bei jeder Änderung für Crash-Recovery.
5. **TypeScript-`OViewer`-Foundation** (Hybrid-Pattern: ViewerFrame/ClientCtrl als TS-Klassen, ChildDialog/ChildCtrl als React-Components) inklusive vollständiger 9-er OCtrl-Familie (Variable, Bool, Enum, Link, List, Method, TabViewer, COLORREF, LOGFONT).
6. **12 konkrete Viewer** über alle drei OSim-Perspektiven (Prozess / Ressource / Arbeitszeit).
7. **Sidebar-Tree-Navigation** mit Workspace-Hierarchie (Modell → Durchlaufpläne → Knoten → Ressourcen → Schichten).
8. **Volle Bearbeitung:** Properties editieren, Anlegen, Löschen, Verknüpfen.
9. **Save-Strategie:** Auto-Save alle 30 s + manueller "Speichern"-Button + IndexedDB-Snapshot pro Änderung; **Single-Editor-Lock** auf Modell-Ebene.

**Out of Scope (NICHT in Phase 1):**
- Simulations-Läufe (`PSimulator.start()`-Aufrufe aus Worker)
- Status-Polling / Live-Visualisierung des Sim-Laufs
- Trace-Download / Trace-Browser
- Reports / PDF-Export
- 3fls-Integration
- DAG-Pläne / Visueller Drag-and-Drop-Editor von Grund auf
- Cloud-Deployment (lokales `docker compose up` reicht)

</domain>

<decisions>
## Implementation Decisions

### Bereich 1 — OTX-Handling
- **D-01:** Server parst OTX serverseitig (nutzt `osim_engine.io.otx_loader.load_otx_file()`); liefert JSON-Tree an den Browser; akzeptiert JSON-Tree-Updates zurück und serialisiert sie wieder zu OTX.
- **D-02:** Die Engine bekommt einen **OTX-Writer** (`dump_simulator_to_otx(sim) -> str`) als Welle 0 dieser Phase. Heute existiert nur der Reader. Ohne diesen Writer ist Save-back als OTX nicht möglich — der Planner MUSS diese Engine-Erweiterung als allererste Wave einplanen.
- **D-03:** OTX-Original der Upload-Datei wird im Object Storage abgelegt (GCS / lokal Minio). Jeder Save-back wird als neue Version abgelegt (Versionierung via Timestamp im Pfad).
- **D-04:** Browser hält das gesamte Modell als In-Memory-State (Zustand-Store) während der Bearbeitung. Server kennt nur Persistenz-Stände.

### Bereich A — Viewer-Framework-Architektur
- **D-05:** Hybrid-Pattern für die TypeScript-Portierung des C++-`OViewer`-Systems:
  - `ViewerFrame`, `ClientCtrl` als TypeScript-Klassen (halten State, dispatchen Commands, wählen passenden ChildDialog je nach Objekt-Typ)
  - `ChildDialog`, `ChildCtrl` als React-Components mit props-basierter Datenbindung
  - Foundation lebt in `portal/src/viewers/core/`
- **D-06:** Vollständige 9-er `OCtrl`-Familie wird in Phase 1 implementiert:
  - `OCtrlVariable` (Text/Zahl-Input)
  - `OCtrlBool` (Checkbox)
  - `OCtrlEnum` (Dropdown)
  - `OCtrlLink` (Objekt-Referenz mit Suchfeld/Combobox)
  - `OCtrlList` (Tabelle von Sub-Objekten)
  - `OCtrlMethod` (Button für Method-Call)
  - `OCtrlTabViewer` (Tab-Container)
  - `OCtrlCOLORREF` (Color-Picker)
  - `OCtrlLOGFONT` (Font-Picker)
- **D-07:** **Querschnitts-Foundation:** Die Viewer-Schicht ist NICHT phase-1-spezifisch, sondern Foundation für ALLE späteren graphischen Viewer (siehe [[graphobject-is-viewer-foundation]] in Memory). Phase 3+ erweitert mit GraphObject-spezifischen Subklassen (`PDlplViewerGObj` etc.), Phase 5+ mit Chart-/Report-Subklassen, Phase 7+ mit Matrix-/Gantt-Subklassen.

### Bereich B — Konkrete Viewer in Phase 1
- **D-08:** 12 konkrete Viewer-Klassen werden in Phase 1 implementiert (Vollständig-Modellierung über alle drei Perspektiven):
  1. `PSimulatorViewer` — Top-Level-Modellübersicht
  2. `PDurchlaufplanViewer-Standard` — List + Property
  3. `PDurchlaufplanViewer-Design` — graphisch (GraphObject + React Flow), erster Konsument der GraphObject-Schicht
  4. `PGObjBaseViewer` — generischer Property-Editor für jedes Objekt-Typ (Fallback)
  5. `PRessBelegMatrixViewer` — Belegungsressourcen-Matrix
  6. `PRessMengeMatrixViewer` — Mengenressourcen-Matrix
  7. `PRessVerknuepfungViewer` — Ressourcen-Verknüpfung
  8. `PDlplBetriebsmittelViewer` — Knoten ↔ Betriebsmittel-Verknüpfung
  9. `PDlplPersonalViewer` — Knoten ↔ Personal-Verknüpfung
  10. `AEinsatzWunschViewer` — Schicht-Editor
  11. `AKapBedViewer` — Kapazitätsbedarf-Sicht
  12. `AGruppeViewer` — Personal-Gruppen
- **D-09:** **Sidebar-Tree-Navigation** mit Workspace-Hierarchie: Modell → Durchlaufpläne → Knoten → Ressourcen → Schichten. Klick auf Tree-Node öffnet den passenden Viewer im rechten Hauptbereich.
- **D-10:** **Vollständige Edit-Operationen** in Phase 1: Properties editieren, neue Objekte anlegen, löschen, Verknüpfungen neu zeichnen. Phase 1 ist ein vollwertiges Modellierungs-Werkzeug. Erfordert robuste Undo-/Save-Mechanik (Planner muss Undo-Stack-Architektur miteinplanen).

### Bereich C — Save-Strategie & Crash-Recovery
- **D-11:** **Auto-Save alle 30 s** zum Server + **manueller "Speichern"-Button** mit Dirty-Indicator in UI.
- **D-12:** **IndexedDB-Snapshot** wird nach jeder einzelnen Property-Änderung im Browser angelegt. Beim Reload des Tabs wird der letzte IndexedDB-Stand wiederhergestellt und mit dem Server-Stand abgeglichen.
- **D-13:** **Single-Editor-Lock auf Modell-Ebene.** Wer ein Modell öffnet, bekommt Edit-Lock. Andere User/Sessions sehen "Modell wird gerade von [User] bearbeitet" — Read-Only-Ansicht möglich. Lock läuft nach 15 min Inaktivität ab oder bei explizitem Beenden.
- **D-14:** Save-back-Endpoint speichert immer eine neue Version (kein In-Place-Overwrite). Original-Upload bleibt unverändert.

### Bereich D — Auth & Multi-Tenancy
- **D-15:** **Firebase Auth ab Tag 1.** Login/Sign-up via Firebase-Emulator lokal, Firebase-Project in späteren Phasen.
- **D-16:** **Schema-per-Tenant in Postgres ab Tag 1.** TenantAuthMiddleware aus 3fls-Pattern 1:1 übernehmen — setzt `search_path` pro Request.
- **D-17:** **Lazy Tenant-Bootstrap:** Beim ersten `/api/v1/auth/me`-Call eines neuen Firebase-Users wird automatisch `tenant_{user_uid}` angelegt + User als Owner. Idempotent. Kein Admin-Eingriff nötig (Self-Service).

### Bereich E — Backend-Foundation (User-Ergänzung)
- **D-18:** **Volle FastAPI-Foundation in Phase 1**, auch wenn nicht alle Endpoints produktiv genutzt werden:
  - Versionierte APIs unter `/api/v1/`
  - Service-Layer (`app/services/`) klar getrennt von API-Routern
  - SQLAlchemy 2 async + asyncpg
  - Alembic-Migrations mit initialer Migration (`001_initial_schema.py`)
  - Firebase-Auth-Middleware (`TenantAuthMiddleware`, 1:1 aus 3fls)
  - structlog für strukturiertes Logging
  - pydantic-settings für Config (`app/core/config.py`)
  - RFC 7807 ProblemDetail-Responses für alle Errors
  - Health-Endpoint (`/health`) + Readiness-Endpoint (`/readiness`)
  - Test-Infrastruktur mit pytest + httpx-AsyncClient
  - OpenAPI-Docs (auto, `/docs`)

### Claude's Discretion
- Konkrete UI-Komponenten-Bibliothek-Wahl (shadcn vs. eigene Components) — folge 3fls-Pattern (shadcn) sofern keine Konflikte mit Viewer-Framework
- Undo/Redo-Mechanismus-Architektur (Command-Pattern, Event-Sourcing, snapshot-basiert)
- DB-Schema-Detail (Spalten-Reihenfolge, Index-Strategien) — folge 3fls-Konventionen
- Sidebar-Tree-Komponente (Lib-Wahl: `react-arborist`, `@tanstack/react-virtual` für virtualisierte Listen)
- Konkrete IndexedDB-Lib (`idb` vs. `dexie`)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Original C++ Code (Domain-Vorlage)
- `C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\OViewer.h` — **Pflichtlektüre.** Das ~78 KB Header definiert das OViewer-Pattern, das Phase 1 portiert. Routing-System, Frame/ClientCtrl/ChildDialog/ChildCtrl-Hierarchie, OCtrl-Familie.
- `C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\GraphObj.h` — GraphObject-Konzept-Vorlage (wird ab Phase 3 voll geportet; Phase 1 nutzt für `PDurchlaufplanViewer-Design` schon einen ersten Auszug).
- `C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\OCtrlBool.h`, `OCtrlEnum.h`, `OCtrlLink.h`, `OCtrlList.h`, `OCtrlVariable.h`, `OCtrlMethod.h`, `OCtrlTabViewer.h`, `OCtrlCOLORREF.h`, `OCtrlLOGFONT.h` — OCtrl-Familie, die in Phase 1 portiert wird.
- `C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\PDurchlaufplanViewer.h`, `PDlplViewerStd.h`, `PDlplViewerGObj.h`, `PGObjBaseViewer.h`, `PRessBelegMatrixViewer.h`, `PRessMengeMatrixViewer.h`, `PRessVerknuepfungViewer.h`, `PDlplBetriebsmittelViewer.h`, `PDlplPersonalViewer.h`, `AEinsatzWunschViewer.h`, `AKapBedViewer.h`, `AGruppeViewer.h`, `PSimulatorViewer.h` — die 12 Viewer-Klassen, die in Phase 1 portiert werden.

### Engine-Schnittstelle
- `.planning/research/osim-engine-api.md` — verifizierte API-Referenz der osim-engine. `load_otx_file()`, `LoadResult`, `PSimulator`, EventBus.
- `C:\Users\JörgWFischer\PycharmProjects\osim-engine\src\osim_engine\io\otx_loader.py` — der OTX-Reader, den der Server nutzt.
- `C:\Users\JörgWFischer\PycharmProjects\osim-engine\src\osim_engine\io\otx_reader.py` — der zugrundeliegende Parser.
- **NEU zu erstellen:** `osim_engine.io.otx_writer.dump_simulator_to_otx(sim) -> str` — Engine-Vorarbeit für Save-back, als Welle 0 dieser Phase.

### 3fls-Patterns (Stack-Vorlage)
- `.planning/research/3fls-patterns.md` — Cookbook für Frontend- und Backend-Patterns.
- `.planning/research/copy-paste-guide.md` — konkrete Files aus `tbx_stzrim`, die 1:1 übernommen werden (Auth, API-Client, Config, DB).
- `C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\auth\middleware.py` — TenantAuthMiddleware-Quelle.
- `C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\core\database.py` — Postgres-Engine-Pattern mit search_path.
- `C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\portal\src\auth\` — Firebase-Auth-Client.

### Projekt-Architektur
- `.planning/PROJECT.md` — Vision, sechs Architektur-Eckpfeiler.
- `docs/ARCHITECTURE.md` — System-Architektur (vor Reframe geschrieben — MUSS nach Phase-1-Plan überarbeitet werden).
- `.planning/ROADMAP.md` — Phase-Übersicht (Phase 1 hier nochmal aufzuräumen: alte Success Criteria sind veraltet, neue müssen aus diesem CONTEXT.md übernommen werden).

### Memory (für AI-Agents)
- `project-identity` — drei Codebasen + Trägerinstitutionen
- `arch-decisions-2026-05-20` — sechs Phase-1-Leitplanken
- `osim-domain-glossary` — PPS-Begriffe und Reproduzierbarkeitsvertrag
- `feedback-author-attribution` — J.W. Fischer als Autor des Originals
- `graphobject-is-viewer-foundation` — Viewer-Schicht ist Querschnitts-Foundation
- `feedback-target-audience-framing` — osim-ui ist Industrie-/Beratungs-Werkzeug, NICHT Lehrwerkzeug

### Beispiel-Modelle für Tests (aus OSim2004)
- `C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\Vorstellung04\Dummy.otx` (228 KB) — kleinstes funktionsfähiges Modell
- `Fertigungsstruktur1_mit_AslFj.otx` (272 KB) — mittelgroßes Modell
- `Bosch2_wechseln.otx` (18 MB) — großes Real-World-Modell für Performance-Tests

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`osim_engine.io.otx_loader.load_otx_file(path)`** — funktioniert für 252-Objekt-Files; nutzt Latin-1-Encoding. Liefert `LoadResult` mit `.simulator`, `.loaded`, `.unsupported`, `.coverage_ratio`.
- **`osim_engine.observability.bus.EventBus`** — existiert, aber in Phase 1 noch ungenutzt (kein Sim-Lauf). Wird in Phase 2+ relevant.
- **3fls `TenantAuthMiddleware`** und **`firebase.py`** — 1:1 übernehmen (siehe copy-paste-guide.md).
- **3fls `app/core/database.py`** — Postgres-Engine mit search_path-Switching, 1:1 übernehmen.
- **Skeleton in `osim-ui/`** ist anlegungsbereit (pyproject.toml, app/main.py mit Health-Endpoint, portal/ mit Vite+React-Skelett, Dockerfile, docker-compose.yml).

### Established Patterns
- **Versionierte API:** alle Endpoints unter `/api/v1/*` (3fls-Konvention).
- **Schema-per-Tenant:** Postgres `search_path` wird per Request gesetzt (`SET search_path TO "{tenant_id}", public`).
- **Firebase Custom Claims:** `tenant_id`, `role` werden im JWT mitgeführt (keine DB-Lookups im Hot-Path).
- **TypeScript path-Alias `@/*`** für `portal/src/*`.

### Integration Points
- **Engine ⇄ Backend:** `osim_engine` wird als editable-install (`uv pip install -e ../osim-engine`) ins Backend gezogen. NEUER OTX-Writer wird in der Engine selbst angelegt, NICHT in osim-ui.
- **Backend ⇄ Frontend:** REST über `/api/v1/*` + multipart-Upload für OTX. WebSocket NICHT in Phase 1.
- **Backend ⇄ DB:** SQLAlchemy 2 async + asyncpg, Sessions mit search_path.
- **Backend ⇄ Storage:** Storage-Abstraktion (`app/services/storage.py`) maskiert Local-Filesystem (Dev) vs. GCS (Prod). Phase 1 nutzt lokales Filesystem oder Minio.

</code_context>

<specifics>
## Specific Ideas

- **OViewer-Pattern ist Pflichtlektüre** vor Implementierung — der Planner und Executor müssen `OViewer.h` lesen (auch wenn 78 KB), weil Routing, Selection und Auto-Update-Mechanik in C++ ausführlich beschrieben sind.
- **Vorstellung04-Beispielmodelle** sind die kanonischen Test-Fixtures. Dummy.otx als Smoke-Test, Fertigungsstruktur1 als Realismus-Test, Bosch2_wechseln als Stress-Test.
- **GraphObject in Phase 1** wird bewusst NUR für `PDurchlaufplanViewer-Design` benutzt (1 Viewer). Die vollständige GraphObject-Schicht aller 18 GObjType-Klassen kommt in einer späteren Phase. In Phase 1 reichen die Basis-Klassen `GObject`, `GObjLink`, `GLink` und ein paar konkrete Knoten-Renderer.
- **Engine-OTX-Writer (Welle 0):** Dies ist eine konkrete Engine-Arbeit, die VOR jeglichem Frontend-Code starten muss. Planner sollte sie als separaten ersten Plan-Block einplanen, ggf. als parallel-startende Engine-Sub-Phase.

</specifics>

<deferred>
## Deferred Ideas

Aus der Discuss-Session in spätere Phasen verschoben:

- **Simulation-Läufe** (`PSimulator.start()` aus Worker, Status-Polling) → Phase 2 (alte Phase 1 wird nicht mehr aktiv, Sim-Lauf wandert in neue Phase 2 oder 3)
- **Live-Visualisierung mit WebSocket** → Phase 3+
- **Trace-Download / Trace-Browser** → Phase 2 (mit Sim-Lauf)
- **Reports / PDF-Export** → Phase 5 (unverändert)
- **3fls-Integration via Iframe** → Phase 6 (unverändert)
- **Cloud-Deployment + Multi-Run-Aggregation** → Phase 4 (unverändert)
- **Auto-Generation aller ~30 Viewer per Reflection** (aus Bereich-B-Option-C) → Phase 7+ Backlog
- **Pixel-genauer Original-Look (Skeuomorph)** → bewusst NICHT (PROJECT.md-Festlegung "UI darf modern sein").

Hinweis: Da Phase 1 vollständig umkonzipiert wurde, MÜSSEN ROADMAP.md, ARCHITECTURE.md und die PRELIMINARY-PLAN-Dateien der Phasen 2–6 in einem Folge-Schritt aktualisiert werden. Diese Aktualisierung gehört NICHT in die Phase-1-Plan-Phase, sondern davor (oder als eigene Mini-Phase "Roadmap-Resync"). Der Plan-Phase-Agent soll auf diesen Bedarf hinweisen.

</deferred>

---

*Phase: 01-vertical-slice*
*Context gathered: 2026-05-21*
