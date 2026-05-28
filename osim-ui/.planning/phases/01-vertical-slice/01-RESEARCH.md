# Phase 1: OViewer-Framework + OTX-Modellierung — Research

**Researched:** 2026-05-21
**Domain:** Browser-basiertes Domänen-Editing (TypeScript-Port eines C++/MFC-Viewer-Patterns) + FastAPI-Backend-Foundation + Multi-Tenant-Postgres + IndexedDB-Persistenz
**Confidence:** HIGH (Core-Architektur, Standard-Stack, Engine-Integration) — MEDIUM (Save-Lock-Pattern, Undo-Strategie) — LOW (keine Bereiche)

---

## Summary

Phase 1 ist eine **Foundation-Phase mit zwei Säulen**, deren technischer Aufwand asymmetrisch ist:

1. **Backend-Säule** (ca. 25 % des Aufwands): Reines 3fls-Pattern-Replay — TenantAuthMiddleware, FastAPI/SQLAlchemy/Alembic-Stack, Schema-per-Tenant, Firebase-Emulator-Wiring. Praktisch keine Erfindung; das Risiko liegt nicht in Konzepten, sondern im Wiring (`search_path` korrekt setzen, Lazy-Bootstrap-Idempotenz, Lock-Endpoint mit TTL).
2. **Frontend-Säule** (ca. 75 % des Aufwands): TypeScript-Port des OViewer-Patterns. Hier liegt die Domänen-Komplexität. Das C++-`OViewer.h` (1604 Zeilen) definiert ein mehrstufiges Routing-System (Command-Routing, Update-Routing, SetObj-Routing, Idle/UI-Routing), das eng mit Win32-/MFC-Mechaniken (`WM_OCTRL_*`-Messages, `OnIdle`, `WM_INITMENUPOPUP`) verwoben ist. Ein **portierungs-getreuer** Ansatz würde diese Mechaniken nachbauen; der **CONTEXT-D-05-Hybrid-Ansatz** (TS-Klassen für Routing/State, React-Components für Rendering) ist die richtige Reduktion — er bewahrt die konzeptionelle Architektur und nutzt React's eingebaute Re-Render-Mechanik statt der C++-`OCtrlFill`/`OCtrlStore`-Push-Choreographie.

**Entscheidende Vor-Erkenntnis (verifiziert):** Der Engine-OTX-Writer ist **bereits implementiert**. `osim_engine.io.otx_writer.dump_simulator_to_otx(sim, original_otx=..., instances=...) -> str` existiert (1125 Zeilen, mit `OtxWriter`-Klasse, Roundtrip-Pass-Through für unsupported-Objekte). Das CONTEXT.md (D-02) und die ROADMAP.md beschreiben den Writer noch als "Welle 0 muss erst implementiert werden" — diese Annahme ist veraltet. **Phase 1 muss den Writer NICHT bauen, sondern verifizieren und integrieren** (Roundtrip-Test mit Dummy.otx, Coverage-Messung, ggf. Lücken schließen).

**Primary recommendation:** Plane Phase 1 als 7 Wellen aufgebaut auf folgender Dekomposition: (0) OTX-Writer-Verifikation in Engine, (1) Backend-Foundation 3fls-Replay, (2) Storage + Models + Lock, (3) OViewer-Core (5 TS-Klassen + 9 OCtrl-Components), (4) 12 konkrete Viewer + Sidebar-Tree, (5) GraphObject-Basis + React-Flow-Adapter für PDurchlaufplan-Design, (6) Save-Strategie + IndexedDB + E2E-Roundtrip. Aufwand 4-6 Wochen ist realistisch, aber Wave 5 (GraphObject + Design-Viewer) ist die größte Einzelposition — bei Risiko-Aversion lieber Design-Viewer als "MVP" (read-only graphische Darstellung) und Drag-and-Drop-Edit ins Phase-1-Backlog → Phase 4.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Bereich 1 — OTX-Handling**
- **D-01:** Server parst OTX serverseitig (nutzt `osim_engine.io.otx_loader.load_otx_file()`); liefert JSON-Tree an den Browser; akzeptiert JSON-Tree-Updates zurück und serialisiert sie wieder zu OTX.
- **D-02:** Die Engine bekommt einen **OTX-Writer** (`dump_simulator_to_otx(sim) -> str`) als Welle 0 dieser Phase. Heute existiert nur der Reader. Ohne diesen Writer ist Save-back als OTX nicht möglich.
  > **HINWEIS dieser Research:** Der Writer existiert **bereits** in `osim_engine/io/otx_writer.py` (verifiziert 2026-05-21). D-02 ist faktisch erfüllt; "Welle 0" wird zur Verifikations-/Coverage-Welle, nicht zur Implementierungs-Welle.
- **D-03:** OTX-Original der Upload-Datei wird im Object Storage abgelegt. Jeder Save-back wird als neue Version abgelegt (Versionierung via Timestamp im Pfad).
- **D-04:** Browser hält das gesamte Modell als In-Memory-State (Zustand-Store) während der Bearbeitung. Server kennt nur Persistenz-Stände.

**Bereich A — Viewer-Framework-Architektur**
- **D-05:** Hybrid-Pattern: `ViewerFrame`, `ClientCtrl` als TypeScript-Klassen, `ChildDialog`, `ChildCtrl` als React-Components mit props-basierter Datenbindung. Foundation lebt in `portal/src/viewers/core/`.
- **D-06:** Vollständige 9-er `OCtrl`-Familie (Variable, Bool, Enum, Link, List, Method, TabViewer, COLORREF, LOGFONT).
- **D-07:** Querschnitts-Foundation für ALLE späteren graphischen Viewer (siehe Memory `graphobject-is-viewer-foundation`).

**Bereich B — Konkrete Viewer**
- **D-08:** 12 konkrete Viewer in Phase 1: PSimulator, PDurchlaufplan-Std, PDurchlaufplan-Design, PGObjBase, PRessBelegMatrix, PRessMengeMatrix, PRessVerknuepfung, PDlplBetriebsmittel, PDlplPersonal, AEinsatzWunsch, AKapBed, AGruppe.
- **D-09:** Sidebar-Tree-Navigation: Modell → Durchlaufpläne → Knoten → Ressourcen → Schichten.
- **D-10:** Vollständige Edit-Operationen: Properties editieren, Anlegen, Löschen, Verknüpfen.

**Bereich C — Save-Strategie & Crash-Recovery**
- **D-11:** Auto-Save 30 s + manueller Speichern-Button + Dirty-Indicator.
- **D-12:** IndexedDB-Snapshot nach jeder Property-Änderung; Reload-Recovery + Server-Abgleich.
- **D-13:** Single-Editor-Lock auf Modell-Ebene; 15 min Inaktivitäts-Ablauf.
- **D-14:** Save-back = neue Version (kein In-Place-Overwrite); Original-Upload unverändert.

**Bereich D — Auth & Multi-Tenancy**
- **D-15:** Firebase Auth ab Tag 1 (Emulator lokal).
- **D-16:** Schema-per-Tenant in Postgres ab Tag 1; TenantAuthMiddleware aus 3fls 1:1.
- **D-17:** Lazy Tenant-Bootstrap beim ersten `/api/v1/auth/me`; Self-Service, idempotent.

**Bereich E — Backend-Foundation**
- **D-18:** Volle FastAPI-Foundation: `/api/v1/`, Service-Layer, SQLAlchemy 2 async + asyncpg, Alembic mit `001_initial_schema.py`, TenantAuthMiddleware, structlog, pydantic-settings, RFC 7807, Health-/Readiness-Endpoints, pytest + httpx-AsyncClient, OpenAPI-Docs.

### Claude's Discretion

- UI-Komponenten-Bibliothek-Wahl (shadcn vs. eigene Components) — folge 3fls-Pattern (shadcn) sofern keine Konflikte
- Undo/Redo-Mechanismus-Architektur (Command-Pattern, Event-Sourcing, snapshot-basiert)
- DB-Schema-Detail (Spalten-Reihenfolge, Index-Strategien) — folge 3fls-Konventionen
- Sidebar-Tree-Komponente (Lib-Wahl: `react-arborist`, `@tanstack/react-virtual`)
- Konkrete IndexedDB-Lib (`idb` vs. `dexie`)
- Konkrete Storage-Backend-Implementierung (Local-Filesystem für Dev, GCS später)

### Deferred Ideas (OUT OF SCOPE)

- **Simulations-Läufe** (`PSimulator.start()` aus Worker, Status-Polling) → Phase 2
- **Live-Visualisierung mit WebSocket** → Phase 4
- **Trace-Download / Trace-Browser** → Phase 2
- **Reports / PDF-Export** → Phase 6 (unverändert)
- **3fls-Integration via Iframe** → Phase 7 (unverändert)
- **Cloud-Deployment + Multi-Run-Aggregation** → Phase 5 (unverändert)
- **Auto-Generation aller ~30 Viewer per Reflection** → Phase 8+ Backlog
- **Pixel-genauer Original-Look (Skeuomorph)** → bewusst NICHT (PROJECT.md)
- **Roadmap-Resync** ist abgeschlossen (siehe STATE.md, 2026-05-21) — der Hinweis in CONTEXT.md ist erledigt.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

Die Phase hat keine formellen Requirement-IDs (REQ-XX), aber die ROADMAP.md definiert 9 explizite Success Criteria. Mapping auf Research-Sektionen:

| ID | Beschreibung (aus ROADMAP.md) | Research Support |
|----|-------------------------------|------------------|
| SC-01 | `docker compose up` startet Postgres, Firebase-Emulator, Minio | `## Architecture Patterns` § Compose-Stack; `## Standard Stack` Tabelle Backend |
| SC-02 | User-Register/Login via Firebase-Emulator; Tenant-Bootstrap beim ersten `/api/v1/auth/me` | `## Code Examples` § Lazy Tenant-Bootstrap; `## Common Pitfalls` Bootstrap-Race |
| SC-03 | OTX-Upload → Engine-Parse → JSON-Tree → Sidebar-Tree zeigt Hierarchie | `## Architecture Patterns` § JSON-Tree-Format; `## Don't Hand-Roll` OTX-Parser |
| SC-04 | 12 konkrete Viewer funktionsfähig | `## Architecture Patterns` § Viewer-Inventar mit Mapping C++→TS |
| SC-05 | 9-er OCtrl-Familie implementiert | `## Architecture Patterns` § OCtrl-Familie + shadcn-Mapping |
| SC-06 | Edit vollständig: Properties, Anlegen, Löschen, Verknüpfen | `## Architecture Patterns` § Edit-Operationen + Engine-Setter-API |
| SC-07 | Auto-Save 30 s + manuell + IndexedDB + Single-Editor-Lock | `## Architecture Patterns` § Save-Choreographie; `## Common Pitfalls` Lock-Stale |
| SC-08 | Save-back als versionierte OTX (kein In-Place-Overwrite) | `## Architecture Patterns` § Storage-Layout; OTX-Writer-API |
| SC-09 | Multi-Tenant-Schemas; alle Queries mit korrektem `search_path` | `## Code Examples` § search_path-per-Request; `## Common Pitfalls` Session-Leak |

</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OTX-Parse + JSON-Tree-Serialisierung | API/Backend | — | Engine ist Python; Browser parst NICHT (D-01) |
| OTX-Writer (JSON-Tree → OTX) | Engine (Python) | API/Backend (Caller) | Existiert in `osim_engine.io.otx_writer`; Backend ruft auf |
| Modell-In-Memory-State während Edit | Browser/Client | — | D-04 explizit; Zustand-Store |
| Modell-Persistenz (Versionen) | Object Storage (Minio/GCS) | Postgres (Metadaten) | Original-OTX + Save-back-Versionen ins Storage; nur `models`-Row in Postgres |
| Crash-Snapshot pro Property-Change | Browser/Client (IndexedDB) | — | D-12 — Server sieht keine Zwischenstände |
| Single-Editor-Lock | API/Backend (DB-Row) | Browser (Heartbeat-PING) | TTL-basiert, Heartbeat alle 30 s, Stale-Cleanup serverseitig |
| Tenant-Isolation | DB (`search_path` per Request) | API/Backend (Middleware) | 3fls-Pattern; kein JOIN-basierter Filter |
| Auth-Verifikation | API/Backend (Firebase Admin SDK) | Browser (Firebase Client SDK) | Token im Hot-Path; keine DB-Lookup |
| Viewer-Routing (welcher Viewer für welches Objekt) | Browser/Client (`ClientCtrl`-TS-Klasse) | — | Pure Browser-Logik, keine API-Calls |
| Tree-Hierarchie-Aufbau (Modell→Plan→Knoten) | Browser/Client (aus JSON-Tree) | — | JSON-Tree enthält Hierarchie; kein API-Sub-Tree-Lazy-Load in Phase 1 |
| Graphische Darstellung Durchlaufplan-Design | Browser/Client (React Flow + GraphObject) | — | Pure Client-Rendering; Engine kennt nur das Modell-Objekt |
| Property-Edit-Validierung | Browser (UI-Feedback) | API/Backend (Server-Side bei Save) | Zwei-Stufen: Optimistic Client + Authoritative Server beim Save-Back |

---

## Standard Stack

