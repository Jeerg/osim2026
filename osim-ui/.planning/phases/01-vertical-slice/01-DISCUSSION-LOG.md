# Phase 1: Vertical Slice - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `01-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-21
**Phase:** 01-vertical-slice
**Areas discussed:** Initial-Auswahl (4 Gray-Areas), Reframe-Auswahl (4 neue Gray-Areas), Backend-Scope-Ergänzung

---

## Initial-Auswahl (vor Reframe)

| Option | Description | Selected |
|--------|-------------|----------|
| OTX-Upload-Strategie | Roh speichern + LoadResult-Summary vs. Roh + JSON-Vorschau vs. JSON-Roundtrip vorziehen | ✓ |
| Multi-Tenant in Phase 1 | Schema-per-Tenant von Tag 1 vs. nur tenant_id-Spalten | ✓ |
| Demo-Modell im Repo | Vorstellung04/Dummy.otx committen vs. per Skript holen | ✓ |
| Tenant-Bootstrap-Trigger | Cloud-Function vs. lazy /auth/me | ✓ |

**User's choice:** Alle vier ausgewählt — aber dann grundlegender Reframe.

---

## OTX-Upload-Strategie (Bereich 1, ursprünglich)

| Option | Description | Selected |
|--------|-------------|----------|
| Roh speichern + LoadResult-Summary | OTX nach GCS, einmal validieren, UI zeigt nur Engine-Summary | |
| Roh + JSON-Vorschau aus OTX-Parser | Zusätzlich Top-Level-Objekt-Liste zur Anzeige | |
| Phase 1 wartet auf Engine-JSON-Roundtrip | E2.4/E2.5 vorziehen, JSON intern von Anfang an | |

**User's choice:** Freitext — "du sollt mir ein ui baumen mit graphischen modellierern! so wie im cpp code. hast du diesen analysiert ich sehe niergens konzepte für die viewer! wie objekte dargestellt werden etc. du kannst zu beginn die otx datein als basis für die darstellung enhmen später wandeln wir das in json. ich will jedoch die viewer diskutieren nicht ob ich jetzt eine datei speichere"

**Notes:** Phase 1 wurde grundlegend umgewidmet von "MVP-Slice mit Sim-Lauf" zu "Viewer-Framework + OTX-im-Browser-Modellierung". Sim-Lauf, Status-Polling, Trace-Download wurden aus Phase 1 entfernt.

---

## OTX-Parser-Lokation (Bereich 1, nach Reframe)

| Option | Description | Selected |
|--------|-------------|----------|
| Browser parst (TypeScript-Port von otx_reader.py) | Server liefert Blob, Browser parst lokal | |
| Server parst (nutzt Python-Engine) und schickt JSON-Tree | Server-Engine erzeugt JSON, Browser editiert JSON, Save-back via E2.5 | ✓ |
| Hybrid: Server parst initial, Browser modifiziert OTX-Text in-place | CRDT-ähnliches Text-Diff | |

**User's choice:** Server parst serverseitig (bestätigt: "otx wird server seitige geparst")
**Notes:** Implikation: Engine braucht einen OTX-Writer (`dump_simulator_to_otx`), den es heute nicht gibt. Als Welle 0 dieser Phase eingeplant.

---

## Bereich A: Viewer-Framework-Architektur

| Option | Description | Selected |
|--------|-------------|----------|
| OViewer-Pattern 1:1 als TS-Klassen-Hierarchie | Frame/ClientCtrl/ChildDialog/OCtrl alle als Klassen | |
| Hybrid: OViewer-Konzepte als Klassen, Rendering pur React | Frame/ClientCtrl als TS-Klassen, ChildDialog/Ctrl als React-Components | ✓ |
| Pur React, OViewer nur konzeptionell | Keine TS-Klassen-Hierarchie | |

**User's choice:** Hybrid

---

## Bereich A: OCtrl-Umfang

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal-5 (Variable, Bool, Enum, Link, List) | Deckt 80% der OSim-Properties ab | |
| Vollständig-9 (Minimal-5 + Method, TabViewer, COLORREF, LOGFONT) | Vollständig, pixelgenaue Treue | ✓ |
| Minimal-3 (Variable, Enum, List) | Schnellster Start | |

**User's choice:** Vollständig-9

---

## Bereich B: Viewer-Set in Phase 1

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal-4 (Simulator + Durchlaufplan-Std + Durchlaufplan-Design + GObjBase) | 95% Modellierung abgedeckt | |
| Vollständig-Modellierung-12 (Minimal-4 + 3 Ressourcen-Viewer + 2 Verknüpfungs-Viewer + 3 Arbeitszeit-Viewer) | Alle 3 Perspektiven abgedeckt | ✓ |
| Alle aus C++ (~30) | Auto-Generation per Meta-Klassen | |

**User's choice:** Vollständig-Modellierung-12

---

## Bereich B: Navigation zwischen Viewern

