# Phase 1: Manuelle Abnahme-Checkliste

**Adressat:** Jeerg (Projekt-Owner) für visuelle und funktionale End-to-End-Abnahme.
**Erwartete Dauer:** 2-3 Stunden (zerlegbar in zwei Sessions).
**Voraussetzung:** Plan 01-10 abgeschlossen; alle Test-Suiten grün.

> Diese Liste verifiziert alle 18 CONTEXT.md-Decisions und die 8 ROADMAP.md-Success-Criteria der Phase 1 visuell. Bei Lücken/Bugs → Eintrag in `docs/PHASE-1-VERIFICATION.md` als ⚠️ oder Backlog-Item.

---

## Setup für die Abnahme

1. Frischer System-State: `docker compose down -v && docker compose up -d`
2. DB-Migration: siehe `docs/PHASE-1-DEMO.md` Schritt 2.
3. Backend starten: siehe `docs/PHASE-1-DEMO.md` Schritt 3.
4. Frontend starten: siehe `docs/PHASE-1-DEMO.md` Schritt 4.
5. Browser auf <http://localhost:3000>.

**Prüfung vorab:** `docker ps` sollte `osim-ui-firebase-emulator-1` (oder ähnlich, NICHT `tbx_stzrim-firebase-emulator-1`) zeigen. Bei falschem Emulator: siehe `docs/PHASE-1-VERIFICATION.md` Setup-Hinweis.

---

## CONTEXT.md-Decisions (18)

### Bereich D — Auth & Multi-Tenancy

- [ ] **D-15** Login via Firebase-Emulator
  - Wie testen: `/login` → "Noch kein Konto?" → Email/Password → "Konto anlegen" → Redirect weg von `/login`.
  - Erwartung: kein Fehler-Banner, User ist nach Klick eingeloggt.

- [ ] **D-17** Lazy Tenant-Bootstrap legt automatisch Schema an
  - Wie testen: Nach Erst-Login in pgAdmin (oder `psql -d osim_ui_dev -c "SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%';"`) prüfen: neues Schema `tenant_<uid>` existiert.

- [ ] **D-16** Schema-per-Tenant Isolation
  - Wie testen: Zweiten User in Inkognito-Fenster registrieren. In pgAdmin: zwei `tenant_*`-Schemata, jedes mit eigener `models`-Tabelle.

### Bereich E — Backend-Foundation

- [ ] **D-18** /api/v1/health + /readiness antworten 200; OpenAPI-Docs unter /docs erreichbar
  - Wie testen: `curl http://localhost:8000/health` (kein Auth) → 200. Browser auf <http://localhost:8000/docs> → OpenAPI-UI.

### Bereich 1 — OTX-Handling

- [ ] **D-01** + **D-03** OTX-Upload speichert Datei + parst
  - Wie testen: `Dummy.otx` (`OSim2004/Vorstellung04/Dummy.otx`) hochladen. Filesystem prüfen: `osim-ui/local-storage/tenants/{tenant_id}/models/1/v1-...-Dummy.otx` existiert.

- [ ] **D-02** OTX-Writer-Roundtrip
  - Wie testen: Edit eine Property, Save. In `local-storage/.../v2-...` neue Datei existiert. (Bonus: mit `osim_engine.io.load_otx_file` re-laden → kein Crash.)

- [ ] **D-04** Browser hält Modell als In-Memory-State
  - Wie testen: DevTools → React DevTools → Zustand-Store inspizieren. Nach Edit ist `tree` im Store geändert. (Optional: Reload ohne Save → Recovery-Prompt erscheint = der Store wurde aus IDB gefüllt.)

### Bereich A — Viewer-Foundation

- [ ] **D-05** Hybrid-Pattern funktioniert
  - Wie testen: Klick auf einen Tree-Knoten → ViewerHost rendert die richtige React-Komponente; Klick auf anderen Knoten → Re-Mount.

- [ ] **D-06** Alle 9 OCtrl-Subtypen funktional
  - Wie testen: Verschiedene Viewer öffnen — z.B. PSimulatorViewer hat Variable + Bool; PDurchlaufplanViewerStd hat Enum + Link; AGruppeViewer hat List. Edit-Klick → Wert ändert sich → DirtyIndicator.

- [ ] **D-07** Viewer-Schicht ist Querschnitts-Foundation
  - Wie testen: Code-Review `portal/src/viewers/core/` — saubere TS-Klassen ohne React-Imports im Frame-Layer.

### Bereich B — Konkrete Viewer (12)

- [ ] **D-08** Alle 12 Viewer erreichbar und renderbar:
  - [ ] 1. ASimulator (Root) → PSimulatorViewer
  - [ ] 2. PDurchlaufplan → PDurchlaufplanViewerStd
  - [ ] 3. PDurchlaufplan → Tab "Design" → PDurchlaufplanViewerDesign mit reactflow-Canvas
  - [ ] 4. Unsupported-Knoten → PGObjBaseViewer (Fallback)
  - [ ] 5. Folder "Belegungsressourcen" → PRessBelegMatrixViewer
  - [ ] 6. Folder "Mengenressourcen" → PRessMengeMatrixViewer
  - [ ] 7. Folder "Ressourcen-Verknüpfungen" → PRessVerknuepfungViewer
  - [ ] 8. Folder "Knoten↔Betriebsmittel" → PDlplBetriebsmittelViewer (read-only banner)
  - [ ] 9. Folder "Knoten↔Personal" → PDlplPersonalViewer (read-only banner)
  - [ ] 10. AEinsatzWunsch (unter AGruppe) → AEinsatzWunschViewer
  - [ ] 11. Folder "AKapBed" → AKapBedViewer
  - [ ] 12. AGruppe → AGruppeViewer