### Core — Backend

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python | 3.13 | Runtime | Engine-Constraint ≥3.12; 3fls nutzt 3.13 [VERIFIED: copy-paste-guide.md] |
| FastAPI | 0.115+ | API-Framework | 3fls-Stack 1:1 [VERIFIED: 3fls-patterns.md] |
| Uvicorn | 0.34+ | ASGI-Server | 3fls-Standard [VERIFIED: 3fls-patterns.md] |
| SQLAlchemy | 2.0+ (async) | ORM | 3fls-Standard; 2026 production-grade Pattern bestätigt [CITED: medium.com/algomart 2026] |
| asyncpg | latest | Postgres-Driver | Pflicht für async; `postgresql+asyncpg://`-DSN [CITED: oneuptime.com 2026-02] |
| Alembic | 1.14+ | Migrationen | 3fls-Standard [VERIFIED: 3fls-patterns.md] |
| Firebase Admin SDK | 7.2+ | Token-Verify | 3fls-Standard [VERIFIED: 3fls-patterns.md] |
| pydantic-settings | 2+ | Config | 3fls-Standard; ersetzt python-dotenv für strukturierte Configs [VERIFIED: 3fls-patterns.md] |
| structlog | 25.5+ | Strukturiertes Logging | 3fls-Standard [VERIFIED: 3fls-patterns.md] |
| orjson | 3.10+ | JSON-Serialisierung | 3fls-Standard; FastAPI `ORJSONResponse` [VERIFIED: 3fls-patterns.md] |
| httpx | 0.28+ | Test-Client (AsyncClient) | Default für FastAPI-Tests [VERIFIED: 3fls-patterns.md] |
| pytest, pytest-asyncio | 8+, 0.25+ | Test-Framework | 3fls-Standard [VERIFIED: 3fls-patterns.md] |
| ruff | 0.8+ | Linter/Formatter | 3fls-Standard [VERIFIED: 3fls-patterns.md] |
| osim-engine | editable-install | Engine | `uv pip install -e ../osim-engine/engine` — beachte den Subfolder `engine/` im Engine-Repo |

**Storage:**
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| minio (Server) | latest | S3-API für Dev | Standard-Local-S3-Substitut; container-fähig |
| boto3 oder google-cloud-storage | 3.9+ | Storage-Client | 3fls nutzt google-cloud-storage; in Phase 1 reicht boto3-S3 für Minio. Empfehlung: **Abstraktions-Layer in `app/services/storage.py`** mit zwei Implementierungen (Local-FS für Dev, S3/GCS für Stage/Prod) |

### Core — Frontend

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2+ | UI-Framework | 3fls 1:1 [VERIFIED: 3fls-patterns.md] |
| TypeScript | 5.9+ | Sprache (strict) | 3fls 1:1 [VERIFIED: 3fls-patterns.md] |
| Vite | 7.3+ | Build-Tool | 3fls 1:1; @vitejs/plugin-react v5 mit Oxc [VERIFIED: 3fls-patterns.md] |
| @tanstack/react-router | 1.170.5 | Router (file-based) | 3fls 1:1; aktuell [VERIFIED: npm 2026-05-20] |
| @tanstack/react-query | 5.100.11 | Server-State | 3fls 1:1; aktuell [VERIFIED: npm 2026-05] |
| Zustand | 5.0.13 | Client-State | 3fls 1:1; aktuell [VERIFIED: npm 2026-05] |
| Tailwind CSS | 4.2+ | Styling | 3fls 1:1 [VERIFIED: 3fls-patterns.md] |
| shadcn (CLI) | 4.0+ | Komponenten-Quelle | 3fls 1:1; deckt Input/Checkbox/Select/Combobox/Tabs/Button/Dialog/Table ab [VERIFIED: 3fls-patterns.md] |
| Firebase JS SDK | 10+ | Auth-Client | 3fls 1:1 [VERIFIED: 3fls-patterns.md] |
| openapi-fetch ODER `apiFetch<T>` | aktuell | API-Client | 3fls bietet beides; `apiFetch<T>` ist 1:1 kopierbar [VERIFIED: copy-paste-guide.md] |

### Supporting — Phase-1-spezifisch (Claude's Discretion entschieden)

