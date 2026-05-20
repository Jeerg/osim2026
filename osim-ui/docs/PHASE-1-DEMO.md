# Phase 1: Vertical Slice — Demo-Skript

**Stand:** 2026-05-20
**Adressat:** HKA-Studierende, Steinbeis-Berater, Demo-Sessions
**Status:** Phase 1 abgeschlossen — Modellierungs-Werkzeug einsatzbereit.

---

## Was Phase 1 liefert

Ein vollwertiges, beratungs-taugliches **Web-Modellierungs-Werkzeug für OSim-Modelle** im Browser, basierend auf dem `.otx`-Format als Speicher- und Austausch-Format. User können sich anmelden (Firebase Auth, Tenant-isoliert), ein OTX-Modell hochladen, im Browser über 12 spezialisierte Viewer bearbeiten und periodisch zurück in OTX speichern. Crash-Recovery (IndexedDB-Snapshots), Auto-Save (30 s), Single-Editor-Lock und Tenant-Isolation sind durchgängig implementiert.

**Phase 1 enthält NICHT:** Simulations-Läufe, Status-Polling, Live-Visualisierung, Trace-Browser, Reports, 3fls-Integration, Cloud-Deployment. Diese sind in Phase 2-6 der `.planning/ROADMAP.md` adressiert.

---

## Setup

> Voraussetzungen: Python 3.13, Node 20+, Docker Desktop, `uv` (siehe `README.md`).

### 1. Frischer System-State

```bash
cd osim-ui
docker compose down -v          # alte DB + Storage entfernen
docker compose up -d postgres firebase-emulator minio
```

### 2. DB-Migration (public-Schema)

```bash
DATABASE_URL="postgresql+asyncpg://osim_dev:osim_dev_password@localhost:5432/osim_ui_dev" \
  uv run alembic -c db/alembic.ini upgrade head
```

(Tenant-Schemata werden lazy beim ersten `/api/v1/auth/me`-Call angelegt — siehe Plan 01-02.)

### 3. Backend starten (Terminal 1)

```bash
DATABASE_URL="postgresql+asyncpg://osim_dev:osim_dev_password@localhost:5432/osim_ui_dev" \
  ENVIRONMENT=dev \
  uv run uvicorn app.main:app --port 8000
```

Erwartet: `INFO: Uvicorn running on http://127.0.0.1:8000`

Smoke-Probe:
```bash
curl http://localhost:8000/health
# {"status":"ok","service":"osim-ui","version":"0.1.0"}
```

### 4. Frontend starten (Terminal 2)

```bash
cd portal
npm install   # bei Erst-Setup
npm run dev
```

Erwartet: `Local: http://localhost:3000`

### 5. Browser

Öffne <http://localhost:3000>.

---

## Demo-Flow (6 Schritte)

### Schritt 1: Login (D-15, D-17)

1. Browser zeigt `/login` mit Email/Password-Formular.
2. Klick auf **"Noch kein Konto? Jetzt registrieren."**
3. Email & Passwort eingeben → **"Konto anlegen"**.
4. Automatischer Redirect zu `/models`.

**Was passiert im Hintergrund:**
- Firebase-Emulator legt User-Account an.
- Frontend ruft `POST /api/v1/auth/me` mit Firebase-ID-Token.
- Backend bootstrapped lazy: Tenant `tenant_<userid>` wird angelegt, models/model_versions/edit_locks-Tabellen im Tenant-Schema, User-Eintrag in `public.users`.

Verifikation (pgAdmin oder psql):
```sql
SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%';
-- z.B. tenant_xy12345
```

### Schritt 2: OTX-Upload (D-01, D-03)

1. `/models` zeigt leere Liste — klicke **"Modell hochladen"**.
2. File-Dialog: wähle `OSim2004/Vorstellung04/Dummy.otx` (228 KB).
3. **"Hochladen"** → Backend parst die OTX, schreibt sie in den Storage, redirected zu `/models/{id}`.

