# osim-ui — Projektprofil

**Stand:** 2026-05-20 (Initial-Setup, vor Phase 1)  
**Eigentümer:** Jörg W. Fischer (HKA, STZ-RIM)

---

## 1. Vision

`osim-ui` ist die **moderne Web-Oberfläche und Multi-User-Orchestrierungsschicht** für die headless Python-Simulations-Engine `osim-engine`. Es ersetzt die 2004er Windows-MFC-App `OSim2004` durch eine **browserbasierte**, **mehrbenutzerfähige**, **skalierbare** Lösung und bereitet die Integration in das Beratungs-Toolbox-System `tbx_stzrim` (3fls) vor.

> Wer das Original kennt: gleiche Begriffe, gleiche Konzepte, neue Oberfläche. Wer 3fls kennt: gleicher Stack, gleicher Look & Feel, eigener Domänenfokus.

---

## 2. Trägerrollen

`osim-ui` bedient parallel zwei Welten:

| Welle | Träger | Anwendung |
|---|---|---|
| Lehre | Hochschule Karlsruhe (HKA) | PPS-Theorie-Planspiel, ERP-/Produktionsmanagement-Lehrveranstaltungen, Klausur-Szenarien, Tutorial-Modelle |
| Beratung | Steinbeis-Transferzentrum RIM | Kunden-Modelle für Produktionsplanungs- und Logistik-Analysen, "What-if"-Studien, Reports für Steuerkreise |

Beide Welten teilen die Engine; sie unterscheiden sich in Zielmodellen, Reports und Benutzerverwaltung.

---

## 3. Zielgruppen

| Persona | Bedarf |
|---|---|
| Studierende (BWL/Wing/Wirtschaftsinformatik) | Modelle aus dem Lehrmaterial laden, Parameter variieren, Ergebnis verstehen — niedrige Lernkurve |
| Lehrende | Klausur-Szenarien erzeugen, vergleichbare Läufe (gleicher Seed), Musterlösungen |
| Beratungs-Kunden / Steinbeis-Teams | Eigene Modelle pflegen, viele Varianten parallel rechnen, professionelle Reports, geteilter Zugriff im Team |

---

## 4. Architektur-Eckpfeiler (verbindlich)

Festgelegt am 2026-05-20:

1. **Standalone-Repo, 3fls-kompatibler Stack** — eigenes Git-Repo `osim-ui`, später als 3fls-Modul portierbar. Kein Lock-in jetzt, kein Re-Engineering später.
2. **Datenmodell-/Konzept-Treue zum Original, UI darf modern sein** — gleiche Begriffe (Auftrag, Maschine, Durchlaufplan, Knoten, Verteilung, Szenario, Lauf, Report), aber Wizards/Boards statt MDI-Fenster.
3. **Multi-User × Multi-Run, container-orchestriert** — Worker-Pool für parallele Sim-Läufe; analog zum cloudbuild-Pattern in 3fls.
4. **Live-Visualisierung während des Laufs** — WebSocket-Stream aus `EventBus`/`Recorder` der Engine; Live-Charts, Auftragsstatus, Maschinenbelegung.
5. **Firebase Auth** — gleiche Auth-Schicht wie 3fls, erleichtert spätere Integration.
6. **Postgres + Object Storage** — Metadaten in Postgres, große Trace-/Report-Artefakte in GCS.

Stack-Implikationen:
- **Frontend:** React 19 + TypeScript (wie 3fls), Vite/Next-Entscheidung in `.planning/research/3fls-patterns.md`
- **Backend:** FastAPI (wie 3fls), Python ≥3.12 (Engine-Constraint)
- **Worker:** Cloud Run Jobs oder Celery/RQ — Entscheidung in Architektur-Phase
- **Streaming:** WebSocket über FastAPI; bei Cloud-Worker zusätzlich Pub/Sub
- **DB:** Postgres + SQLAlchemy (vermutlich) + Alembic
- **Storage:** GCS (analog 3fls); S3-kompatibel als Abstraktionsebene
- **Auth:** Firebase Auth Client + Backend Token-Verification

---

## 5. Constraints aus der Engine

Die Engine setzt harte Randbedingungen, die das UI respektieren muss:

| Constraint | Konsequenz für osim-ui |
|---|---|
| **PAWLICEK-LCG ist Modul-Singleton (`s_verteil`)** | Sim-Läufe NUR in separaten OS-Prozessen, niemals Threads. |
| **Reproduzierbarkeitsvertrag: `(seed, start_date, end_date, period_len)`** | Jeder Lauf muss diese 4 Werte persistieren und exakt zurücksetzen können. |
| **Engine ist Python ≥3.12** | Backend-Python identisch ≥3.12. |
| **Engine-API ist `PSimulator` + `EventBus` + `Recorder`** | UI-Backend orchestriert, instanziert die Engine in Worker-Prozessen, hört auf EventBus. |
| **OTX-Loader funktioniert für Legacy-Files** | UI muss `.otx`-Upload als ersten Import-Pfad anbieten (Lehrmaterial liegt in `.otx` vor). |
| **JSON-Loader ist Skelett** | Web-natives JSON-Schema MUSS in Phase 1/2 mit der Engine zusammen definiert werden. |