| Library | Version | Purpose | When to Use | Rationale |
|---------|---------|---------|-------------|-----------|
| **@xyflow/react** | 12.10.2 | Graph-Rendering | `PDurchlaufplanViewerDesign` | De-facto-Standard für Node-based UIs; Memoization-Pattern dokumentiert für > 100 Nodes [VERIFIED: npm 2026-05; CITED: reactflow.dev/learn/advanced-use/performance] |
| **react-arborist** | 3.6.1 | Sidebar-Tree | Workspace-Navigation | Virtualized, Drag-and-Drop, Inline-Rename, Keyboard-Navigation, Aria. Skalierbar auf 10.000+ Knoten. Aktiv gepflegt (letzter Release 6h alt) [VERIFIED: npm 2026-05; CITED: blog.openreplay.com] |
| **dexie** | 4.4.2 | IndexedDB-Wrapper | Snapshot-Store | Schema-Versioning out-of-the-box; Live-Queries via `dexie-react-hooks`; deutlich höhere DX als `idb` für unseren Use-Case mit häufigem Re-Write [VERIFIED: npm 2026-05; CITED: pkgpulse.com 2026] |
| **zundo** | 2.3.0 | Undo/Redo für Zustand | History-Stack | <700 Bytes Middleware; gut integriert mit Zustand 5; Snapshot-basiert (kein Command-Pattern-Overhead) [VERIFIED: npm; CITED: github.com/charkour/zundo] |
| **immer** | 10+ | Immutable Updates | Komplexe State-Trees | Standard-Paar mit Zustand für strukturierte Modell-Tree-Updates |
| **sonner** | latest | Toast-Notifications | Dirty/Saved/Lock-Feedback | 3fls-Standard [VERIFIED: copy-paste-guide.md] |
| **react-icons** | global | Icons | Toolbar/Tree | 3fls-Standard [VERIFIED: 3fls-patterns.md] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| **dexie** | `idb` (Jake Archibald) | `idb` ist leichtgewichtiger (~2 KB vs ~20 KB), aber bei Schema-Änderungen muss Migration manuell geschrieben werden. Für unseren Use-Case (mehrere Stores, Schema-Migrations bei Modell-Format-Erweiterungen) ist Dexie's Versioning klar überlegen. [CITED: docs.bswen.com 2026-04] |
| **react-arborist** | `react-complex-tree`, `@mui/x-tree-view` mit Virtualisierung, eigener Tree auf `@tanstack/react-virtual` | `react-complex-tree` ist headless (mehr Flexibilität, mehr Aufwand). `mui` würde unseren shadcn-Stack brechen. Eigene Implementierung kostet Wochen für Drag-and-Drop, Keyboard-Nav, Aria — alles in `react-arborist` enthalten. |
| **@xyflow/react** | Cytoscape.js, vis.js, eigener SVG-Renderer | XYFlow ist React-native (kein Refs/Wrapper-Overhead), aktiv gepflegt, hat eingebautes Viewport-Culling. Cytoscape ist mächtiger aber DOM-/Canvas-Heavy ohne React-Integration. Phase 1 braucht max. ~50 Knoten — Performance ist unkritisch. |
| **zundo** | Eigenes Command-Pattern, `redux-undo`+Immer, `mutativejs/zustand-travel` (JSON-Patches) | Command-Pattern ist robuster bei Co-Editing, aber Phase 1 hat Single-Editor-Lock — Snapshot-basiert reicht. `zustand-travel` ist effizienter bei großen States, aber API neuer/instabiler. [CITED: dev.to/unadlib „Rethinking Undo/Redo"] |
| **openapi-fetch** | `apiFetch<T>` (3fls's eigene) | openapi-fetch braucht generierte Types aus OpenAPI-Schema — Mehraufwand für Phase 1. `apiFetch<T>` ist 1:1 aus 3fls kopierbar. Empfehlung: **`apiFetch<T>` für Phase 1, openapi-fetch ab Phase 3 (mit JSON-Schema)**. |
| **Object Storage** Minio | `localstack` (S3-Mock), Plain-Filesystem in `data/` | Minio ist production-realistic und gleichzeitig dev-tauglich. Filesystem wäre einfacher, aber bricht den Abstraktions-Pfad zu GCS in Phase 5. |

### Verifikation der Versionen

```bash
npm view zustand version            # 5.0.13 (verifiziert)
npm view @tanstack/react-router version  # 1.170.5 (verifiziert)
npm view @tanstack/react-query version   # 5.100.11 (verifiziert)
npm view dexie version              # 4.4.2 (verifiziert)
npm view react-arborist version     # 3.6.1 (verifiziert)
npm view @xyflow/react version      # 12.10.2 (verifiziert)
npm view zundo version              # 2.3.0 (verifiziert)
```

**Action für Planner:** Vor jedem `npm install` während der Implementation noch einmal `npm view <pkg> version` ausführen, da sich Versionen schnell ändern.

---

## Architecture Patterns

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                            BROWSER (Client)                            │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  Routes (TanStack Router, file-based)                          │    │
│  │  /login   /   /models   /models/:id                            │    │
│  └────────────┬───────────────────────────────────────────────────┘    │
│               │ Auth-Guard via beforeLoad                              │
│  ┌────────────▼───────────────────────────────────────────────────┐    │
│  │ /models/:id  — Workspace                                       │    │
│  │                                                                │    │
│  │  ┌──────────────────┐  ┌──────────────────────────────────┐    │    │
│  │  │ Sidebar-Tree     │  │  Viewer-Bereich (Single-Viewer)  │    │    │
│  │  │ (react-arborist) │  │                                  │    │    │
│  │  │  selectedNode    │  │  ┌────────────────────────────┐  │    │    │
│  │  │      │           │  │  │ ViewerFrame (TS-Klasse)    │  │    │    │
│  │  │      │ on-select │  │  │  ↓                         │  │    │    │
│  │  │      └───────────┼──┼──→ ClientCtrl (TS-Klasse)     │  │    │    │
│  │  └──────────────────┘  │  │  routet zu ChildDialog     │  │    │    │
│  │                        │  │   ↓                        │  │    │    │
│  │                        │  │  ChildDialog (React)       │  │    │    │
│  │                        │  │   props={obj, schema}      │  │    │    │
│  │                        │  │   ↓ enthält                │  │    │    │
│  │                        │  │  OCtrl-Komponenten         │  │    │    │
│  │                        │  │   onChange → Store-Update  │  │    │    │
│  │                        │  └────────────────────────────┘  │    │    │
│  │                        └──────────────────────────────────┘    │    │
│  └─────────────┬──────────────────────────────────────────────────┘    │
│                │ Zustand-Store-Mutation                                │
│  ┌─────────────▼──────────────────────────────────────────────────┐    │
│  │  Model-Store (Zustand + Immer + zundo Undo-History)            │    │
│  │  - tree: ModelTree (JSON-Repräsentation)                       │    │
│  │  - dirty: boolean                                              │    │
│  │  - selection: NodeId                                           │    │
│  │  - lockToken: string                                           │    │
│  └─┬──────────────────┬──────────────────────────────────┬────────┘    │
│    │ on-change        │ every 30s (debounced)            │ heartbeat   │
│    ▼                  ▼                                  │ every 30s   │
│  ┌───────────┐      ┌─────────────────────────┐          │             │
│  │ IndexedDB │      │ PUT /api/v1/models/:id  │          │             │
│  │ (dexie)   │      │ (apiFetch + JWT)        │          │             │
│  │ snapshots │      └────────────┬────────────┘          │             │
│  └───────────┘                   │                       │             │
└──────────────────────────────────┼───────────────────────┼─────────────┘
                                   │ HTTPS                 │
                                   ▼                       │
┌──────────────────────────────────────────────────────────▼─────────────┐
│                       FastAPI Backend                                  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  TenantAuthMiddleware (1:1 aus 3fls)                             │  │
│  │  - Token verify → request.state = {tenant_id, user_uid, role}    │  │
│  │  - Whitelist: /health, /readiness, /docs                         │  │
│  └────────────────────┬─────────────────────────────────────────────┘  │
│                       │                                                │
│  ┌────────────────────▼──────────────────────────────────────────┐     │
│  │  API-Router /api/v1/                                          │     │
│  │   /auth/me   →  AuthService.bootstrap_tenant_if_missing()     │     │
│  │   /models/upload-otx (multipart) → ModelService.upload()      │     │
│  │   /models/{id}    →  ModelService.get_tree() / save_tree()    │     │
│  │   /models/{id}/lock (POST/DELETE) → LockService.acquire/      │     │
│  │                                     release / heartbeat       │     │
│  └─┬─────────────────────────────────────────────────────────────┘     │
│    │                                                                   │
│  ┌─▼──────────────────────────────────────────────────────────────┐    │
│  │  Service-Layer                                                 │    │
│  │  - AuthService                                                 │    │
│  │  - ModelService (Upload + JSON-Tree Serializer)                │    │
│  │  - LockService (DB-Row mit TTL)                                │    │
│  │  - StorageService (Minio/GCS-Adapter)                          │    │
│  └─┬──────────────────────────────────────────┬───────────────────┘    │
│    │                                          │                        │
│    │ uses osim_engine (editable install)      │                        │
│    │  - load_otx_file() → LoadResult          │                        │
│    │  - dump_simulator_to_otx() → str         │                        │
│    │                                          │                        │
│  ┌─▼─────────────────────┐         ┌──────────▼───────────┐            │
│  │ DB-Session            │         │ Storage              │            │
│  │ (SQLAlchemy async +   │         │ (Minio S3-API local) │            │
│  │  search_path per req) │         │ Original.otx +       │            │
│  └─┬─────────────────────┘         │ versions/*.otx       │            │
└────┼────────────────────────────────┼───────────────────────────────────┘
     │                                │
     ▼                                ▼
┌──────────────────┐         ┌────────────────────┐
│ PostgreSQL 17    │         │ Minio (S3-API)     │
│  public.tenants  │         │  buckets/          │
│  public.users    │         │   tenants/{id}/    │
│  tenant_X.models │         │     models/{mid}/  │
│  tenant_X.model_ │         │       original.otx │
│   locks          │         │       v_{ts}.otx   │
└──────────────────┘         └────────────────────┘
```

### Recommended Project Structure

```
osim-ui/
├── app/                              # FastAPI Backend
│   ├── main.py                       # FastAPI() + middleware-stack + lifespan
│   ├── core/
│   │   ├── config.py                 # pydantic-settings Settings
│   │   ├── database.py               # async engine + SessionLocal + search_path
│   │   └── logging.py                # structlog config
│   ├── auth/
│   │   ├── firebase.py               # initialize_firebase, verify_token
│   │   ├── middleware.py             # TenantAuthMiddleware (1:1 aus 3fls)
│   │   └── dependencies.py           # get_tenant_id, get_user_uid Dependencies
│   ├── api/v1/
│   │   ├── router.py                 # include_router-Aggregation
│   │   ├── auth.py                   # /auth/me Endpoint
│   │   ├── models.py                 # /models/* Endpoints
│   │   └── locks.py                  # /models/{id}/lock Endpoints
│   ├── services/
│   │   ├── auth_service.py           # Tenant-Bootstrap
│   │   ├── model_service.py          # OTX-Upload, JSON-Tree, Save-back
│   │   ├── lock_service.py           # DB-Row-Lock mit TTL
│   │   ├── storage.py                # Storage-Abstraktion (Local/Minio/GCS)
│   │   └── otx_json_tree.py          # PSimulator ↔ JSON-Tree Serializer
│   ├── db/
│   │   └── models.py                 # SQLAlchemy ORM-Klassen
│   ├── schemas/
│   │   ├── auth.py                   # Pydantic-Models /auth/*
│   │   ├── model.py                  # Pydantic-Models /models/*
│   │   └── lock.py                   # Pydantic-Models /locks/*
│   └── alembic/
│       ├── env.py
│       └── versions/
│           └── 001_initial_schema.py
│
├── portal/                           # Frontend
│   ├── package.json
│   ├── vite.config.ts                # 1:1 aus 3fls (Port 3000 oder 3002)
│   ├── tsconfig.json                 # 1:1 aus 3fls
│   └── src/
│       ├── main.tsx                  # 1:1 aus 3fls (StrictMode + App)
│       ├── app.tsx                   # 1:1 aus 3fls (Provider-Wrap)
│       ├── auth/                     # 1:1 aus 3fls (firebase, auth-provider, use-auth)
│       ├── api/                      # 1:1 aus 3fls (apiFetch + error-message)
│       ├── components/ui/            # shadcn-Komponenten (per shadcn CLI generiert)
│       ├── routes/                   # TanStack-Router file-based
│       │   ├── __root.tsx            # 1:1 aus 3fls
│       │   ├── _authenticated.tsx    # 1:1 aus 3fls (beforeLoad-Guard)
│       │   ├── login.tsx             # angepasst
│       │   ├── index.tsx             # Dashboard (eigene Modelle)
│       │   └── models/
│       │       ├── index.tsx         # Modell-Bibliothek + Upload
│       │       └── $id.tsx           # Workspace (Sidebar + Viewer)
│       ├── viewers/                  # OViewer-Foundation — Querschnitt
│       │   ├── core/                 # Foundation-Layer
│       │   │   ├── ViewerFrame.ts    # TS-Klasse
│       │   │   ├── ClientCtrl.ts     # TS-Klasse
│       │   │   ├── ViewerRegistry.ts # Map: ObjectKlass → Viewer-Component
│       │   │   ├── ChildDialog.tsx   # React-Base-Component
│       │   │   └── octrl/            # 9 OCtrl-Components
│       │   │       ├── OCtrlVariable.tsx
│       │   │       ├── OCtrlBool.tsx
│       │   │       ├── OCtrlEnum.tsx
│       │   │       ├── OCtrlLink.tsx
│       │   │       ├── OCtrlList.tsx
│       │   │       ├── OCtrlMethod.tsx
│       │   │       ├── OCtrlTabViewer.tsx
│       │   │       ├── OCtrlColorRef.tsx
│       │   │       └── OCtrlLogFont.tsx
│       │   ├── PSimulator/           # konkreter Viewer 1
│       │   │   └── PSimulatorViewer.tsx
│       │   ├── PDurchlaufplan/       # konkrete Viewer 2+3
│       │   │   ├── PDurchlaufplanViewerStd.tsx
│       │   │   └── PDurchlaufplanViewerDesign.tsx
│       │   ├── PGObjBase/            # 4
│       │   │   └── PGObjBaseViewer.tsx
│       │   ├── PRess/                # 5+6+7
│       │   │   ├── PRessBelegMatrixViewer.tsx
│       │   │   ├── PRessMengeMatrixViewer.tsx
│       │   │   └── PRessVerknuepfungViewer.tsx
│       │   ├── PDlpl/                # 8+9
│       │   │   ├── PDlplBetriebsmittelViewer.tsx
│       │   │   └── PDlplPersonalViewer.tsx
│       │   └── AZeit/                # 10+11+12
│       │       ├── AEinsatzWunschViewer.tsx
│       │       ├── AKapBedViewer.tsx
│       │       └── AGruppeViewer.tsx
│       ├── graph/                    # GraphObject-Foundation (Phase-1-Basis)
│       │   └── core/
│       │       ├── GObject.ts        # Basis-Klasse
│       │       ├── GObjLink.ts       # mit In/Out-Listen
│       │       ├── GLink.ts          # Kanten
│       │       └── ReactFlowAdapter.tsx  # GraphObject → React-Flow-Mapping
│       ├── sidebar/                  # Tree-Navigation
│       │   ├── ModelTree.tsx         # react-arborist-Wrapper
│       │   └── tree-builder.ts       # ModelTree-JSON → Arborist-Format
│       ├── stores/                   # Zustand-Stores
│       │   ├── model-store.ts        # Modell-State + Undo (zundo) + dirty
│       │   └── lock-store.ts         # Lock-Token + Heartbeat-Timer
│       ├── snapshot/                 # IndexedDB
│       │   ├── db.ts                 # dexie-Setup
│       │   └── snapshot-service.ts   # save/restore-Funktionen
│       └── lib/
│           └── octrl-types.ts        # TypeScript-Types für OCtrl-Props
│
├── docker-compose.yml                # postgres, firebase-emulator, minio, api, portal
├── Dockerfile                        # Multi-Stage Python (1:1 aus 3fls)
├── pyproject.toml                    # 1:1 aus 3fls + osim-engine editable
├── .env.example                      # 1:1 aus 3fls (Werte angepasst)
└── tests/
    ├── backend/
    │   ├── conftest.py               # httpx-AsyncClient + Test-DB-Fixture
    │   ├── test_auth.py              # /auth/me + Tenant-Bootstrap
    │   ├── test_models_upload.py     # OTX-Upload-Endpoint
    │   ├── test_models_save.py       # Save-Roundtrip
    │   ├── test_lock.py              # Lock-Acquire/Release/Stale
    │   └── test_otx_roundtrip.py     # Dummy.otx → JSON → OTX → Re-Parse (Coverage)
    └── frontend/                      # vitest (Komponenten) + Playwright (E2E)
        ├── viewers/
        │   ├── OCtrlVariable.spec.tsx
        │   └── ...
        └── e2e/
            └── modeling-flow.spec.ts # Upload → Edit → Save
```

---

### Pattern 1: OViewer-Hybrid (TS-Klassen-Routing + React-Components-Rendering)

**Was:** Das C++-`OViewer.h`-Pattern beschreibt eine 5-Schichten-Hierarchie (`ViewerFrame` → `ClientCtrl` → `ChildDialog` → `ChildCtrl` → `ChildDialog`) mit Routing für Commands, Updates, SetObj und Idle/UI. In React wird das **massiv** vereinfacht:

- **TypeScript-Klassen** halten "Routing-Logik" (welcher Viewer für welches Objekt?) — aber NICHT die Win32-Push-Choreographie (`WM_OCTRL_FILL`, `WM_OCTRL_STORE`, `WM_OCTRL_INIT`). React's Re-Render-Mechanik ersetzt die Fill-Phase, kontrollierte Form-Inputs ersetzen die Store-Phase.
- **React-Components** sind die `ChildDialog`s und `OCtrl`s. Sie bekommen `value`, `onChange`, `schema` als Props und sind reine UI.
- **Routing** = "welcher Viewer-Component soll für dieses Objekt gerendert werden?" = eine Map `(objKlass, viewerHint?) → React.ComponentType<ViewerProps>`. Das ist die `ViewerRegistry`.

**When to use:** Diese Architektur ist Phase-1-Foundation für ALLE Editing-/Form-Viewer (auch späterer Phasen).

**Was bewusst NICHT portiert wird (MFC-Spezifika, weggelassen):**
- `WM_OCTRL_FILL` / `WM_OCTRL_STORE` / `WM_OCTRL_INIT` Push-Choreographie → React-Reconciler ersetzt.
- `OViewIdle()` / `WM_INITMENUPOPUP` / `UpDateChildDialogs()` Idle-Mechanik → moderne Browser haben `requestAnimationFrame`/`useEffect`-Mechaniken; Phase 1 braucht das nicht.
- `GetFrameMenu()` / `GetToolBar()` / `GetStatusBar()` / `GetAccelerator()` Resource-Loading → wird durch shadcn-Layout-Komponenten + Tailwind-Style ersetzt.
- `OCtrlOprChild`, `OCtrlLinkChild`, `OCtrlListChild`, `OCtrlLListChild`, `OCtrlLListTable` Verschachtelungs-Kette → React-Composition (Component-in-Component) ersetzt das vollständig.
- `OMetaViewer`-Registrierung via `IMPLEMENT_DYNCREATE` und IDs aus `idObjectBase.h` → ersetzt durch eine simple Map (`ViewerRegistry`).

**Was übernommen wird (Konzept):**
- "Ein Objekt = Ein Viewer" — als Routing-Default
- Hierarchische Komposition (Child-Dialog kann Child-Dialog enthalten via Tab oder eingebettete OCtrlList → Sub-Property-Editor)
- Property-Editor-Konvention: ein Objekt-Edit-Dialog mit OCtrl-Bindings
- Navigation-Toolbar mit `[◄◄] [◄] [►] [►►] [+] [-] [x] [=]` (1:1 aus osim2004-ui-analysis.md §8.4)

**Example (Skeleton):**

```typescript
// Source: TypeScript-Port von OViewer.h §2 GRUNDKONZEPT (interpretiert)

// portal/src/viewers/core/types.ts
export type ObjectKlass = string;   // e.g. "PDurchlaufplan", "PDpKnKonstant"
export type ViewerHint = string;    // e.g. "std", "design"

export interface OBaseObj {
  oid: number;
  klass: ObjectKlass;
  attrs: Record<string, unknown>;
  sub_refs: number[][];
}

export interface ViewerProps<T extends OBaseObj = OBaseObj> {
  obj: T;
  schema: PropertySchema;   // aus dem JSON-Tree der Engine
  onChange: (patch: Partial<T["attrs"]>) => void;
  onCommand: (cmd: ViewerCommand) => void;
}

export type ViewerCommand =
  | { type: "navigate"; direction: "first" | "prev" | "next" | "last" }
  | { type: "create"; objKlass: ObjectKlass }
  | { type: "delete"; oid: number }
  | { type: "open-sub-viewer"; oid: number };

// portal/src/viewers/core/ViewerRegistry.ts
type ViewerEntry = {
  klass: ObjectKlass;
  hint?: ViewerHint;     // optional — z.B. "design" vs "std"
  Component: React.ComponentType<ViewerProps>;
};

class ViewerRegistry {
  private entries: ViewerEntry[] = [];
  private fallback?: React.ComponentType<ViewerProps>;

  register(entry: ViewerEntry) { this.entries.push(entry); }
  setFallback(C: React.ComponentType<ViewerProps>) { this.fallback = C; }

  resolve(klass: ObjectKlass, hint?: ViewerHint) {
    const exact = this.entries.find(e => e.klass === klass && e.hint === hint);
    if (exact) return exact.Component;
    const klassMatch = this.entries.find(e => e.klass === klass && !e.hint);
    if (klassMatch) return klassMatch.Component;
    return this.fallback; // → PGObjBaseViewer als Default
  }
}
export const viewerRegistry = new ViewerRegistry();

// portal/src/viewers/core/ClientCtrl.ts
// TS-Klasse mit minimaler State-Logik. KEINE React-Hooks hier.
export class ClientCtrl {
  constructor(
    private registry: ViewerRegistry,
    private getState: () => { selection: number | null; viewerHint: ViewerHint | null },
    private setSelection: (oid: number | null) => void,
    private setViewerHint: (h: ViewerHint | null) => void,
  ) {}

  resolveViewer(obj: OBaseObj | null) {
    if (!obj) return null;
    const hint = this.getState().viewerHint ?? undefined;
    return this.registry.resolve(obj.klass, hint);
  }

  setObject(oid: number | null) { this.setSelection(oid); }
  setViewerHint(hint: ViewerHint | null) { this.setViewerHint(hint); }
}

// portal/src/viewers/core/ViewerFrame.tsx (React-Wrapper, hier React weil Top-Layout)
export function ViewerFrame() {
  const selection = useModelStore(s => s.selection);
  const tree = useModelStore(s => s.tree);
  const obj = selection ? findByOid(tree, selection) : null;
  const Viewer = clientCtrl.resolveViewer(obj);

  if (!Viewer || !obj) return <EmptyState />;

  const schema = getSchemaFor(obj.klass);
  return (
    <div className="flex h-full flex-col">
      <ViewerToolbar />
      <Viewer
        obj={obj}
        schema={schema}
        onChange={(patch) => useModelStore.getState().patchObject(obj.oid, patch)}
        onCommand={(cmd) => commandDispatcher.handle(cmd)}
      />
    </div>
  );
}
```

### Pattern 2: OCtrl-Familie ↔ shadcn-Mapping

| OCtrl (C++) | Phase-1-Komponente (TS) | shadcn-Komponente | Bemerkung |
|-------------|-------------------------|-------------------|-----------|
| `OCtrlVariableEdit` (text/int/float) | `<OCtrlVariable>` | `<Input>` | Type-Hint aus Schema (`text`/`number`); Currency-/SimTime-Subtype als Discriminator-Prop |
| `OCtrlBool` | `<OCtrlBool>` | `<Checkbox>` | Tri-State (true/false/null) wenn Schema `nullable: true` |
| `OCtrlEnumGroup` | `<OCtrlEnum>` | `<Select>` (Dropdown) ODER `<RadioGroup>` (Group) | Variante über Prop `display="radio" \| "dropdown"` |
| `OCtrlOprChoice` + `OCtrlOprChild` (Link) | `<OCtrlLink>` | `<Combobox>` (shadcn) | Suche + Auswahl aus refMeta-Liste; "Open in new Viewer"-Button für Navigation in Sub-Viewer |
| `OCtrlLListListBox` + `OCtrlLListTable` (List) | `<OCtrlList>` | `<Table>` (shadcn) + `<Button>`-Toolbar | Sub-Object-Tabelle mit Add/Remove/Move; Item-Click → Sub-Viewer öffnen |
| `OCtrlDumperButton` / `OCtrlCommandButton` (Method) | `<OCtrlMethod>` | `<Button>` | Onclick → POST /api/v1/models/{id}/methods/{name} (Phase 2+); Phase 1: Client-side noop für Methoden ohne Side-Effect |
| `OCtrlTabViewer` (Tab-Container) | `<OCtrlTabViewer>` | `<Tabs>` (shadcn) | Wechselt zwischen verschiedenen `ChildDialog`-Layouts für dasselbe Objekt |
| `OCtrlCOLORREF` | `<OCtrlColorRef>` | **fehlt** — selbst implementieren | Empfehlung: `react-colorful` (4 KB, headless, MIT). Trigger als shadcn-`<Button>` mit Color-Swatch |
| `OCtrlLOGFONT` | `<OCtrlLogFont>` | **fehlt** — selbst implementieren | Dialog mit `<Select>` Font-Family + `<Input type="number">` Size + Bold/Italic-Toggles. Phase 1: minimal (Family + Size reichen für OSim-Modelle) |

**Common Props (alle OCtrls):**
```typescript
interface OCtrlBaseProps<T> {
  value: T | null;
  onChange: (value: T | null) => void;
  schema: PropertyMeta;       // {type, label_de, nullable, readonly, ...}
  disabled?: boolean;         // z.B. für Read-Only-Viewer wenn Modell von anderem User gelockt
  "data-octrl-id"?: string;   // für E2E-Tests
}
```

### Pattern 3: JSON-Tree-Format (Server ↔ Browser)

**Empfehlung:** Ein **schmales UI-orientiertes Format**, nicht die Pydantic-Repräsentation der Engine-Klassen.

**Vergleich der Optionen:**

| Option | Pro | Contra |
|--------|-----|--------|
| **Engine-native Pydantic** (Engine baut sich Pydantic-Modelle auf, FastAPI serialisiert) | Wenig Code im Backend; "free" mit pydantic 2 | Engine-Klassen sind plain Python (NICHT pydantic — siehe `osim-engine-api.md` §1: "Plain Python-Klassen mit Vererbung als Engine-Klassen; Pydantic nur am IO-Rand"); Pydantic-Wrapper müsste handgeschrieben werden für ALLE ~30 Klassen. Engine-API ändert sich → UI bricht. |
| **OTX-nahe JSON-Repräsentation** (1:1 OtxObject mit `klass`, `oid`, `attrs`, `sub_refs`) | Trivial zu serialisieren (OtxObject ist bereits ein Dataclass); deckt 100% des Vokabulars ab; symmetrisch für Reader und Writer | Vokabular ist C++-/MFC-historisch (`m_sName`, `m_iDurchfuehrungszeit`, …); Frontend muss damit umgehen |
| **UI-orientiertes ModelTree** (Hierarchie aus Modell→Pläne→Knoten mit ergänzenden Display-Hints) | Optimiert für Sidebar-Tree-Aufbau; klare Abstraktion | Doppelte Repräsentation; Server muss bei Save-back zurück-mappen |

**Empfohlene Lösung — Two-Format-Approach:**

1. **Wire-Format = OtxObject-äquivalent (flach):**
   ```typescript
   // Was über die Leitung geht — symmetrisch zum OtxLoader/OtxWriter
   interface ModelObject {
     oid: number;
     klass: string;                          // "PDurchlaufplan", "PDpKnKonstant", ...
     attrs: Record<string, AttrValue>;       // Engine-Klassen-Attribute (m_sName, m_iDurchfuehrungszeit, ...)
     sub_refs: number[][];                   // Basisklassen-Trenner-Listen für LList-Container
   }
   type AttrValue = number | string | boolean | null | number[] /*oid-ref*/;

   interface ModelTreeWire {
     version: 1;
     simulator_oid: number;                  // immer 0 per Konvention
     objects: Record<number, ModelObject>;   // oid → obj
     coverage: { loaded: number; skipped: number; unsupported: string[] };
     schemas_url: string;                    // /api/v1/schemas/v1 — Cache-key für PropertySchema
   }
   ```

2. **Browser-Repräsentation = ModelStore (gleichwertig, aber mit Indizes für O(1)-Lookups + Display-Hints):**
   ```typescript
   interface ModelStoreState {
     wire: ModelTreeWire;                    // Quelle der Wahrheit
     tree: TreeNode[];                       // abgeleiteter Tree für Sidebar
     indexByKlass: Map<string, number[]>;    // schnelle Filter-Lookups
     dirty: boolean;
     undoHistory: ...;                       // zundo-temporal
   }
   ```

3. **PropertySchema (separater, statischer Endpoint):**
   ```typescript
   interface PropertyMeta {
     name: string;                           // "m_sName"
     label_de: string;                       // "Name"
     octrl_type: "Variable" | "Bool" | "Enum" | "Link" | "List" | "Method" | "COLORREF" | "LOGFONT";
     value_type?: "string" | "int" | "float" | "boolean";
     enum_values?: { value: number; label_de: string }[];
     link_target_klass?: string;             // für OCtrlLink
     readonly?: boolean;
     nullable?: boolean;
   }
   interface ClassSchema {
     klass: string;
     label_de: string;                       // "Durchlaufplan"
     properties: PropertyMeta[];
     viewer_hints: ViewerHint[];             // ["std", "design"] für PDurchlaufplan
   }
   ```

**Rationale:**
- Das **Wire-Format ist symmetrisch** zum OtxLoader/OtxWriter — minimaler Backend-Code (Adapter ist im Wesentlichen `OtxObject.to_dict()`).
- Das **PropertySchema ist ein static asset** (initial hand-curated, später durch Engine-Reflection in Phase 3 ersetzt). Frontend lädt es einmal pro Session, Cache via TanStack-Query (`staleTime: Infinity`).
- Das **Wire-Format vermeidet Engine-Coupling**: wenn die Engine intern refactored, ändert sich nur der Wire→Engine-Adapter im Backend, nicht das Frontend.

**Backend-Pseudocode für /models/{id}:**
```python
# app/services/otx_json_tree.py
from osim_engine.io.otx_loader import load_otx_file
from osim_engine.io.otx_writer import dump_simulator_to_otx, OtxWriter

def load_to_wire(otx_path: Path) -> ModelTreeWire:
    result = load_otx_file(otx_path)
    objects = {}
    for oid, obj in result.otx.by_oid.items():
        objects[oid] = {
            "oid": oid,
            "klass": obj.klass,
            "attrs": obj.attrs,
            "sub_refs": obj.sub_refs,
        }
    return ModelTreeWire(
        version=1,
        simulator_oid=0,
        objects=objects,
        coverage={
            "loaded": sum(result.loaded.values()),
            "skipped": sum(result.skipped.values()),
            "unsupported": list(result.unsupported.keys()),
        },
        schemas_url="/api/v1/schemas/v1",
    )

def wire_to_otx(wire: ModelTreeWire, original_otx_path: Path | None = None) -> str:
    # 1. Wire zurück in einen PSimulator dekomponieren — über OtxLoader-Pfad,
    #    indem wir die Wire-Repräsentation als OtxFile reconstruieren.
    otx_file = reconstruct_otx_file_from_wire(wire)
    instances = ... # rebuild via OtxLoader
    sim = instances[0]

    # 2. PSimulator → OTX-Text via vorhandenen Writer.
    original = parse_otx_file(original_otx_path) if original_otx_path else None
    return dump_simulator_to_otx(sim, original_otx=original, instances=instances)
```

> **Wichtige Implementierungs-Frage für die Plan-Phase:** Statt einen kompletten "wire → PSimulator → OTX"-Hin-und-Rück-Pfad zu bauen, könnte das Backend einen **direkten Wire-→-OTX-Schreiber** implementieren (Wire-Format ist bereits OTX-isomorph). Das spart den OTX-Loader-Trip beim Save-Back und ist robust gegen Loader-Coverage-Lücken. **Empfehlung: erst OtxLoader-Roundtrip messen (Welle 0); wenn Coverage stabil → über OtxLoader; wenn Coverage-Lücken zuschlagen → Wire-zu-OTX-Direkt-Writer im Backend.**

### Pattern 4: Sidebar-Tree-Aufbau

Tree-Hierarchie aus dem Wire-Format ableiten (NICHT API-side berechnen — Frontend hat alle Daten):

```typescript
// portal/src/sidebar/tree-builder.ts
import type { ModelTreeWire, ModelObject } from "@/lib/octrl-types";
import type { NodeApi } from "react-arborist";

interface TreeNode {
  id: string;            // "oid:42" — react-arborist braucht string-IDs
  oid: number;
  klass: string;
  label: string;         // aus attrs.m_sName ?? `${klass} (${oid})`
  children?: TreeNode[];
}

export function buildTree(wire: ModelTreeWire): TreeNode[] {
  const sim = wire.objects[wire.simulator_oid];
  return [
    {
      id: `oid:${sim.oid}`, oid: sim.oid, klass: sim.klass, label: "Modell",
      children: [
        groupNode("Auslöser", findByKlass(wire, "PAslEinzel"), wire),
        groupNode("Durchlaufpläne", findByKlass(wire, "PDurchlaufplan"), wire,
                  /*recurseInto*/ (plan) => [
                    groupNode("Knoten", findKnotenForPlan(wire, plan), wire),
                    groupNode("Kanten", findKantenForPlan(wire, plan), wire),
                  ]),
        groupNode("Belegungsressourcen", findByKlass(wire, "PRessBeleg"), wire),
        groupNode("Mengenressourcen", findByKlass(wire, "PRessMenge"), wire),
        groupNode("Personalgruppen", findByKlass(wire, "AGruppe"), wire),
        groupNode("Einsatzwünsche", findByKlass(wire, "AEinsatzWunsch"), wire),
      ],
    },
  ];
}
```

### Pattern 5: GraphObject-Basis für PDurchlaufplanViewer-Design (Phase-1-Mini-Schnitt)

**Was aus GraphObj.h für Phase 1 wirklich nötig ist:**

Aus dem ~2913 Zeilen langen `GraphObj.h` braucht Phase 1 nur die **konzeptionellen Basisklassen**:

| C++-Klasse | Phase-1-TS-Klasse | Zweck |
|------------|-------------------|-------|
| `GObject` | `GObject` | Basis-Knoten mit `id`, `position {x,y}`, `size {w,h}`, `state`, `string` (Label), Farben |
| `GObjLink` (extends `GObject`) | `GObjLink` | Knoten mit `prev[]`, `next[]` Link-Listen |
| `GLink` (extends `GObject`) | `GLink` | Kante mit `from: GObjLink`, `to: GObjLink`, Richtungen (`GLDirection`-Enum, 16 Werte) |

**Was NICHT in Phase 1 portiert wird** (alles für Phase 4):
- `GLinkPoint` / `GLinkSquare` (Multi-Waypoint-Kanten mit Editier-Handles)
- `GObjSub` / `GObjAlt` / `GObjRuecksprung` (hierarchische Sub-Container)
- `OGraphView` (4-Layer-Container Background/Grid/Links/Foreground)
- `OGraphList` (free-positioning Container)
- `OGraphGrid` / `OGGridAlt` / `OGGridCtrl` / `OGGridRuecksprung` (Grid-Container mit Spalten/Zeilen-Operationen)
- `OGBlock` (Block-Operationen für Copy/Paste)
- `GraphObjCtrl` (das umschließende Win32-Control)
- `CheckRegion()` Hit-Tests (React Flow macht das selbst)
- `Phantom`-Drawing (Drag-Preview, React Flow macht das selbst)
- `4-Layer-Drawing` (Background/Grid/Links/Foreground, React Flow macht das selbst)

**Mapping auf React Flow:**

```typescript
// portal/src/graph/core/GObject.ts
export interface GObject {
  id: string;                     // entspricht oid als string
  type: "konstant" | "alternativ" | "speicher" | "ausloeser" | "kante";  // CustomNode-Type
  position: { x: number; y: number };  // VirtRect + GOrg aus C++ flach
  data: {
    label: string;                // entspricht m_string
    state?: "idle" | "busy" | "blocked";  // entspricht GObjState (für Phase-4-Animation)
    backColor?: string;
    textColor?: string;
    viewedOid: number;            // Rückreferenz auf ModelObject
  };
}

// portal/src/graph/core/ReactFlowAdapter.tsx
import { ReactFlow, type Node, type Edge } from "@xyflow/react";

interface DurchlaufplanGraph {
  nodes: GObject[];
  links: GLink[];
}

export function PDurchlaufplanGraphRenderer({ plan, store }: Props) {
  const graph = useMemo(() => buildGraph(plan, store), [plan, store]);
  const reactFlowNodes: Node[] = graph.nodes.map(n => ({
    id: n.id,
    type: "osim",          // ein einziger CustomNode-Component, schaltet intern
    position: n.position,
    data: n.data,
  }));
  const reactFlowEdges: Edge[] = graph.links.map(l => ({
    id: l.id,
    source: l.from,
    target: l.to,
    type: "smoothstep",
  }));

  return (
    <ReactFlow
      nodes={reactFlowNodes}
      edges={reactFlowEdges}
      nodeTypes={{ osim: OsimCustomNode }}
      onNodeDragStop={(_, node) => store.patchPosition(node.id, node.position)}
      onConnect={(c) => store.createKante(c.source!, c.target!)}
      fitView
    />
  );
}
```

**Realismus-Hinweis:** Drag-and-Drop-Knoten-Hinzufügen (aus einer Palette neben dem Canvas) ist ein **separater Feature-Block**. Wenn Aufwand der Phase 1 knapp wird → in Phase 4 verschieben. Phase 1 reicht "Doppelklick auf Plan in Sidebar → Design-Viewer öffnet sich (read-only der Topologie) + Knoten-/Kanten-Anlegen via Toolbar-Buttons". Das ist der pragmatische MVP.

### Anti-Patterns to Avoid

- **Anti-Pattern: 1:1 MFC-Routing-Port.** Den 5-stufigen Command-Routing-Mechanismus (`OViewCommand` → `OnCommandDeep` → `OnCommand` → `OViewCommand` → `OnCommand`) in TypeScript nachzubauen wäre Verschwendung und führt zu Bug-Prone-Code. React's Event-Delegation reicht; Commands sind reine Action-Dispatcher.
- **Anti-Pattern: Engine-Pydantic-Wrapper.** Versuche NICHT, alle Engine-Klassen in Pydantic-Modelle zu wrappen. Die Engine ist explizit plain Python (siehe `osim-engine-api.md` §1). Wire-Format und PropertySchema sind die richtigen Abstraktionen.
- **Anti-Pattern: Eigenes Tree-Komponente.** Reinventing react-arborist kostet 2-3 Wochen und liefert weniger Features. Use the library.
- **Anti-Pattern: Komplettes Modell pro Property-Edit ans Backend schicken.** Das Backend kennt KEINE Zwischenstände (D-04). Patches gehen in Zustand-Store → IndexedDB-Snapshot → 30s-Auto-Save mit gesamtem Tree.
- **Anti-Pattern: Synchroner Lock-Acquire im Frontend.** Lock-Acquire MUSS async sein (Server kann ablehnen wenn anderer User lockt). UI muss "Modell wird gerade von X bearbeitet" zeigen können — Lock-Fehler ist Standard-Flow, nicht Edge-Case.
- **Anti-Pattern: search_path im SessionLocal-Constructor setzen.** Muss **pro Request** gesetzt werden (siehe `## Common Pitfalls`).
- **Anti-Pattern: Lock-Lease via In-Memory-Dict (z.B. Python-dict im API-Process).** Bei Multi-Worker (uvicorn `--workers 4`) gibt's keinen geteilten Memory → DB-Row-basiert ist Pflicht.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OTX-Parser | Eigenen Reader/Writer im Backend oder Frontend | `osim_engine.io.otx_loader.load_otx_file()` + `osim_engine.io.otx_writer.dump_simulator_to_otx()` (existiert!) | Engine ist Single Source of Truth; Latin-1-Encoding-Stolperfallen + Two-Pass-Loading sind dort gelöst |
| Virtualized Tree mit DnD | Eigenen Tree mit `@tanstack/react-virtual` + DnD-Kit | `react-arborist` 3.6.1 | Drag-and-Drop + Keyboard-Nav + Aria + Inline-Rename + Virtualisierung — wäre 2-3 Wochen Aufwand |
| IndexedDB-Wrapper | `window.indexedDB` direkt nutzen | `dexie` 4.4.2 | Schema-Versioning, Live-Queries, deutlich bessere TS-Types, kleine Bundle-Größe |
| Undo/Redo | Eigenen Command-Stack | `zundo` 2.3.0 (Zustand-Middleware) | <700 Bytes, drop-in für Zustand, ausreichend für Single-Editor (D-13 Lock) |
| Graph-Rendering | SVG-/Canvas-Eigen-Rendering | `@xyflow/react` 12.10.2 | Viewport-Culling, Pan/Zoom, Selection, Connection-Handles — alles dabei |
| Firebase-Auth-Verifikation | JWT manuell parsen + Verify | `firebase-admin` SDK | Token-Refresh, Custom-Claims, Revocation-Check |
| Multi-Tenant-Postgres | Row-Level-Security oder JOIN-basiertes Filter | 3fls-Pattern: Schema-per-Tenant + `search_path` per Request | 3fls hat das durchgekämpft; RLS ist Performance-Killer für komplexe Queries |
| Server-Side-OTX-Validierung | Eigene Pydantic-Schemas für ~30 Engine-Klassen | `OtxLoader.coverage_ratio` Check beim Upload | Loader meldet bereits Coverage-Lücken (unsupported/skipped); kein zweites Validierungssystem nötig |
| Color-Picker | Eigene HSL/HEX-Logik | `react-colorful` (4 KB) ODER `@radix-ui/colors` | Bewährt, accessible, klein |
| WebSocket-Skeleton (für Phase 4) | Eigene WS-Reconnection-Logic | (Phase 4 — nicht jetzt) | NICHT in Phase 1 — bewusst out-of-scope |

**Key insight:** Diese Phase hat einen **außergewöhnlich hohen Anteil etablierter Lösungen** für nicht-triviale Probleme. Hand-Roll-Versuche kosten Wochen Aufwand bei schlechterer Qualität.

---

## Runtime State Inventory

> Phase 1 ist **Greenfield** — kein bestehender Code, kein Rename, kein Refactor. Diese Sektion ist hier nur formal anwesend und liefert "keine Items" — was beim Greenfield-Setup wichtig zu wissen ist, ist die **Initial-State-Liste**, die das Setup erzeugt:

| Kategorie | Items (NEU zu erzeugen) | Action |
|----------|--------------------------|--------|
| Stored data | Postgres-DB `osim_ui`, Public-Schema (tenants, users), erstes Tenant-Schema bei erstem Login | Alembic-Migration `001_initial_schema.py` |
| Live service config | Minio-Bucket `osim-ui-dev/`, Firebase-Emulator-Project `osim-dev` | docker-compose.yml stellt bereit |
| OS-registered state | Keine (kein launchd/systemd in Phase 1; alles in Docker) | — |
| Secrets/env vars | `DATABASE_URL`, `FIREBASE_PROJECT_ID`, `FIREBASE_AUTH_EMULATOR_HOST`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `CORS_ORIGINS`, `ENVIRONMENT=dev` | `.env.example` als Template, `.env` gitignored |
| Build artifacts | `osim-engine` als editable-install (`uv pip install -e ../osim-engine/engine`); Vite-Build-Output `portal/dist/` | Bei jedem Engine-Update neu syncen |

---

## Common Pitfalls

### Pitfall 1: search_path-Leak zwischen Requests
**What goes wrong:** Wenn `SET search_path TO "tenant_X"` einmal auf einer Connection läuft und die Connection in den Pool zurück geht, kann der nächste Request mit anderem Tenant den falschen `search_path` sehen — DSGVO-relevanter Data-Leak.
**Why it happens:** Connection-Pool teilt physische Connections; nur `pool_reset_on_return="rollback"` reicht NICHT, weil `SET search_path` außerhalb einer Transaktion permanent persistiert.
**How to avoid:** **Drei-Mechanismen-Kombo:**
1. `SET LOCAL search_path TO "tenant_X"` (NUR innerhalb Transaction gültig — nicht `SET`)
2. Jede Request startet eine Transaction via Dependency-Injection (`get_db()` mit `async with session.begin()`)
3. Connection-Pool-Config: `pool_reset_on_return="rollback"` als Belt-and-Suspenders
**Warning signs:** Test mit zwei Tenants in parallelen Requests → Daten aus Tenant A in Antwort für Tenant B.

### Pitfall 2: Lazy-Tenant-Bootstrap-Race
**What goes wrong:** Zwei parallele Requests vom selben neuen User (z.B. Mobile + Desktop gleichzeitig) → beide laufen in den "Tenant existiert nicht"-Pfad → beide versuchen `CREATE SCHEMA tenant_X` → einer wirft `DuplicateSchema`-Error → User sieht "500 Internal Server Error" bei einem von beiden Login-Requests.
**Why it happens:** "Check-then-create" ist nicht atomar.
**How to avoid:** `CREATE SCHEMA IF NOT EXISTS` + ON CONFLICT für die `users`-Row + Idempotenz-Test in CI:
```python
async def bootstrap_tenant_if_missing(uid: str, email: str):
    tenant_id = f"tenant_{uid}"
    async with engine.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{tenant_id}"'))
        # Run alembic-upgrades against this schema (set search_path then upgrade)
        ...
    async with SessionLocal() as session:
        # ON CONFLICT für users-Insert
        await session.execute(
            text("INSERT INTO users(firebase_uid, email, tenant_id) VALUES(:u,:e,:t) "
                 "ON CONFLICT (firebase_uid) DO NOTHING"),
            {"u": uid, "e": email, "t": tenant_id},
        )
```
**Warning signs:** CI-Test mit `asyncio.gather` zwei parallele `/auth/me`-Calls für gleichen UID → muss beide grün.

### Pitfall 3: Latin-1-Encoding bei OTX-Files
**What goes wrong:** OTX-Reader und Writer lesen/schreiben Latin-1; wenn ein Endpoint UTF-8 reinpipet oder `path.write_text(text)` ohne `encoding="latin-1"` aufruft → Umlaute kaputt → Modell nicht mehr ladbar.
**Why it happens:** OTX-Format ist 1990er-vintage; deutsche Klassen-/Attribut-Werte enthalten `ä/ö/ü/ß/Ä/Ö/Ü`; OtxReader verifiziert das nicht.
**How to avoid:** Immer und explizit:
```python
# Upload-Endpoint
content = await upload_file.read()
text = content.decode("latin-1")
# ... process ...
# Save-back
otx_text = dump_simulator_to_otx(sim, original_otx=original)
await storage.put_object(key=f"v_{ts}.otx", data=otx_text.encode("latin-1"))
```
**Warning signs:** Roundtrip-Test mit Dummy.otx liefert `coverage_ratio < 1.0` oder geänderte Bytes-Größe ohne Edit — fast immer Encoding-Problem.

### Pitfall 4: Single-Editor-Lock — Stale Locks bei Browser-Crash
**What goes wrong:** User schließt Tab abrupt (Browser-Crash, Strg+W aus Versehen); Lock-Row bleibt → niemand kann mehr editieren bis Lock manuell entfernt wird oder TTL (15 min, D-13) abläuft.
**Why it happens:** Locks brauchen eine TTL UND einen Heartbeat-Mechanismus.
**How to avoid:** Drei-Schichten:
1. **DB-Lock-Row** mit `expires_at TIMESTAMP`; jeder Lock-Check prüft `expires_at > NOW()`.
2. **Heartbeat im Browser** alle 30 s: `POST /api/v1/models/{id}/lock/heartbeat` (verlängert `expires_at` auf `NOW() + 60s`).
3. **Cleanup-Endpoint** (oder periodischer Job): `DELETE FROM model_locks WHERE expires_at < NOW()`. Optional: bei jedem `POST /lock`-Versuch zuerst Stale-Locks aus dem Weg räumen.
4. **`beforeunload`-Event** im Browser: bestmöglicher Release-Versuch (sendet `navigator.sendBeacon('/lock/release', ...)`) — best-effort, nicht zuverlässig.

**Schema-Vorschlag:**
```sql
-- tenant_X.model_locks
CREATE TABLE model_locks (
  model_id    UUID PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES public.users(id),
  acquired_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMP NOT NULL,
  token       UUID NOT NULL DEFAULT gen_random_uuid()  -- Heartbeat muss Token mitschicken
);
CREATE INDEX idx_model_locks_expires ON model_locks(expires_at);
```

**Warning signs:** "Modell wird bearbeitet von X" obwohl X längst offline ist.

### Pitfall 5: React-Flow Performance bei vielen Custom-Nodes
**What goes wrong:** Bei großen Modellen (Bosch2_wechseln.otx hat viele Objekte) wird der Design-Viewer laggy beim Pan/Zoom.
**Why it happens:** Custom-Node-Components werden bei jedem Position-Update neu gerendert (Position-State liegt im `nodes`-Array).
**How to avoid:**
- Custom-Node-Components mit `React.memo` umwickeln
- `onConnect`, `onNodeDragStop` etc. mit `useCallback` stabilisieren
- `nodeTypes`-Map außerhalb des Component-Bodies deklarieren (referenz-stabil)
- Viewport-Culling aktivieren: `onlyRenderVisibleElements={true}` ist nicht default
- CSS: keine Schatten/Animationen/Gradienten auf Knoten (Performance-Killer bei n > 100)
[CITED: reactflow.dev/learn/advanced-use/performance]

**Warning signs:** Pan-FPS unter 30 bei Modell mit > 50 Knoten.

### Pitfall 6: Auto-Save 30s + IndexedDB-Race
**What goes wrong:** User editiert Property A → IndexedDB-Snapshot startet (asynchron) → User editiert Property B 100ms später → zweiter Snapshot startet → erster Snapshot ist gerade fertig und überschreibt → 1. Snapshot war veraltet (mit nur Property-A-Änderung), 2. Snapshot ist korrekt (mit beiden). **Aber:** beim Reload wird der letzte (latest-timestamp) gelesen — Glück gehabt. **Risiko:** Wenn die Snapshots in unterschiedlicher Reihenfolge fertig werden, ist nicht garantiert dass der zeitlich-spätere zuletzt geschrieben wird.
**Why it happens:** IndexedDB-Writes sind transaktional, aber zwei parallele Transactions können in beliebiger Reihenfolge committen.
**How to avoid:** Snapshot-Service mit Sequence-Counter + `if-counter-newer-than-stored` Check, ODER serialize alle Snapshot-Writes durch eine in-Memory-Queue (Dexie's `transaction()` API).

**Warning signs:** Reload nach mehreren schnellen Edits → manche Änderungen sind weg.

### Pitfall 7: OTX-Loader-Coverage-Lücken bei Custom-Modellen
**What goes wrong:** `Bosch2_wechseln.otx` (18 MB, real-world) hat möglicherweise Klassen, für die der Loader noch keinen Handler hat (`LoadResult.unsupported`). Diese Objekte gehen verloren beim Roundtrip ohne Pass-Through.
**Why it happens:** Loader hat einen V1-Handler-Satz; nicht alle ~80 OSim-Klassen sind abgedeckt.
**How to avoid:**
- OtxWriter hat `include_unsupported_passthrough=True` als Default (verifiziert in `otx_writer.py`-Docstring). Das schreibt unbekannte Objekte 1:1 aus dem Original durch.
- Wave 0 von Phase 1 ist genau diese Coverage-Messung: Roundtrip-Test mit allen drei Test-Files (Dummy/Fertigungsstruktur1/Bosch2_wechseln) → muss `parse → write → parse` identische OtxFile-Objekte liefern (bytewise-Diff via `otx_diff.py` falls vorhanden).
- Wenn Coverage-Lücken bestehen, sind Optionen: (a) Loader-Handler nachreichen (Engine-Repo), (b) UI weigert sich solche Modelle zu speichern ("dieses Modell kann nicht zurück nach OTX gespeichert werden — Sim-Lauf ja, Modell-Edit nein").

**Warning signs:** `coverage_ratio < 1.0` bei `Bosch2_wechseln.otx`.

### Pitfall 8: TanStack-Router beforeLoad-Guard und Firebase-Auth-Race
**What goes wrong:** `beforeLoad` läuft sofort beim ersten Render; Firebase hat aber das Token noch nicht zurück (Async-Restore via `onAuthStateChanged`). → `context.auth.isLoading === true`, Guard kann nicht entscheiden, leitet defensiv zu `/login` → User sieht Login-Page kurz aufblitzen, dann Redirect zurück.
**Why it happens:** Auth-Init ist asynchron; Router kommt schneller.
**How to avoid:** Im AuthProvider einen `isReady`-Flag (default false, true nach `onAuthStateChanged` Erstaufruf). App rendert NULL/Spinner solange `!isReady`. RouterProvider wird erst gemountet wenn `isReady`. 3fls-Pattern hat das gelöst — copy paste von `auth-provider.tsx`.

**Warning signs:** Flicker beim ersten Page-Load.

### Pitfall 9: Firebase-Emulator-Connection in Production
**What goes wrong:** `firebase.ts` aus 3fls connectet sich in Dev zum Emulator (Env-Var `VITE_FIREBASE_AUTH_EMULATOR_HOST`); wenn die Env-Var in Production gesetzt ist (z.B. durch Copy-Paste-Fehler), wird Production gegen den Emulator authentifiziert.
**Why it happens:** Emulator-Connect ist Opt-In via Env-Var.
**How to avoid:** Production-Deploy-Check: `assert os.getenv("FIREBASE_AUTH_EMULATOR_HOST") is None`. Bei Cloud-Build in Phase 5 als Pre-Deploy-Step.

**Warning signs:** Production-User loggen sich ein mit beliebigen Credentials.

### Pitfall 10: Engine-Singleton-Verletzung beim Backend (nicht Phase-1-akut, aber Pflicht-Bewusstsein)
**What goes wrong:** Backend ruft `load_otx_file()` mehrfach parallel im selben Worker-Prozess. Solange NUR Reader/Writer benutzt werden (keine `sim.start()`), ist das **harmlos** — der LCG-Singleton ist nur für Sim-Läufe relevant. ABER: Wenn jemand "schnell mal" einen Sim-Lauf im API-Process startet → katastrophale Singleton-Verletzung.
**Why it happens:** Engine-API ist Modul-Level-State (`s_verteil`).
**How to avoid:** In Phase 1 strikt **kein `sim.start()` im API-Process**. Konvention im Code dokumentieren. Lint-Rule wäre nice-to-have (Phase 2+).

**Warning signs:** Determinismus-Tests in Phase 2+ schlagen fehl.

---

## Code Examples

### Example 1: TenantAuthMiddleware mit Lazy-Bootstrap

```python
# Source: angelehnt an tbx_stzrim/app/auth/middleware.py + bootstrap-Erweiterung
# app/auth/middleware.py
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from app.auth.firebase import verify_token
from app.services.auth_service import bootstrap_tenant_if_missing

WHITELIST = {"/health", "/readiness", "/docs", "/openapi.json", "/redoc"}

class TenantAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if request.url.path in WHITELIST:
            return await call_next(request)
        auth = request.headers.get("authorization", "")
        if not auth.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"type":"about:blank","title":"Missing token","status":401},
            )
        try:
            claims = verify_token(auth.removeprefix("Bearer "))
        except Exception as e:
            return JSONResponse(
                status_code=401,
                content={"type":"about:blank","title":"Invalid token","status":401,"detail":str(e)},
            )
        # Lazy-Bootstrap: wenn kein tenant_id im Token → bootstrappen + Token-Refresh hinten
        tenant_id = claims.get("tenant_id")
        if not tenant_id:
            tenant_id = await bootstrap_tenant_if_missing(
                uid=claims["uid"], email=claims.get("email", ""),
            )
        request.state.tenant_id = tenant_id
        request.state.user_uid = claims["uid"]
        request.state.user_email = claims.get("email", "")
        request.state.user_role = claims.get("role", "user")
        return await call_next(request)
```

### Example 2: get_db Dependency mit SET LOCAL search_path

```python
# Source: angelehnt an tbx_stzrim/app/core/database.py, verschärft mit SET LOCAL
# app/core/database.py
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import text
from fastapi import Request

engine = create_async_engine(
    settings.database_url,            # postgresql+asyncpg://...
    pool_size=20, max_overflow=10,
    pool_pre_ping=True,
    pool_reset_on_return="rollback",
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def get_db(request: Request):
    tenant_id = request.state.tenant_id
    # Quote-Safe: tenant_id ist immer "tenant_{uuid}" — assertion zur Sicherheit
    assert tenant_id.replace("_","").replace("-","").isalnum(), f"Invalid tenant_id {tenant_id!r}"
    async with SessionLocal() as session:
        async with session.begin():
            await session.execute(text(f'SET LOCAL search_path TO "{tenant_id}", public'))
            yield session
```

### Example 3: Single-Editor-Lock Endpoint mit Heartbeat

```python
# Source: eigener Entwurf basierend auf Common-Pitfalls-Analyse oben
# app/api/v1/locks.py
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from app.auth.dependencies import get_user_uid
from app.core.database import get_db

router = APIRouter()

@router.post("/models/{model_id}/lock", response_model=LockOut)
async def acquire_lock(model_id: UUID, user_uid: str = Depends(get_user_uid),
                       db: AsyncSession = Depends(get_db)):
    now = datetime.utcnow()
    expires = now + timedelta(seconds=60)  # initial; Heartbeat verlängert
    # Stale-Cleanup zuerst
    await db.execute(text(
        "DELETE FROM model_locks WHERE model_id = :mid AND expires_at < :now"
    ), {"mid": model_id, "now": now})
    # Try-Insert (Primary-Key-Conflict = jemand anderes hat Lock)
    try:
        result = await db.execute(text("""
            INSERT INTO model_locks(model_id, owner_user_id, expires_at)
            VALUES (:mid, (SELECT id FROM public.users WHERE firebase_uid = :uid), :exp)
            RETURNING token, expires_at
        """), {"mid": model_id, "uid": user_uid, "exp": expires})
        row = result.one()
        return LockOut(token=row.token, expires_at=row.expires_at)
    except IntegrityError:
        # Konflikt: zeige wer lockt
        owner = await db.execute(text("""
            SELECT u.email, l.expires_at
            FROM model_locks l JOIN public.users u ON u.id = l.owner_user_id
            WHERE l.model_id = :mid
        """), {"mid": model_id})
        r = owner.one_or_none()
        raise HTTPException(409, detail={
            "type": "about:blank", "title": "Model already locked",
            "status": 409, "owner_email": r.email if r else "unknown",
            "lock_expires_at": r.expires_at.isoformat() if r else None,
        })

@router.post("/models/{model_id}/lock/heartbeat")
async def heartbeat_lock(model_id: UUID, body: HeartbeatIn,
                         user_uid: str = Depends(get_user_uid),
                         db: AsyncSession = Depends(get_db)):
    new_expires = datetime.utcnow() + timedelta(seconds=60)
    result = await db.execute(text("""
        UPDATE model_locks
        SET expires_at = :exp
        WHERE model_id = :mid AND token = :tok
          AND owner_user_id = (SELECT id FROM public.users WHERE firebase_uid = :uid)
        RETURNING expires_at
    """), {"mid": model_id, "tok": body.token, "exp": new_expires, "uid": user_uid})
    row = result.one_or_none()
    if not row:
        raise HTTPException(404, detail="Lock not held by you or expired")
    return {"expires_at": row.expires_at}

@router.delete("/models/{model_id}/lock")
async def release_lock(model_id: UUID, token: UUID,
                       user_uid: str = Depends(get_user_uid),
                       db: AsyncSession = Depends(get_db)):
    await db.execute(text("""
        DELETE FROM model_locks
        WHERE model_id = :mid AND token = :tok
          AND owner_user_id = (SELECT id FROM public.users WHERE firebase_uid = :uid)
    """), {"mid": model_id, "tok": token, "uid": user_uid})
    return {"ok": True}
```

### Example 4: ModelStore mit Zustand + zundo + Immer

```typescript
// Source: zundo-Docs (github.com/charkour/zundo) + Zustand v5 Patterns
// portal/src/stores/model-store.ts
import { create } from "zustand";
import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import type { ModelTreeWire, ModelObject } from "@/lib/octrl-types";

interface ModelStore {
  wire: ModelTreeWire | null;
  selection: number | null;
  dirty: boolean;
  loadFromWire: (wire: ModelTreeWire) => void;
  selectObject: (oid: number | null) => void;
  patchObject: (oid: number, patch: Record<string, unknown>) => void;
  deleteObject: (oid: number) => void;
  createObject: (klass: string, attrs: Record<string, unknown>) => number;
  resetDirty: () => void;
}

export const useModelStore = create<ModelStore>()(
  temporal(
    immer((set, get) => ({
      wire: null, selection: null, dirty: false,
      loadFromWire: (wire) => set((s) => {
        s.wire = wire; s.dirty = false; s.selection = wire.simulator_oid;
      }),
      selectObject: (oid) => set((s) => { s.selection = oid; }),
      patchObject: (oid, patch) => set((s) => {
        if (!s.wire) return;
        Object.assign(s.wire.objects[oid].attrs, patch);
        s.dirty = true;
      }),
      deleteObject: (oid) => set((s) => {
        if (!s.wire) return;
        delete s.wire.objects[oid];
        // sub_refs in anderen Objekten bereinigen
        for (const obj of Object.values(s.wire.objects)) {
          obj.sub_refs = obj.sub_refs.map(list => list.filter(id => id !== oid));
        }
        s.dirty = true;
      }),
      createObject: (klass, attrs) => {
        let newOid = 0;
        set((s) => {
          if (!s.wire) return;
          newOid = Math.max(...Object.keys(s.wire.objects).map(Number)) + 1;
          s.wire.objects[newOid] = { oid: newOid, klass, attrs, sub_refs: [] };
          s.dirty = true;
        });
        return newOid;
      },
      resetDirty: () => set((s) => { s.dirty = false; }),
    })),
    {
      // zundo-Config — siehe github.com/charkour/zundo
      limit: 100,
      partialize: (state) => ({ wire: state.wire }), // nur wire in History; Selection ist UI
      equality: (a, b) => JSON.stringify(a.wire) === JSON.stringify(b.wire),  // teuer; OK für Phase 1 mit <1MB Models
    },
  ),
);

// Undo/Redo aus jedem Component:
// const { undo, redo, futureStates, pastStates } = useModelStore.temporal.getState();
```

### Example 5: IndexedDB-Snapshot mit Dexie

```typescript
// Source: dexie-Docs (dexie.org) + Best-Practices für Snapshot-Pattern
// portal/src/snapshot/db.ts
import Dexie, { type Table } from "dexie";
import type { ModelTreeWire } from "@/lib/octrl-types";

interface SnapshotRow {
  modelId: string;
  timestamp: number;
  sequence: number;       // monotonic counter, schützt vor Race aus Pitfall 6
  wire: ModelTreeWire;
}

class OsimDB extends Dexie {
  snapshots!: Table<SnapshotRow, [string, number]>;  // compound key (modelId, timestamp)
  constructor() {
    super("OsimUiDB");
    this.version(1).stores({
      snapshots: "[modelId+timestamp], modelId, sequence",
    });
  }
}
export const db = new OsimDB();

// portal/src/snapshot/snapshot-service.ts
let seq = 0;
export async function saveSnapshot(modelId: string, wire: ModelTreeWire): Promise<void> {
  const mySeq = ++seq;
  await db.snapshots.put({
    modelId,
    timestamp: Date.now(),
    sequence: mySeq,
    wire: structuredClone(wire),
  });
  // Cleanup: nur die letzten 20 pro Modell behalten
  const all = await db.snapshots.where("modelId").equals(modelId).reverse().sortBy("timestamp");
  if (all.length > 20) {
    await db.snapshots.bulkDelete(all.slice(20).map(s => [s.modelId, s.timestamp]));
  }
}
export async function loadLatestSnapshot(modelId: string): Promise<ModelTreeWire | null> {
  const latest = await db.snapshots
    .where("modelId").equals(modelId)
    .reverse()
    .sortBy("timestamp");
  return latest[0]?.wire ?? null;
}
```

### Example 6: __root.tsx mit Auth-Guard

```typescript
// Source: 1:1 aus tbx_stzrim/portal/src/routes/__root.tsx + _authenticated.tsx
// (siehe copy-paste-guide.md §Routing)
// portal/src/routes/__root.tsx
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { AuthState } from "@/auth/use-auth";

interface RouterContext { auth: AuthState; }

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
});

// portal/src/routes/_authenticated.tsx
import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { AuthenticatedLayout } from "@/components/AuthenticatedLayout";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context }) => {
    if (!context.auth.isReady) return;  // Pitfall 8 — warte auf Auth-Init
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: "/login" });
    }
  },
  component: () => (
    <AuthenticatedLayout>
      <Outlet />
    </AuthenticatedLayout>
  ),
});

// portal/src/routes/_authenticated/models/$id.tsx — Workspace
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/models/$id")({
  component: ModelWorkspace,
});
function ModelWorkspace() {
  const { id } = Route.useParams();
  return (
    <div className="grid grid-cols-[280px_1fr] h-full">
      <ModelSidebar modelId={id} />
      <ViewerFrame />
    </div>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Webpack | Vite | seit ~2022 | Schnellere Dev-Builds; 3fls bereits Vite 7 |
| Redux mit Reducers | Zustand + Immer | seit ~2023 | Boilerplate-Reduktion; Zustand 5 ist current stable |
| React Router | TanStack Router | seit ~2023 | Type-Safe-Routes; 3fls 1:1 |
| Reactflow (alte v11) | @xyflow/react (v12) | 2024 | Org-Umbenennung; v12 mit besserer Performance |
| Eigene WebSocket-Reconnect | (Phase 4 später — `socket.io-client` oder pures Native) | — | Phase-1-irrelevant |
| Class-Components | Hooks | seit React 16.8 (2019) | OViewer-Foundation als TS-Klassen ist Hybrid-Wahl, nicht Anti-Pattern |
| Manuelle JWT-Verify | Firebase Admin SDK | etabliert | 3fls 1:1 |

**Deprecated/outdated:**
- `reactflow` (npm-Paket) → ersetzt durch `@xyflow/react`
- `python-dotenv` allein → `pydantic-settings` für strukturierte Configs (3fls hat Mischform)
- `psycopg2` → `psycopg` v3 oder `asyncpg` (asyncpg für async-Pfade)

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Browser-Rendering von ~50 Knoten in React Flow ist performant genug ohne Canvas | Pattern 5 (GraphObject), Common Pitfalls #5 | Bei großen Real-Modellen (Bosch2_wechseln) Lag — Fallback wäre `onlyRenderVisibleElements` + ggf. Canvas-Backend (Phase 4 entscheiden) |
| A2 | shadcn deckt 7 von 9 OCtrls 1:1 (Color/Font selbst); Combobox in shadcn ist ausgereift genug für OCtrlLink | Pattern 2 (OCtrl-Mapping) | Wenn Combobox-Async-Suche limitiert: ggf. `cmdk` direkt nutzen (shadcn baut darauf auf) |
| A3 | `react-arborist` 3.6.1 ist API-stabil und production-ready | Standard Stack | Falls breaking changes in nächster Major: kleines Adapter-Layer um die Lib (insulating) |
| A4 | OTX-Writer-Coverage genügt für Dummy.otx und Fertigungsstruktur1; Bosch2_wechseln eventuell unsicher | Common Pitfalls #7, Wave 0 | Wenn Bosch2 nicht roundtrip-stable: Phase 1 weniger Test-Coverage, Loader-Handlers in osim-engine nachreichen als Backlog |
| A5 | Lazy-Tenant-Bootstrap via "Schema-existiert-nicht-Check" + Alembic-upgrade ist robust gegen Race | Pitfall #2 | Wenn Race auftritt: Lock-Tabelle in public-Schema als Bootstrap-Mutex (jeder neue Tenant claimt Lock-Row vor CREATE SCHEMA) |
| A6 | Auth-Tokens haben Custom-Claims `tenant_id` und `role` nach Bootstrap; werden auf Frontend-Refresh sichtbar | Code Example 1, Pattern Auth-Fluss | Wenn Custom-Claims-Propagation langsam: Lookup gegen `public.users` als Fallback im Middleware |
| A7 | "Cancellation" eines laufenden Auto-Saves (User editiert, Save startet, User editiert weiter) ist NICHT in Phase 1 nötig — letzter Save gewinnt | Pattern 3 (Save-Choreographie) | Bei vielen Edits pro Sekunde: AbortController auf fetch + Debounce neuer Save bis 2s nach letztem Edit |
| A8 | Engine-Pfad in osim-ui ist `../osim-engine/engine` (NICHT `../osim-engine`); osim-engine hat Monorepo-Layout mit `engine/` Sub-Folder | Project Structure, Don't Hand-Roll | Wenn osim-engine-Repo-Layout sich ändert: `pyproject.toml`-Editable-Pfad anpassen |
| A9 | `dexie-react-hooks` als optional add-on bei Bedarf — Phase 1 kommt vermutlich ohne aus | Standard Stack (Supporting) | Wenn Live-Snapshot-Display gewünscht: ergänzen |
| A10 | Sidebar-Tree hat max ~500 Top-Level-Knoten in realistischen Modellen → Virtualisierung greift, aber Drag-and-Drop muss nicht 10.000+ unterstützen | Pattern 4 (Sidebar) | Bei größeren Modellen: Lazy-Load von Sub-Hierarchien (Phase 2+) |

---

## Open Questions

1. **OTX-Writer-Coverage für reale Modelle — Wie weit reicht der bestehende Writer?**
   - Was wir wissen: `otx_writer.py` existiert, hat `dump_simulator_to_otx`, Pass-Through-Default; Loader hat V1-Handler.
   - Was unklar: ob `Bosch2_wechseln.otx` roundtrip-stable ist (Coverage 100% nach Loader+Writer)
   - Recommendation: **Wave 0 wird ein Coverage-Bericht.** Skript `python -m osim_engine.io.otx_diff Dummy.otx` (existiert vermutlich), `Fertigungsstruktur1_mit_AslFj.otx`, `Bosch2_wechseln.otx` als Smoke/Realismus/Stress-Suite. Nur Files mit `coverage_ratio == 1.0` UND `diff(parse_otx_file(write(load(f))), parse_otx_file(f))` == leer sind Phase-1-supported.

2. **PropertySchema — Wie wird initial-erzeugt?**
   - Was wir wissen: Phase 3 etabliert Engine-Reflection-Schema.
   - Was unklar: Schreiben wir in Phase 1 das Schema hand (für die 12 Viewer-relevanten Klassen), oder gibt es bereits ein `python -m osim_engine.schema dump`-Skelett?
   - Recommendation: **Hand-Schreiben für Phase 1.** Im Code als `app/static/schemas/v1.json`. ~15 Klassen × ~15 Properties = ~225 Property-Definitionen. Aufwand: ~1 Personentag. Phase 3 ersetzt das durch Reflection. **Plan-Phase entscheidet, ob das in den Engine-Repo gehört (E2.1-E2.6 vorziehen) oder ins UI-Repo.**

3. **Reichen 12 Viewer für "vollständige Modellierung"?**
   - Was wir wissen: CONTEXT.md D-08 listet 12, ROADMAP.md SC-04 fordert sie.
   - Was unklar: ob beim Bearbeiten von z.B. PRessBeleg-Sub-Properties (Verteilungen, Kostensätze) zusätzliche generische Property-Editoren entstehen müssen, die in den 12 Viewern noch nicht abgedeckt sind.
   - Recommendation: **PGObjBaseViewer ist der Catch-All.** Jeder nicht explizit registrierte Objekt-Typ landet im Generic-Viewer (Property-Liste rendert alle OCtrls aus PropertySchema). Damit deckt Phase 1 100% der Klassen ab (mit unterschiedlicher Bedien-Qualität). Wave-Aufteilung: 5 wichtigste Viewer in Welle 4a, restliche 7 + PGObjBase in Welle 4b.

4. **Design-Viewer (PDurchlaufplanViewerDesign) — Read-only oder Edit-fähig in Phase 1?**
   - Was wir wissen: D-10 "Vollständige Edit-Operationen"; ROADMAP-SC-04 fordert graphischer Viewer "via GraphObject + React Flow".
   - Was unklar: ob "Anlegen / Löschen / Verknüpfen" im graphischen Viewer drag-and-drop sein muss oder über Toolbar-Buttons ("Knoten hinzufügen" → Modal → Klick auf Canvas-Position).
   - Recommendation: **MVP-Variante:** Toolbar-Buttons + Klick auf Canvas-Position für Add; Selection + Delete-Button für Remove; Connection-Handles auf Knoten-Rändern für Edge-Drawing (React-Flow eingebaut). Vollständig-Variante (Drag-and-Drop aus Palette neben Canvas) → Backlog Phase 4. **Plan-Phase entscheidet.**

5. **Storage-Backend für Dev — Minio oder Filesystem?**
   - Was wir wissen: 3fls produktiv-GCS; lokal nicht explizit dokumentiert.
   - Was unklar: ob `docker compose` immer Minio mitstartet oder ob Filesystem-Fallback existiert.
   - Recommendation: **Minio im docker-compose, Storage-Abstraktion in `app/services/storage.py` mit drei Backends:** `local`, `minio`, `gcs`. Env-Var `STORAGE_BACKEND` schaltet. Dev-Default = `minio`. CI-Default = `local` (kein extra Container).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.13 | Backend | ✓ (laut 3fls-Stack — zu verifizieren auf Dev-Maschine) | — | Python 3.12 (Engine erlaubt ≥3.12) |
| uv (Package-Manager) | Backend | ✓ (CLAUDE.md `uv sync`) | — | `pip` als Notnagel |
| Node.js ≥20 | Frontend | ✓ (3fls-Stack) | — | — |
| npm | Frontend | ✓ | — | pnpm wäre möglich, aber 3fls nutzt npm |
| Docker + docker compose | Dev-Environment | ✓ (`docker compose up` in CLAUDE.md) | — | Lokale Postgres + Java-Firebase-Emulator als Standalone-Install |
| osim-engine (editable) | Backend | ✓ (Subfolder `engine/` im Workspace) | v0.2.0-dev | — |
| postgres:17 | Dev-DB | (Docker-Image) | 17 | postgres:16 als Fallback |
| firebase-tools | Auth-Emulator | (Docker-Image über node:20) | latest | Standalone-Install (`npm install -g firebase-tools`) |
| minio | Object Storage | (Docker-Image) | latest | Filesystem-Fallback in `app/services/storage.py` |
| ruff, pytest | Backend-Dev | (uv sync installiert) | 0.8+, 8+ | — |
| Playwright | E2E-Tests | (npm install) | latest | Cypress oder reine Vitest+Komponente-Tests als Fallback (weniger E2E-Coverage) |
| Vitest | Frontend-Unit-Tests | (3fls-Standard via vite) | latest | Jest (Mehraufwand) |

**Missing dependencies with no fallback:** keine.

**Missing dependencies with fallback:**
- ggf. Playwright-Setup ist neu für osim-ui (3fls nutzt es nicht explizit dokumentiert) → Plan-Phase entscheidet ob Phase 1 E2E-Coverage braucht oder Vitest-Komponenten-Tests reichen.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Backend Framework | pytest 8+ + pytest-asyncio 0.25+ + httpx 0.28+ (AsyncClient) |
| Backend Config | `pyproject.toml` `[tool.pytest.ini_options]` mit `asyncio_mode = "auto"`, `testpaths = ["tests/backend"]` |
| Backend Quick-Run | `uv run pytest tests/backend -x` |
| Backend Full-Suite | `uv run pytest` |
| Frontend Framework | Vitest (Komponenten/Units) + Playwright (E2E) |
| Frontend Config | `portal/vitest.config.ts` + `portal/playwright.config.ts` |
| Frontend Quick-Run | `cd portal && npm run test:unit -- --run` |
| Frontend Full-Suite | `cd portal && npm run test:unit && npm run test:e2e` |
| Engine-Roundtrip | `uv run pytest tests/backend/test_otx_roundtrip.py -x` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SC-01 | `docker compose up` startet alle Services healthy | smoke | `docker compose up -d && ./scripts/wait-healthy.sh && docker compose ps` | ❌ Wave 0 |
| SC-02 | Lazy Tenant-Bootstrap idempotent | integration | `pytest tests/backend/test_auth.py::test_lazy_bootstrap_parallel -x` | ❌ Wave 0 |
| SC-03 | OTX-Upload → JSON-Tree → Sidebar-Hierarchie | integration | `pytest tests/backend/test_models_upload.py::test_dummy_otx_upload -x` | ❌ Wave 0 |
| SC-04 (a-l) | 12 konkrete Viewer rendern ohne Error | unit (Vitest) | `cd portal && npm run test:unit -- viewers/` | ❌ Wave 0 |
| SC-05 (a-i) | 9 OCtrl-Components verhalten sich korrekt | unit (Vitest) | `cd portal && npm run test:unit -- octrl/` | ❌ Wave 0 |
| SC-06 | Edit-Operationen patchen Wire-Store korrekt + Undo | unit (Vitest) | `cd portal && npm run test:unit -- stores/model-store.spec.ts` | ❌ Wave 0 |
| SC-07 | Auto-Save 30s + manuell + IndexedDB + Lock | e2e (Playwright) | `cd portal && npm run test:e2e -- save-strategy.spec.ts` | ❌ Wave 0 |
| SC-08 | Save-back = neue OTX-Version; Original unverändert | integration | `pytest tests/backend/test_models_save.py::test_save_creates_new_version -x` | ❌ Wave 0 |
| SC-09 | Multi-Tenant — kein search_path-Leak | integration | `pytest tests/backend/test_auth.py::test_search_path_isolation -x` | ❌ Wave 0 |
| Engine-Coverage | OTX-Roundtrip für Dummy/Fertigungsstruktur1/Bosch2 | integration | `pytest tests/backend/test_otx_roundtrip.py -x` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `uv run pytest tests/backend/test_<module>.py -x` (≤10 s) + `cd portal && npm run test:unit -- <related-folder>` (≤30 s)
- **Per wave merge:** `uv run pytest tests/backend` + `cd portal && npm run test:unit` (≤2 min)
- **Phase gate (vor /gsd-verify-work):** Full suite green inkl. E2E (`npm run test:e2e`)

### Wave 0 Gaps

- [ ] `tests/backend/conftest.py` — fixtures für isolated test-DB (per-test schema), httpx-AsyncClient mit Mocked Firebase-Token
- [ ] `tests/backend/test_auth.py` — Lazy-Bootstrap + Idempotenz + search_path-Isolation
- [ ] `tests/backend/test_models_upload.py` — OTX-Upload-Endpoint, Coverage-Report
- [ ] `tests/backend/test_models_save.py` — Save-back + Versioning + Original-Unchanged-Check
- [ ] `tests/backend/test_lock.py` — Acquire + Heartbeat + Stale-Cleanup + Conflict
- [ ] `tests/backend/test_otx_roundtrip.py` — Coverage-Suite für Dummy/Fertigungsstruktur1/Bosch2
- [ ] `portal/vitest.config.ts` + Test-Setup mit Mocked AuthProvider
- [ ] `portal/src/viewers/core/__tests__/` Skeleton mit Snapshot-Tests pro OCtrl
- [ ] `portal/src/stores/__tests__/model-store.spec.ts`
- [ ] `portal/playwright.config.ts` + `portal/e2e/modeling-flow.spec.ts`
- [ ] `pyproject.toml` Test-Section + `package.json` Test-Scripts
- [ ] `scripts/wait-healthy.sh` (60-s-Timeout) für docker-compose-health

*Framework-Install: nicht nötig — pytest/httpx/vitest/playwright sind in 3fls-Templates inkludiert.*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Firebase Auth (Email/Google); 3fls-Auth-Provider 1:1 |
| V3 Session Management | yes | Firebase-ID-Token (Short-lived ~1h, auto-refresh); kein eigenes Session-Cookie |
| V4 Access Control | yes | Tenant-Isolation via Schema-per-Tenant (`search_path`); Lock-Endpoints prüfen Owner; Read-Only-Mode wenn anderer User lockt |
| V5 Input Validation | yes | Pydantic-Schemas auf allen Endpoints; OTX-Upload mit MIME-Check + Größenlimit (30 MB) + Latin-1-Decode |
| V6 Cryptography | partial | Firebase-Custom-Token-Signing via Admin-SDK; HTTPS in Prod via Cloud Run; KEINE eigene Crypto-Logik |
| V7 Error Handling | yes | RFC 7807 ProblemDetail; structlog mit redacted credentials; keine Stack-Traces in Prod-Antworten |
| V8 Data Protection | yes | DB-Encryption at-rest (Postgres im Container; in Cloud-Phase 5 mit CMEK); Storage-Encryption at-rest (Minio + GCS) |
| V9 Communications | yes | HTTPS für API, WSS für späteren WebSocket; lokale HTTP-Auth über Emulator OK |
| V10 Malicious Code | yes | osim-engine als trusted-Modul (eigenes Repo); KEIN dynamisches Eval von User-OTX (Reader ist Text-Parser, kein eval) |
| V11 Business Logic | yes | Single-Editor-Lock verhindert Save-Konflikte; Versionierung verhindert Datenverlust |
| V12 Files | yes | Upload-Größenlimit, MIME-Check, separater Storage-Pfad pro Tenant, Signed-URLs für Download (Phase 1: API-Proxy reicht) |
| V13 API & Web Service | yes | Versionierte API (`/api/v1/`), RFC 7807 Errors, CORS-Konfig per Env-Var |
| V14 Configuration | yes | pydantic-settings, `.env`-gitignored, secrets in Secret-Manager (Phase 5) |

### Known Threat Patterns für osim-ui-Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL-Injection via tenant_id (Schema-Switch) | Tampering | Whitelist-Regex (`tenant_id.replace("_","").replace("-","").isalnum()` ASSERT) bevor in raw-SQL-String injiziert; Pydantic-Validator auf tenant_id-Format |
| OTX-Upload als Path-Traversal-Vektor | Tampering / Information Disclosure | Filename wird beim Upload IGNORIERT; Storage-Pfad ist serverseitig generiert (`tenants/{tid}/models/{uuid}/original.otx`) |
| Cross-Tenant-Data-Leak via Bug im search_path-Setup | Information Disclosure | Pitfall #1 — Test mit zwei Tenants gleichzeitig; SET LOCAL statt SET |
| Lock-Bypass via direkter PUT-Request (ohne Lock-Token) | Tampering | Save-Endpoint MUSS Lock-Token im Body/Header validieren; ohne Token → 423 Locked |
| Firebase-Custom-Claim-Forgery | Spoofing | Firebase-Admin-SDK macht Signature-Check; Custom-Claims sind Firebase-signed, nicht client-mutierbar |
| Storage-Bucket-Enumeration | Information Disclosure | Bucket nicht öffentlich; alle Reads über API-Endpoint mit Auth-Check; in Phase 5 Signed-URLs mit kurzer TTL |
| XSS via OTX-Inhalts-Strings (z.B. `m_sName="<script>"`) | Tampering | React escaped automatisch in JSX; KEIN `dangerouslySetInnerHTML` mit User-Content; Pydantic-Schemas validieren keine Code-Tags |
| DoS via mega-OTX-Upload | DoS | Upload-Limit 30 MB im FastAPI-Middleware; Reader-Timeout (Phase 2 mit Worker-Isolation; Phase 1 kann mit Synchron-Upload leben für 30 MB) |
| Stale-Lock-Lockout | Availability | TTL 15 min (D-13) + Heartbeat + Cleanup-Mechanik (Pitfall #4) |
| CORS-Misconfiguration | — | `CORS_ORIGINS` Env-Var; nur `http://localhost:3000` in Dev, exakte Prod-Domain in Prod |

---

## Sources

### Primary (HIGH confidence)
- `C:\Users\JörgWFischer\PycharmProjects\osim-ui\.planning\phases\01-vertical-slice\01-CONTEXT.md` — User-Decisions (D-01 bis D-18)
- `C:\Users\JörgWFischer\PycharmProjects\osim-ui\.planning\PROJECT.md` — sechs Architektur-Eckpfeiler
- `C:\Users\JörgWFischer\PycharmProjects\osim-ui\docs\ARCHITECTURE.md` — Ziel-Architektur (frisch resynchronisiert 2026-05-21)
- `C:\Users\JörgWFischer\PycharmProjects\osim-ui\.planning\research\osim-engine-api.md` — verifizierte Engine-API
- `C:\Users\JörgWFischer\PycharmProjects\osim-ui\.planning\research\3fls-patterns.md` — Stack-Vorlage
- `C:\Users\JörgWFischer\PycharmProjects\osim-ui\.planning\research\copy-paste-guide.md` — Konkrete Files aus tbx_stzrim
- `C:\Users\JörgWFischer\PycharmProjects\osim-ui\.planning\research\osim2004-ui-analysis.md` — UI-Original-Analyse
- `C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\OViewer.h` — gelesen Z.1-540 (Routing, Konzept, Klassen-Hierarchien)
- `C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\OCtrl{Variable,Bool,Enum,Link,List,Method,TabViewer,COLORREF,LOGFONT}.h` — OCtrl-Header für Props-Analyse
- `C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\GraphObj.h` — Basis-Klassen (GObject Z.341, GObjLink Z.533, GLink Z.1004)
- `C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\PSimulatorViewer.h`, `PDurchlaufplanViewer.h`, `PDlplViewerGObj.h`, `PGObjBaseViewer.h`, `PRessBelegMatrixViewer.h` — Viewer-Klassen-Struktur
- `C:\Users\JörgWFischer\PycharmProjects\osim-engine\engine\src\osim_engine\io\otx_writer.py` — verifiziert: `dump_simulator_to_otx` existiert, 1125 Zeilen, mit OtxWriter-Klasse und Pass-Through
- `C:\Users\JörgWFischer\PycharmProjects\osim-engine\engine\src\osim_engine\io\otx_loader.py` — Loader-Architektur (Two-Pass, Class-Registry)
- `C:\Users\JörgWFischer\PycharmProjects\osim-engine\engine\src\osim_engine\io\otx_reader.py` — Format-Doku, OtxObject-Struktur

### Secondary (MEDIUM confidence)
- [npm view zustand version: 5.0.13 (2026-05-05)](https://www.npmjs.com/package/zustand) — verifiziert via WebSearch 2026-05-21
- [npm view @tanstack/react-router version: 1.170.5 (2026-05-20)](https://www.npmjs.com/package/@tanstack/react-router)
- [npm view @tanstack/react-query version: 5.100.11 (2026-05-19)](https://www.npmjs.com/package/@tanstack/react-query)
- [npm view dexie version: 4.4.2 (2026-03)](https://www.npmjs.com/package/dexie)
- [npm view react-arborist version: 3.6.1 (2026-05-21)](https://www.npmjs.com/package/react-arborist)
- [npm view @xyflow/react version: 12.10.2 (2026-03)](https://www.npmjs.com/package/@xyflow/react)
- [npm view zundo version: 2.3.0 (2025)](https://www.npmjs.com/package/zundo)
- [React Flow Performance Guide](https://reactflow.dev/learn/advanced-use/performance) — Memoization-Patterns, Viewport-Culling
- [Dexie vs idb vs RxDB (2026)](https://docs.bswen.com/blog/2026-04-07-indexeddb-libraries-dexie-idb-rxdb/) — Versioning-Vergleich
- [Dexie vs localForage vs idb (2026)](https://www.pkgpulse.com/guides/dexie-vs-localforage-vs-idb-indexeddb-browser-storage-2026)
- [react-arborist Guide (Openreplay)](https://blog.openreplay.com/interactive-tree-components-with-react-arborist/)
- [zundo (github)](https://github.com/charkour/zundo)
- [Undo/Redo Pattern Analysis](https://dev.to/unadlib/rethinking-undoredo-why-we-need-travels-2lcc)
- [PostgreSQL Explicit Locking (offiziell)](https://www.postgresql.org/docs/current/explicit-locking.html)
- [FastAPI + SQLAlchemy 2.0 Production Patterns (Mar 2026)](https://medium.com/@rosewabere/building-a-production-grade-async-backend-with-fastapi-sqlalchemy-postgresql-and-alembic-062280264d28)
- [Distributed Locking mit Redis/FastAPI](https://medium.com/@cy960518/simple-distributed-locking-with-redis-and-fastapi-afdb10f7423d) — Phase 1 wählt DB-Lock, aber Pattern-Referenz für TTL+Heartbeat

### Tertiary (LOW confidence)
- (keine Phase-1-Aussagen ruhen ausschließlich auf einer einzigen unverifizierten Quelle)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 3fls-Stack ist verifiziert + npm-Versionen direkt geprüft.
- Architecture: HIGH — OViewer.h, GraphObj.h, Viewer-Header direkt gelesen; OCtrl-Mapping aus Direkt-Inspektion.
- OTX-Pipeline: HIGH — `otx_writer.py` und `otx_loader.py` direkt inspiziert; `dump_simulator_to_otx` existiert.
- Save-Lock-Pattern: MEDIUM — PostgreSQL-Lock-Pattern Standard, aber konkrete Heartbeat-TTL-Strategie ist Entwurf (nicht aus existierendem Code übernommen).
- Undo-Strategie: MEDIUM — zundo ist bewährt, aber Phase-1-Skalierung mit `equality: JSON.stringify` ist Performance-Risiko bei großen Modellen.
- Pitfalls: HIGH — direkt aus Erfahrung mit FastAPI/PostgreSQL/Firebase + dokumentierte Engine-Constraints.

**Research date:** 2026-05-21
**Valid until:** 2026-06-21 (npm-Versionen schnell-bewegt; Engine-Strukturen stabil für Quartal)

---

## Project Constraints (from CLAUDE.md)

Aus `osim-ui/CLAUDE.md` extrahiert — der Planner MUSS folgende Direktiven beim Plan-Schreiben beachten:

1. **Drei verwandte Codebasen** (osim-engine, OSim2004, tbx_stzrim) im Workspace — referenziert, nicht kopiert.
2. **Sechs Architektur-Entscheidungen** (PROJECT.md §4) sind festgeschrieben — keine Re-Diskussion in Phase-1-Plan.
3. **Engine-Reproduzierbarkeitsvertrag**:
   - PAWLICEK-LCG ist Modul-Singleton in `osim_engine.core.distribution.s_verteil`
   - → Sim-Läufe NUR in separaten OS-Prozessen (Phase-1-relevant: **kein `sim.start()` im API-Process**, siehe Pitfall #10)
   - → Seed + (start_date, end_date, period_len) identifizieren einen Run eindeutig (Phase 2+ relevant)
   - → UI darf KEINE Reihenfolge/Aggregation einschieben, die RNG-Reihenfolge verändert (Phase-1-relevant: Editing ist offline, also irrelevant; Save-Reihenfolge spielt keine Rolle)
4. **Sprache & Doku:** Deutsch in User-facing-Texten und Modell-Begriffen; Code-Identifier können Englisch sein.
5. **Pattern-Quelle:** Vor neuen Konventionen prüfen, ob 3fls schon eine hat — wenn ja, übernehmen.
6. **Häufige Operationen** (CLAUDE.md §Operationen): `uv sync`, `uv pip install -e ../osim-engine/engine`, `docker compose up -d postgres firebase-emulator`, `uv run alembic ...`, `uv run uvicorn app.main:app --reload`, `cd portal && npm run dev`, Tests: `uv run pytest` + `cd portal && npm test`, Linting: `uv run ruff check .` + `cd portal && npm run lint`.
7. **Projekt-Konventionen:**
   - Versionierte API: alle Endpoints unter `/api/v1/*`
   - Schema-per-Tenant: Postgres `search_path` per Request via `TenantAuthMiddleware`
   - Auth: Firebase Custom Claims (`tenant_id`, `role`) — keine DB-Lookups im Hot-Path
   - Live-Channel: WebSocket unter `/ws/runs/{run_id}` (Phase 4, nicht jetzt)
   - Worker-Isolation: 1 Worker = 1 OS-Prozess = 1 PSimulator-Instanz (Phase 2+, nicht jetzt)
8. **Nicht in dieses Repo:**
   - Engine-Logik selbst (gehört in `osim-engine`) — **PHASE-1-KRITISCH:** der OTX-Writer ist bereits in `osim_engine.io.otx_writer.py`; falls Phase 1 Lücken findet, werden die im **Engine-Repo** geschlossen, nicht hier.
   - C++-Quellcode oder MFC-Reverse-Engineering (gehört in `OSim2004`-Read-Only-Referenz)
   - SAP-Connector, Billing, Excel-Import (gehört in `tbx_stzrim`)
9. **GSD-Workflow:** Phasen unter `.planning/phases/NN-slug/`; `/gsd-plan-phase 1` als nächster Schritt.

Aus globalem `~/.claude/CLAUDE.md` (Jeerg-Profil): Deutsch-Default, präzise akademische Sprache, kein Marketing-Sprech, Sie-Anrede.