| Option | Description | Selected |
|--------|-------------|----------|
| Tab-Container nach Perspektive (Prozess/Ressource/Zeit) | Drei Tabs, Liste links + Viewer rechts | |
| Sidebar-Tree mit Workspace-Hierarchie | Tree-Navigation Modell→Plan→Knoten | ✓ |
| MDI-ähnlich mit mehreren geöffneten Viewern | Wie OSim2004, splittable Panels | |

**User's choice:** Sidebar-Tree
**Notes:** User-Korrektur während dieser Frage: "das ist für die industrie nicht für studenten lass stundenten bei deinen fragen weg" — Tab-Option hatte "vertraut für Studierende" als Pro-Argument. Memory `feedback-target-audience-framing` angelegt.

---

## Bereich B: Edit-Operationen in Phase 1

| Option | Description | Selected |
|--------|-------------|----------|
| Vollständig (Properties + Anlegen + Löschen + Verknüpfen) | Vollwertiges Modellierungs-Werkzeug | ✓ |
| Properties + Anlegen, kein Löschen oder Re-Verknüpfen | Sicher, bestehende Struktur bleibt | |
| Nur Properties editieren | What-if-Szenarien | |

**User's choice:** Vollständig

---

## Bereich C: Save-Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-Save 30s + manueller Speichern-Button + IndexedDB-Snapshot pro Änderung | Robust, kein Datenverlust | ✓ |
| Nur manueller Save mit Dirty-Tracking | User volle Kontrolle | |
| Auto-Save jede Änderung (debounced 2s) | Google-Docs-Pattern | |

**User's choice:** Auto-Save 30s + Manual + IndexedDB

---

## Bereich C: Conflict-Resolution

| Option | Description | Selected |
|--------|-------------|----------|
| Single-Editor-Lock auf Modell-Ebene | Wer öffnet, bekommt Lock | ✓ |
| Optimistic-Locking mit Versions-Nummern | Conflict-Dialog bei Diff | |
| Last-Write-Wins ohne Schutz | Einfachster Weg | |

**User's choice:** Single-Editor-Lock

---

## Bereich D: Auth & Multi-Tenant in Phase 1

| Option | Description | Selected |
|--------|-------------|----------|
| Firebase Auth + Schema-per-Tenant ab Tag 1 | Volle Infra von Anfang an | ✓ |
| Firebase Auth, aber Single-Tenant | Auth ja, Schema-Switch später | |
| Single-User-Stub, kein Auth | Lokal-only Dev-Tool | |

**User's choice:** Firebase Auth + Schema-per-Tenant ab Tag 1

---

## Bereich D: Tenant-Bootstrap

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy beim ersten /auth/me + automatischer Tenant-Create | Self-Service, kein Admin nötig | ✓ |
| Invitation-only: Admin legt Tenant + Whitelist an | Beratungs-/Kunden-tauglich | |
| Firebase-Cloud-Function-Trigger | Sauberste Trennung, extra Infra | |

**User's choice:** Lazy mit auto-Tenant-Create

---

## Backend-Scope-Ergänzung (User-initiiert)

**User-Eingabe (Freitext zur Abschluss-Frage):** "mach in phase 1 auch gleich die backendstruktur mit"

| Option | Description | Selected |
|--------|-------------|----------|
| Volle FastAPI-Foundation, später erweiterbar | Komplettes Skelett mit allen Konventionen | ✓ |
| Foundation + Worker-Skelett (auch wenn ungenutzt) | Wie Option 1 plus Worker-Plumbing | |
| Nur was Phase 1 wirklich braucht | Minimal, später refactoring | |

**User's choice:** Volle FastAPI-Foundation (bestätigt mit "ja")

---

## Claude's Discretion

- UI-Komponenten-Bibliothek (shadcn vs. eigene Components) — wird 3fls-Pattern folgen
- Undo/Redo-Mechanismus-Architektur (Command-Pattern, Event-Sourcing, Snapshot)
- DB-Schema-Detail (Spalten-Reihenfolge, Index-Strategien)
- Sidebar-Tree-Komponente (Lib-Wahl: react-arborist, @tanstack/react-virtual)
- IndexedDB-Lib (`idb` vs. `dexie`)
- Konkrete Storage-Backend-Implementierung (Local-Filesystem für Dev, GCS später)

## Deferred Ideas

- **Sim-Läufe** (PSimulator.start() aus Worker) → Phase 2 (vormals Teil von Phase 1)
- **Live-Visualisierung mit WebSocket** → Phase 3+
- **Trace-Download / Trace-Browser** → Phase 2
- **Reports / PDF-Export** → Phase 5 (unverändert)
- **3fls-Integration via Iframe** → Phase 6 (unverändert)
- **Cloud-Deployment + Multi-Run-Aggregation** → Phase 4 (unverändert)
- **Auto-Generation aller ~30 Viewer per Reflection** → Phase 7+ Backlog
- **Roadmap-Resync nötig:** ROADMAP.md, ARCHITECTURE.md und PRELIMINARY-PLANs der Folge-Phasen müssen an neue Phase-1-Definition angepasst werden (eigene Mini-Phase oder als Teil von Plan-Phase 1)