**Was passiert im Hintergrund:**
- Multipart-Upload → `POST /api/v1/models/upload-otx`.
- Backend ruft `osim_engine.io.load_otx_file()` → bekommt `LoadResult` mit `simulator` + `instances` + `loaded`-/`unsupported`-Counts.
- Original-OTX-Bytes werden im Storage abgelegt: `tenants/{tenant_id}/models/{model_id}/v1-{timestamp}-Dummy.otx`.
- DB-Row `Model` + `ModelVersion(version=1, source="upload")`.

### Schritt 3: Sidebar-Hierarchie (D-09)

1. Linke Sidebar zeigt die Workspace-Hierarchie:
   - Modell (Root)
   - Auslöser
   - Pläne (Durchlaufpläne)
   - Ressourcen (Belegungs- + Mengen-Ressourcen)
   - Einsatzzeiten / Schichten
2. Klick auf Pfeile expandiert die Folder.

### Schritt 4: Viewer-Vielfalt (D-08)

Klicke auf verschiedene Tree-Knoten und beobachte den rechten Hauptbereich:

| Knoten | Viewer | Was sichtbar |
| --- | --- | --- |
| Root „Modell" | PSimulatorViewer | Property-Editor (m_keim, m_name, ...) |
| Durchlaufplan | PDurchlaufplanViewerStd | Property + Knoten-Liste; Tab „Design" zeigt PDurchlaufplanViewerDesign mit reactflow-Canvas |
| Knoten in Plan | PGObjBaseViewer | generischer Property-Editor |
| Folder „Belegungsressourcen" | PRessBelegMatrixViewer | Matrix-Tabelle (read-only) |
| Folder „Mengenressourcen" | PRessMengeMatrixViewer | Matrix-Tabelle |
| Folder „Verknüpfungen" | PRessVerknuepfungViewer | Verknüpfungs-Editor |
| Folder „Knoten↔Betriebsmittel" | PDlplBetriebsmittelViewer | read-only Verknüpfungs-Tabelle mit Banner |
| Folder „Knoten↔Personal" | PDlplPersonalViewer | read-only Verknüpfungs-Tabelle |
| AEinsatzWunsch (unter AGruppe) | AEinsatzWunschViewer | Schicht-Editor |
| Folder „AKapBed" | AKapBedViewer | Kapazitätsbedarfs-Sicht |
| AGruppe | AGruppeViewer | Personal-Gruppen-Editor |

→ alle 12 in Phase 1 vorgesehenen Viewer (D-08).

### Schritt 5: Edit + Save (D-10, D-11, D-14)

