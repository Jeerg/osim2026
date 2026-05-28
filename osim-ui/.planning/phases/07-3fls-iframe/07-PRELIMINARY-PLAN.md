# Phase 7 — 3fls-Integration via Iframe-Embedding

**Milestone:** v0.1.0
**Stand:** 2026-05-20 (Entwurf, umgenummert auf Phase 7 nach Roadmap-Resync 2026-05-21)
**Aufwand-Schätzung:** 1–2 Wochen (1 Dev) inkl. tbx_stzrim-seitiger Änderungen
**Voraussetzungen:** Phase 5 (separate GCP-Projekte) + Phase 6 (Feature-vollständig)

---

## 1. Ziel der Phase

osim-ui ist im 3fls-Portal (`tbx_stzrim/portal`) als **eingebettete Sub-App im Iframe** erreichbar. Beratungs-Kunden, die schon in 3fls eingeloggt sind, klicken einen Navigationspunkt "Simulation" und sind direkt im osim-ui ohne erneuten Login. Look-and-Feel-Brüche zwischen Host und Sub-App werden in Kauf genommen.

---

## 2. Architektur-Entscheidung (festgelegt 2026-05-20)

> **Iframe-Embedding, kein Module Federation, kein Code-Merge.**

Vorteile:
- Einfachste Integrationsform
- osim-ui bleibt unverändert deploybar
- Versionsunabhängige Updates auf beiden Seiten

Kompromisse:
- Auth-Bridging via PostMessage
- Navigation in Iframe vs. Host muss koordiniert werden
- Geringe Style-Konsistenz

---

## 3. Akzeptanzkriterien

1. ✅ Im tbx_stzrim-Portal existiert ein Navigations-Item "Simulation" (oder unter passendem Modul)
2. ✅ Klick öffnet eine `/simulation`-Route in 3fls, die osim-ui per `<iframe>` einbettet
3. ✅ Der eingeloggte 3fls-User wird via PostMessage als angemeldet im Iframe erkannt (geteilter Firebase-Token oder On-Behalf-Token-Exchange)
4. ✅ Tenant-Mapping: 3fls-`tenant_id` wird im osim-ui ebenfalls verwendet (oder Mapping-Tabelle)
5. ✅ Iframe ist responsive: passt sich an Host-Container-Größe an (Auto-Resize via PostMessage)
6. ✅ Navigation: Klick auf Link im Iframe, der osim-ui verlässt (z. B. Logout) führt zu konsistentem Host-Verhalten
7. ✅ CSP/CORS-Header sind so gesetzt, dass tbx_stzrim das osim-ui einbetten darf — aber kein anderer Host
8. ✅ Standalone-Modus von osim-ui (außerhalb von 3fls) bleibt voll funktional
9. ✅ E2E-Test: Login in 3fls → "Simulation" anklicken → Run im Iframe starten → Zurück zur 3fls-Navigation

---

## 4. Architektur

```
   tbx_stzrim/portal (React 19)
   ┌──────────────────────────────────────────┐
   │  Host-Navigation:  [Home][Daten][Sim*][…]│
   │                                          │
   │  /simulation Route:                      │
   │    <SimulationFrame                      │
   │      src="https://osim-ui.../?embedded=1"│
   │      tenant_id={3fls-tenant}/>           │
   │       └─ <iframe>                        │
   │          ┌─────────────────────────────┐ │
   │          │   osim-ui-Portal            │ │
   │          │   (eigene React-App)        │ │
   │          │                             │ │
   │          │   PostMessage-Bridge:       │ │
   │          │   - "auth.token"            │ │
   │          │   - "navigate.away"         │ │
   │          │   - "resize.request"        │ │
   │          │   - "tenant.set"            │ │
   │          └─────────────────────────────┘ │
   └──────────────────────────────────────────┘
```

**Auth-Bridge:** Zwei Optionen, in Discuss zu klären:
- **A: Geteilter Firebase-Projekt-Token** — Host und Sub-App nutzen denselben Firebase-Tenant; ID-Token kann direkt weitergereicht werden. Setzt voraus, dass osim-ui im selben Firebase-Projekt wie 3fls deployt ist — widerspricht der Festlegung "eigenes GCP-Projekt" aus Phase 5.
- **B: On-Behalf-Token-Exchange** — Host hat 3fls-Token, schickt es an osim-ui-Backend, das gegen eigenen Firebase-Token tauscht (per Server-zu-Server-Trust-Beziehung). Sauber getrennt, aber mehr Komplexität.

Empfehlung für Discuss: **B**, weil konform zu Phase-4-Festlegung "eigenes GCP-Projekt".

---

## 5. Task-Wellen

### Welle 1 — Embedded-Mode in osim-ui (3 Tage)
| ID | Task | Deps |
|---|---|---|
| 1.1 | URL-Parameter `?embedded=1`: deaktiviert eigene Top-Nav und Auth-Login-Page | — |
| 1.2 | `portal/src/embed/PostMessageBridge.ts`: empfängt `auth.token`, `tenant.set`, `navigate.request` | 1.1 |
| 1.3 | Auth: bei `embedded=1` keinen Firebase-Login-Flow zeigen, sondern auf `auth.token` von Parent warten | 1.2 |
| 1.4 | Resize-Bridge: Iframe meldet eigene Content-Höhe an Parent → Parent passt iframe-Höhe an | 1.2 |
| 1.5 | Logout-Knopf entfernt bei `embedded=1` (Host steuert Logout) | 1.1 |