- [ ] **D-09** Sidebar-Tree zeigt Workspace-Hierarchie
  - Wie testen: Sidebar zeigt mind. die Folder Modell / Auslöser / Pläne / Ressourcen / Einsatzzeiten.

- [ ] **D-10** Property-Edit + Add + Remove + Undo + Redo
  - Property-Edit: ✅ in D-06 mit-getestet.
  - Add (neuer Knoten in Durchlaufplan): Klick auf "+" oder Kontext-Menü; neuer Skeleton-Knoten erscheint. Achtung: TEMP-OID, geht beim Save verloren (Phase-2-Stub).
  - Remove: Knoten markieren, "Löschen". Knoten ist aus Tree.
  - Undo/Redo: Strg+Z / Strg+Y oder Buttons. (Falls Undo-Stack in Phase 1 nicht implementiert → als Backlog vermerken.)

### Bereich C — Save-Strategie

- [ ] **D-11** Auto-Save (30 s) + DirtyIndicator
  - Wie testen: Edit + 30 s warten (mit Network-Tab geöffnet). PUT /tree-Request wird gesendet. DirtyIndicator geht zurück auf 0.

- [ ] **D-12** IndexedDB-Snapshot + Recovery-Prompt
  - Wie testen: Edit machen, Tab schließen (KEIN Save). Neuer Tab → Modell-URL → RecoveryPrompt erscheint. "Wiederherstellen" → Edit ist da.

- [ ] **D-13** Single-Editor-Lock + Read-Only-Sicht
  - Wie testen: Inkognito-Browser, zweite Session öffnen, gleiches Modell → LockBanner "Modell wird gerade bearbeitet". Inputs disabled.

- [ ] **D-13 (Lock-Expiry)** Lock läuft nach 15 min Inaktivität ab
  - Wie testen (Schnelltest): Backend mit `LOCK_TTL_SECONDS=30` neu starten, Lock acquiren, 35 s warten, in zweitem Context Lock acquiren → erfolgreich. (Backend-Variable `app/services/lock_service.py:LOCK_TTL_SECONDS`.)

- [ ] **D-14** Save-back-Endpoint speichert immer neue Version
  - Wie testen: Nach Save → `local-storage/.../v2-...` existiert; `v1-...` ist unverändert (Hash vergleichen).

---

## ROADMAP.md Success-Criteria (8)

- [ ] **SC-1** `docker compose up` startet alle Dev-Services
  - Verify: `docker compose ps` zeigt postgres + firebase-emulator + minio als "Up".

- [ ] **SC-2** User registriert/loggt sich via Firebase-Emulator ein; Lazy Tenant-Bootstrap
  - Bereits abgehakt: D-15 + D-17.

- [ ] **SC-3** User kann Dummy.otx hochladen; Server parst via Engine
  - Bereits abgehakt: D-01.

- [ ] **SC-4** Sidebar zeigt Workspace-Hierarchie
  - Bereits abgehakt: D-09.

- [ ] **SC-5** 12 Viewer funktionieren — vollständige Bearbeitung
  - Bereits abgehakt: D-08 + D-10.

- [ ] **SC-6** Auto-Save + manueller Save + IndexedDB-Snapshot + Single-Editor-Lock
  - Bereits abgehakt: D-11 + D-12 + D-13.

- [ ] **SC-7** Save-back schreibt JSON zurück als OTX via `dump_simulator_to_otx`
  - Bereits abgehakt: D-02 + D-14.

- [ ] **SC-8** Vollständige FastAPI-Foundation
  - Bereits abgehakt: D-18.

---

## Performance-Spot-Checks

- [ ] Dummy.otx (228 KB) lädt < 1 s in den Viewer.
- [ ] Fertigungsstruktur1_mit_AslFj.otx (272 KB) lädt < 2 s.
- [ ] Bosch2_wechseln.otx (18 MB) lädt < 30 s.
  - Auch Sidebar-Render kann 5-10 s dauern — ist OK.
  - Viewer-Wechsel auch 1-3 s — ist OK.
  - Save dauert ~5-15 s — ist OK.

---

## Abschluss

Wenn alle 18 Decisions abgehakt + alle 8 Success-Criteria abgehakt + Performance OK:

```bash
# ROADMAP.md aktualisieren:
# - [x] Phase 1: Vertical Slice
# - [x] 01-10: Integration-Tests, Playwright-E2E, manuelle Abnahme, Doku
```

Dann ist Phase 1 **DONE**.

Bei dokumentierten Lücken (z.B. Performance über Soft-Target oder ein Viewer crasht für einen Subtyp):
- Eintrag in `docs/PHASE-1-VERIFICATION.md` als ⚠️ + Notiz.
- Backlog-Item für Phase 2 oder Gap-Closure-Run via `/gsd-plan-phase --gaps` erstellen.
- Phase 1 ist trotzdem als DONE markiert, wenn der Kern-Use-Case (Edit + Save + Recovery) funktioniert.

**Datum der Abnahme:** ___________________
**Unterschrift / Notiz:** ___________________