---

## 6. Nicht-Ziele (jetzt nicht im Scope)

- Mobile-App (responsive Web reicht)
- Offline-Modus
- Re-Implementierung der Engine im Browser (WASM)
- Visueller WYSIWYG-Modell-Editor mit Drag-and-Drop von Knoten — **wenn**, dann als spätere Phase
- Eigenes Reporting-Tool (Berichte können in Phase 2+ via Templating/PDF gerendert werden — Original-Reports werden als Referenz analysiert)
- Migration der `AZeitSim.exe`-Win32-UI (Engine kann sie aufrufen, aber UI bietet das nicht an)

---

## 7. Erfolgskriterien für die Erst-Inbetriebnahme (MVP, Phase 1)

Phase 1 ist erfolgreich, wenn ein angemeldeter User folgenden Pfad durchläuft:

1. **Anmeldung** über Firebase Auth (Google/E-Mail).
2. **Modell laden** aus `.otx`-Upload **oder** aus minimal-JSON.
3. **Sim-Konfiguration**: Seed, Anzahl Perioden, Anzahl paralleler Wiederholungen (1–N).
4. **Sim starten** — Backend dispatcht an Worker-Pool.
5. **Live-Fortschritt** im UI sichtbar (mindestens: Sim-Zeit, abgeschlossene Pläne).
6. **Sim-Ende**: Ergebnis-Übersicht (Counter, Topics-Summary) + Download der vollständigen JSONL-Trace.
7. **Persistenz**: Lauf + Ergebnis in Postgres+GCS gespeichert, im User-Workspace wiederfindbar.

Was Phase 1 **noch nicht** liefern muss: visuelle Live-Charts (nur Zahlen), Multi-Lauf-Vergleich, Reports im Original-Stil, Modell-Editor.

---

## 8. Lieferplan-Übersicht (Roadmap-Skelett)

Detail-Roadmap in `.planning/ROADMAP.md`.

| Phase | Thema | Ziel |
|---|---|---|
| 1 | **Vertikale MVP-Slice** | Anmeldung → OTX-Upload → Run → Trace-Download |
| 2 | **JSON-Modellformat + Editor-Skelett** | Native Modell-Definition im UI, simple Form-Editor |
| 3 | **Live-Visualisierung** | WebSocket-Charts, Maschinen-Belegung live |
| 4 | **Parallel-Runs & Vergleich** | Mehrere Seeds → Statistik-Übersicht |
| 5 | **Reports & Export** | Original-nahe Reports (PDF/HTML), Klausur-Datenblätter |
| 6 | **3fls-Integration** | osim-ui als Sub-App in `tbx_stzrim/portal`, Single-Sign-On geteilt |
| 7+ | Backlog | Visueller Modell-Editor, DAG-Pläne, Tutorial-Tour, … |

---

## 9. Stand & Nächster Schritt

- ✅ Drei verwandte Codebasen identifiziert und (überNacht-Setup) parallel exploriert
- ✅ Sechs Architektur-Entscheidungen festgelegt
- ✅ Engine-API verifiziert
- 🟡 OSim2004-UI-Analyse läuft (Explore-Agent)
- 🟡 3fls-Patterns-Analyse läuft (Explore-Agent)
- ⏭ Architektur-Dokument → Roadmap → Phase-1-Plan → Skeleton-Setup
- ⏭ Morgen-Briefing mit offenen Fragen für Jeerg

---

## 10. Referenzen

- Engine-API: [`.planning/research/osim-engine-api.md`](research/osim-engine-api.md)
- Original-UI-Analyse: [`.planning/research/osim2004-ui-analysis.md`](research/osim2004-ui-analysis.md) *(in Arbeit)*
- 3fls-Pattern-Cookbook: [`.planning/research/3fls-patterns.md`](research/3fls-patterns.md) *(in Arbeit)*
- Architektur: [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) *(geplant)*
- Roadmap: [`.planning/ROADMAP.md`](ROADMAP.md) *(geplant)*
- Phase-1-Plan: [`.planning/milestones/v0.1.0/phase-1-vertical-slice/PLAN.md`](milestones/v0.1.0/phase-1-vertical-slice/PLAN.md) *(geplant)*
- Memory-System: `~/.claude/projects/C--Users-J-rgWFischer-PycharmProjects-osim-ui/memory/`