### Welle 2 — On-Behalf-Token-Exchange (2 Tage)
| ID | Task | Deps |
|---|---|---|
| 2.1 | osim-ui-API-Endpoint `POST /api/v1/auth/exchange-3fls-token` akzeptiert 3fls-Firebase-Token | — |
| 2.2 | Backend verifiziert 3fls-Token gegen 3fls-Firebase-Project (Service-Account von 3fls als Trust-Beziehung) | 2.1 |
| 2.3 | Backend creates eigenen Custom-Token für osim-ui-Firebase und liefert zurück | 2.2 |
| 2.4 | Tenant-Mapping: aus 3fls-tenant_id (custom claim) wird osim-ui-tenant erkannt / neu angelegt | 2.3 |
| 2.5 | Audit-Log: jeder Exchange wird mit 3fls-User + osim-ui-User geloggt | 2.2 |

### Welle 3 — tbx_stzrim-Seite (3 Tage, in 3fls-Repo)
| ID | Task | Deps |
|---|---|---|
| 3.1 | Neue Route `/simulation` in `tbx_stzrim/portal/src/routes/_authenticated/simulation.tsx` | — |
| 3.2 | Component `SimulationFrame.tsx` mit iframe + PostMessage-Outbound | 3.1, 1.2 |
| 3.3 | Auf Mount: Token-Exchange via `POST /api/v1/auth/exchange-3fls-token`, Result via PostMessage in Iframe | 3.2, 2.3 |
| 3.4 | Resize-Listener: passt iframe-Höhe an Content-Höhe | 1.4 |
| 3.5 | Navigations-Item "Simulation" in Hauptmenü ergänzen | 3.1 |

### Welle 4 — Sicherheit / CSP (1 Tag)
| ID | Task | Deps |
|---|---|---|
| 4.1 | osim-ui setzt CSP-Header `frame-ancestors https://3fls.example.com 'self'` | — |
| 4.2 | osim-ui setzt `Content-Security-Policy: default-src 'self'; ...` (gegen XSS) | — |
| 4.3 | 3fls-Service-Account-Konfiguration: trusted für Token-Exchange | 2.2 |
| 4.4 | Penetration-Test der Bridge: Replay-Attacken, Token-Hijacking | 4.1, 4.2 |

### Welle 5 — Verifikation (2 Tage)
| ID | Task | Deps |
|---|---|---|
| 5.1 | Playwright-E2E: 3fls-Login → Simulation-Tab → Run starten → Live-View → Zurück | alle |
| 5.2 | Standalone-Test: osim-ui ohne `?embedded=1` funktioniert unverändert | alle |
| 5.3 | Doku in `docs/PHASE-6-3FLS-INTEGRATION.md` (auf beiden Repo-Seiten) | alle |
| 5.4 | Failure-Modes dokumentiert: 3fls-Token abgelaufen, Bridge-Crash, Iframe-Refused | alle |

---

## 6. Risiken & Unknowns

| Risiko | Mitigation |
|---|---|
| 3fls-Stack ist evtl. nicht bereit für Iframe-Hosting (CSP/SameSite Cookies) | Frühzeitig prüfen, ggf. 3fls-Anpassung in Phase 7 mit-einbauen |
| On-Behalf-Token-Exchange braucht Vertrauensbeziehung zwischen den Firebase-Projekten | Service-Account aus 3fls als Issuer für osim-ui einrichten; falls nicht möglich, Custom-Auth-Server-Pattern |
| Resize-Bridge führt zu Layout-Sprüngen | Min-Höhe + Debouncing |
| Style-Brüche zwischen Host und Iframe stören Nutzer | Minimale Style-Anpassung in osim-ui für Embedded-Mode (z. B. transparent Hintergrund, Brand-Color matchen über URL-Param) |
| Doppelte Sessions: User loggt sich in 3fls aus, ist im Iframe noch "eingeloggt" | Logout-Broadcast über PostMessage an Iframe |
| Browser-Restriktionen für Third-Party-Cookies (Safari) | Storage-Access-API anfragen oder Token-Forwarding über PostMessage statt Cookies |
| URL-Tiefe-Verlinkung ("Direkt-Link auf eine Sim-Live-Seite in 3fls-Kontext") | Iframe-URL-Sync über PostMessage (Phase 7.5 oder Backlog) |

---

## 7. Was Phase 7 NICHT liefert

- Vollständige UI-Harmonisierung (gleiches Tailwind-Theme, gleiche Komponenten)
- Module Federation (echtes Mount, geteilter React-Context)
- Code-Merge in tbx_stzrim
- SSO mit anderen Identity Providern als Firebase
- Mobile-App-Embedding

---

## 8. Definition-of-Done

1. Alle 9 Akzeptanzkriterien grün
2. E2E auf beiden Repo-Seiten grün
3. Penetration-Test der Bridge bestanden
4. `docs/PHASE-6-3FLS-INTEGRATION.md` auf beiden Repos
5. 3fls-PR (= eigener Pull Request in tbx_stzrim) erfolgreich gemerged

---

## 9. Diskuss-Punkte für `/gsd-discuss-phase`

1. **Auth-Bridge-Variante:** A (geteiltes Firebase-Projekt — widerspricht Phase 5) oder B (On-Behalf-Exchange — konform). Empfehlung B.
2. **Tenant-Mapping:** 1:1 (3fls-tenant ↔ osim-ui-tenant gleicher Name) oder Mapping-Tabelle für Flexibilität?
3. **Welche User können Token-Exchange triggern?** Alle 3fls-User oder nur solche mit "simulation"-Berechtigung?
4. **Hostname-Strategie:** `osim.tbx-stzrim.de` (Subdomain) oder eigener TLD?
5. **3fls-Repository-Änderungen:** Wie kommen die in den Mainline-Merge? PR-Review-Prozess?
6. **Iframe-Style:** soll osim-ui im Embedded-Modus 3fls-Farbschema laden (via URL-Param)?