1. Klicke auf den Root-Knoten („Modell" / ASimulator).
2. PSimulatorViewer rendert; ändere z.B. `m_keim` von `12345` auf `99999`.
3. **DirtyIndicator** im Header zeigt jetzt „1 ungesicherte Änderung".
4. Drei Save-Optionen — alle führen zu demselben Backend-Call (`PUT /tree`):
   - Klick auf **"Speichern"**-Button im Header
   - Strg+S (`Cmd+S` auf macOS)
   - 30 s warten → **Auto-Save** (D-11) triggert automatisch
5. Toast „Gespeichert (Version 2)" oder DirtyIndicator zurück auf 0.

**Was passiert im Hintergrund:**
- `PUT /api/v1/models/{id}/tree` mit JSON-Tree + `expected_version`.
- Backend lädt das Modell, ruft `apply_tree_to_simulator(tree, load_result)`, `dump_simulator_to_otx(sim)`, schreibt neue Version in Storage (v2-...).
- Original-Bytes (v1) bleiben unverändert (D-14).

### Schritt 6: Recovery + Lock (D-12, D-13)

**Recovery-Flow:**
1. Mache einen Edit, **NICHT speichern**.
2. Schließe den Browser-Tab.
3. Öffne neuen Tab → `http://localhost:3000/models/{id}`.
4. **RecoveryPrompt** erscheint: „Es gibt ungesicherte Änderungen vom <Zeit>. Wiederherstellen oder verwerfen?"
5. **"Wiederherstellen"** → Edit ist da, DirtyIndicator zeigt 1.

**Lock-Flow:**
1. In Inkognito-Fenster (neuer Browser-Context) → erneut Login als selber User.
2. Öffne dasselbe Modell.
3. **LockBanner** erscheint: „Modell wird gerade in einer anderen Session bearbeitet."
4. Schließe Original-Tab → 15 min warten oder explizit Lock-Release → zweite Session kann editieren.

---

## Performance-Werte (auf Dev-Laptop gemessen)

| Modell | Upload | Tree-GET | Tree-Size |
| --- | --- | --- | --- |
| Dummy.otx (228 KB) | < 1 s | < 0.5 s | ~150 KB |
| Fertigungsstruktur1_mit_AslFj.otx (272 KB) | ~ 1 s | < 1 s | ~250 KB |
| Bosch2_wechseln.otx (18 MB) | ~ 5-15 s | ~ 1-3 s | ~10-30 MB |

Konkrete Werte hängen von Hardware ab. Soft-Targets siehe `tests/integration/test_large_model.py`.

---

## Demo-Tipps

- **Kein Sim-Lauf zeigen** — Phase 1 enthält keinen. Demo endet beim Save-back. Verweis auf Phase 2 (Sim-Lauf + Schema-Editor).
- **Multi-Tenant zeigen:** Zwei Inkognito-Browser, zwei verschiedene Email-Adressen registrieren, einmal mit jeweils ein Modell hochladen. In pgAdmin sichtbar: zwei `tenant_*`-Schemata, jeweils mit eigener `models`-Tabelle.
- **Stress-Test mit Bosch2_wechseln.otx (18 MB):** Sidebar braucht 5-10 s zum Aufbauen, dann ist die Navigation responsiv. Save dauert ~5-10 s (Backend serialisiert + speichert).

---

## Was Phase 1 NICHT kann (mit Verweis auf Folge-Phasen)

| Wunsch | Phase | Verweis |
| --- | --- | --- |
| Simulation starten | 2 | ROADMAP.md → Phase 2: Sim-Lauf |
| Sim-Status live sehen | 2-3 | ROADMAP.md → Phase 3: Live Viz |
| Knoten via Drag-and-Drop anlegen | 3+ | Plan 01-09 Stub-Block; topologische Edits sind Phase 2+ |
| Reports / PDF / Excel | 5 | ROADMAP.md → Phase 5: Reports |
| In 3fls als Iframe einbetten | 6 | ROADMAP.md → Phase 6 |
| Cloud-Deployment + Multi-Run | 4 | ROADMAP.md → Phase 4 |

---

## Bekannte Einschränkungen (in Phase 1 dokumentiert)

1. **Backend liefert kein `oid_mapping`:** Neue Skeleton-Knoten (TEMP-OIDs) gehen beim Save verloren. Frontend ist Phase-2-ready (`patchOids`), Backend zieht in Phase 2 nach. Workaround: nur bestehende Knoten editieren.
2. **Conflict-Merge fehlt:** Last-Write-Wins; zweite parallele Session überschreibt erste. Phase 4 nachziehen.
3. **Engine-Writer-Roundtrip-Workaround:** `app/services/otx_service.py:_patch_ref_properties` patcht fehlende `m_l*`-Listen-Refs aus dem Original-OTX. Sollte langfristig in die einzelnen Writer-Handler in `osim_engine.io.otx_writer` wandern. Plan 01-03 Deviation #1.

---

## Screenshots / Recording

> _Empfehlung: nach der manuellen Abnahme (siehe `docs/PHASE-1-ACCEPTANCE.md`) Screenshots in `docs/screenshots/phase-1/` ablegen und hier verlinken._

Geplante Screenshots:
- `01-login.png` — Login-/Register-Form
- `02-models-list.png` — leere Modell-Liste nach Registrierung
- `03-upload.png` — Upload-Form
- `04-workspace-sidebar.png` — Workspace mit Sidebar + Root-Viewer
- `05-design-viewer.png` — Durchlaufplan-Design mit reactflow
- `06-matrix-viewer.png` — Belegungs-Matrix
- `07-recovery-prompt.png` — RecoveryPrompt-Modal nach Reload
- `08-lock-banner.png` — LockBanner im zweiten Browser-Context
