---
phase: 01-vertical-slice
plan: 03
type: execute
wave: 1
depends_on:
  - 01-01-engine-roundtrip-verify
files_modified:
  - portal/package.json
  - portal/vite.config.ts
  - portal/tsconfig.json
  - portal/tsconfig.app.json
  - portal/tsconfig.node.json
  - portal/eslint.config.js
  - portal/index.html
  - portal/postcss.config.js
  - portal/src/main.tsx
  - portal/src/app.tsx
  - portal/src/styles/globals.css
  - portal/src/auth/firebase.ts
  - portal/src/auth/auth-provider.tsx
  - portal/src/auth/use-auth.ts
  - portal/src/api/fetch.ts
  - portal/src/api/error-message.ts
  - portal/src/lib/utils.ts
  - portal/src/routes/__root.tsx
  - portal/src/routes/_authenticated.tsx
  - portal/src/routes/login.tsx
  - portal/src/routes/index.tsx
  - portal/src/components/AuthenticatedLayout.tsx
  - portal/src/components/ui/button.tsx
  - portal/src/components/ui/input.tsx
  - portal/src/components/ui/sonner.tsx
  - portal/.env.example
  - portal/vitest.config.ts
  - portal/src/test/setup.ts
autonomous: true
requirements:
  - SC-2
priority: critical

must_haves:
  truths:
    - "`cd portal && npm run dev` startet Vite auf Port 3002 ohne Compile-Errors."
    - "Unauthentisierter Aufruf von / leitet automatisch nach /login um (TanStack-Router-Guard)."
    - "/login zeigt Email+Passwort-Felder und einen Sign-In-Button gegen den Firebase-Emulator."
    - "Nach Login wird /api/v1/auth/me aufgerufen, der Tenant-Status gespeichert, und auf / weitergeleitet."
    - "apiFetch hängt automatisch einen frischen Firebase-ID-Token als Authorization-Header an."
    - "DE-Toast-Mapping für mindestens 5 osim-spezifische Fehlercodes existiert (E_MODEL_LOCKED, E_LOCK_EXPIRED, E_OTX_PARSE_FAILED, E_OTX_COVERAGE_INCOMPLETE, E_VERSION_CONFLICT)."
  artifacts:
    - path: "portal/src/auth/auth-provider.tsx"
      provides: "AuthContext mit onAuthStateChanged + isLoading-Flag (Pitfall #8 — Race-Schutz)"
      contains: "AuthProvider"
    - path: "portal/src/api/fetch.ts"
      provides: "apiFetch<T>(path, init) + ApiError-Klasse mit status/body"
      contains: "export class ApiError"
    - path: "portal/src/api/error-message.ts"
      provides: "apiErrorMessage(err, fallback) + DE-Toast-Map für osim-spezifische Codes"
      contains: "E_MODEL_LOCKED"
    - path: "portal/src/routes/_authenticated.tsx"
      provides: "beforeLoad-Auth-Guard, redirected zu /login wenn !isAuthenticated"
      contains: "throw redirect"
    - path: "portal/src/components/AuthenticatedLayout.tsx"
      provides: "Layout-Wrapper mit Header + Sidebar-Slot + Main-Slot für authentisierte Routes"
      contains: "AuthenticatedLayout"
    - path: "portal/vitest.config.ts"
      provides: "Vitest-Config + Test-Setup mit Mocked AuthProvider"
      contains: "globals: true"
  key_links:
    - from: "portal/src/api/fetch.ts"
      to: "portal/src/auth/firebase.ts (auth.currentUser.getIdToken)"
      via: "ImportAuthInstanz, fetch Bearer-Header pro Request"
      pattern: "getIdToken"
    - from: "portal/src/routes/_authenticated.tsx"
      to: "portal/src/auth/use-auth.ts (context.auth)"
      via: "TanStack-Router-Context-Injection in app.tsx (context: { auth })"
      pattern: "context\\.auth"
    - from: "portal/src/auth/auth-provider.tsx"
      to: "Backend /api/v1/auth/me"
      via: "apiFetch nach erfolgreichem Firebase-Login → tenant_status laden"
      pattern: "apiFetch.*auth/me"
---

<objective>
Frontend-Foundation komplett aufsetzen: Vite-Build-Konfig, TanStack-Router file-based, Firebase-Auth-Client mit Emulator-Auto-Connect, apiFetch-Wrapper mit JWT-Header, AuthProvider mit isLoading-Race-Fix, RFC-7807-DE-Error-Mapping, shadcn-Mini-Setup (Button, Input, Sonner-Toaster), und ein leerer AuthenticatedLayout als Workspace-Container. Alle Foundation-Files sind 1:1- oder Subset-Übernahmen aus tbx_stzrim — siehe PATTERNS.md §Frontend-Foundation. Phase 1 hat KEIN i18n, KEIN openapi-fetch (apiFetch reicht für Phase 1, openapi-fetch erst in Phase 3 mit JSON-Schema).

Purpose: Ohne dieses Foundation-Skelett kann weder Plan 06 (OViewer-Core) noch Plan 07 (Workspace-Route + ModelStore) starten. Pattern-Quelle ist 3fls — extrem hoher Wiederverwendungsgrad (38 1:1-Files laut PATTERNS.md), wenig Erfindungs-Risiko.

Output: `npm run dev` startet, Login-Seite rendert, Email+Passwort gegen Emulator funktioniert, Auth-Guard schützt /. Nach Login zeigt / einen leeren Workspace mit Header + Sidebar-Slot + Toaster.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/01-vertical-slice/01-CONTEXT.md
@.planning/phases/01-vertical-slice/01-RESEARCH.md
@.planning/phases/01-vertical-slice/01-PATTERNS.md
@.planning/research/copy-paste-guide.md
@CLAUDE.md
@portal/package.json
@portal/vite.config.ts
@portal/index.html
@portal/src/app.tsx
@portal/src/main.tsx
</context>

<interfaces>
<!-- 3fls-Frontend-Vorlagen (READ-ONLY). Executor liest und passt für osim-ui an. -->

Vorlagen aus tbx_stzrim/portal:
- src/main.tsx (1:1, i18n-Import weglassen)
- src/app.tsx (1:1 ohne GlobalExcelImportProvider)
- src/auth/firebase.ts (1:1, Emulator-Auto-Connect bei import.meta.env.DEV)
- src/auth/auth-provider.tsx (1:1, isLoading-Flag-Pattern beachten)
- src/auth/use-auth.ts (1:1, trivial)
- src/api/fetch.ts (1:1, apiFetchBlob in Phase 1 weglassen)
- src/api/error-message.ts (Pattern übernehmen, eigene osim-Codes)
- src/routes/__root.tsx (1:1)
- src/routes/_authenticated.tsx (1:1, Layout-Component anpassen)
- vite.config.ts (1:1, Port auf 3002)
- tsconfig*.json (1:1)
- eslint.config.js (1:1)
- vitest.config.ts (1:1)
- src/lib/utils.ts (cn() Helper für shadcn — 1:1)

PATTERNS.md §Frontend Foundation listet die Mapping-Tabelle vollständig.
</interfaces>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: package.json + Vite/TS/ESLint-Config + index.html + Tailwind/PostCSS-Setup</name>
  <files>portal/package.json, portal/vite.config.ts, portal/tsconfig.json, portal/tsconfig.app.json, portal/tsconfig.node.json, portal/eslint.config.js, portal/index.html, portal/postcss.config.js, portal/src/styles/globals.css</files>
  <read_first>
    - portal/package.json (aktueller Stand)
    - portal/vite.config.ts (aktueller Stand)
    - portal/index.html (aktueller Stand)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\portal\package.json (Vorlage)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\portal\vite.config.ts (Vorlage)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\portal\tsconfig.json + tsconfig.app.json + tsconfig.node.json (Vorlagen)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\portal\eslint.config.js (Vorlage)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\portal\index.html (Vorlage)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `portal/src/main.tsx + portal/src/app.tsx` für Lib-Stack; Sektion `Stack-Drift gegenüber RESEARCH.md` für lucide-react vs react-icons)
    - .planning/research/copy-paste-guide.md (Vite-Config-Block Z.84-103)
  </read_first>
  <behavior>
    - `npm install` ohne Errors.
    - `npm run dev` startet Vite auf Port 3002.
    - `npm run build` erzeugt portal/dist ohne Type-Errors.
    - `npm run lint` läuft (auch wenn Phase-1-Code noch wenige Files hat).
    - Tailwind CSS 4 läuft (via @tailwindcss/vite-Plugin).
    - TypeScript path-Alias `@/*` zeigt auf `portal/src/*`.
  </behavior>
  <action>
    Überschreibe `portal/package.json` mit folgenden Dependencies (Stack-Parität mit 3fls + Phase-1-spezifische Libs aus PATTERNS.md §Standard Stack):
    - dependencies: `react@^19.2.4`, `react-dom@^19.2.4`, `@tanstack/react-router@^1.170.5`, `@tanstack/react-query@^5.100.11`, `firebase@^11.0.0`, `zustand@^5.0.13`, `lucide-react@^0.577.0` (NICHT react-icons — PATTERNS.md §Stack-Drift), `sonner` (latest), `clsx`, `tailwind-merge`, `class-variance-authority` (für shadcn-cn-Helper)
    - devDependencies: `@tanstack/router-vite-plugin@^1.170.5`, `@types/react@^19`, `@types/react-dom@^19`, `@vitejs/plugin-react@^5`, `tailwindcss@^4.2`, `@tailwindcss/vite@^4.2`, `typescript@^5.9`, `vite@^7.3`, `vitest@^2.1`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `typescript-eslint`
    - scripts: `dev: vite`, `build: tsc -b && vite build`, `preview: vite preview`, `lint: eslint . --max-warnings=0`, `test: vitest`, `test:run: vitest run`

    Erstelle `portal/vite.config.ts` (PATTERNS.md §`portal/vite.config.ts` Z.84-103):
    - Plugins: `TanStackRouterVite({ target: "react", autoCodeSplitting: true })`, `react()`, `tailwindcss()` (von @tailwindcss/vite)
    - resolve.alias `@` → `path.resolve(__dirname, "./src")`
    - server.port = 3002, server.strictPort = true

    Erstelle `portal/tsconfig.json` + `tsconfig.app.json` + `tsconfig.node.json` als 1:1-Kopien aus tbx_stzrim mit angepasstem paths-Alias `"@/*": ["./src/*"]`. strict: true. moduleResolution: "bundler".

    Erstelle `portal/eslint.config.js` als 1:1-Kopie aus tbx_stzrim (Flat-Config-Stil mit typescript-eslint + react-hooks + react-refresh).

    Überschreibe `portal/index.html` (aktuell minimal) mit:
    - `<title>osim-ui — OSim-Modellierung im Browser</title>`
    - `<meta charset="utf-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1">`
    - Body mit `<div id="root"></div>` + `<script type="module" src="/src/main.tsx"></script>`

    Erstelle `portal/postcss.config.js` (Tailwind 4 nutzt nur @tailwindcss/vite, KEIN postcss-tailwind — also leer-File mit `export default { plugins: {} };` als Forward-Compatibility-Stub; ODER weglassen wenn 3fls ohne auskommt).

    Erstelle `portal/src/styles/globals.css`:
    - `@import "tailwindcss";` als erste Zeile (Tailwind 4 Pattern)
    - shadcn-CSS-Variablen (`--background`, `--foreground`, `--primary`, etc.) für Light+Dark; aus shadcn-Docs (default theme); für Phase 1 light-only reicht.
    - body-Default: `bg-background text-foreground antialiased`.
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npm install --silent 2>&amp;1 | tail -5 &amp;&amp; npm run lint --silent 2>&amp;1 | tail -5; cd portal &amp;&amp; npx tsc -b --noEmit 2>&amp;1 | tail -5</automated>
  </verify>
  <done>
    package.json hat alle Deps aus action-Block. vite.config.ts hat Port 3002 + Plugins. tsconfig.json + Subset-Configs sind vorhanden. eslint.config.js läuft ohne Errors. index.html hat Title + Root-Div. globals.css importiert Tailwind. `npx tsc -b --noEmit` läuft fehlerfrei (noch ohne Code; nur Config-Validierung).
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Auth-Schicht (firebase.ts + auth-provider.tsx + use-auth.ts) — 1:1 aus 3fls</name>
  <files>portal/src/auth/firebase.ts, portal/src/auth/auth-provider.tsx, portal/src/auth/use-auth.ts, portal/.env.example</files>
  <read_first>
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\portal\src\auth\firebase.ts (Z.1-30 — Auto-Connect zum Emulator)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\portal\src\auth\auth-provider.tsx (Z.1-100 — onAuthStateChanged + isLoading + /auth/me-Fetch)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\portal\src\auth\use-auth.ts (Z.1-14 — Hook)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `portal/src/auth/*` — Pitfall #8 isLoading-Pattern)
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Common Pitfalls #8 (Auth-Race) + #9 (Emulator in Prod)
  </read_first>
  <behavior>
    - `import { auth } from "@/auth/firebase"` exportiert eine Firebase Auth Instance.
    - In Dev-Mode (`import.meta.env.DEV === true`) wird `connectAuthEmulator(auth, "http://localhost:9099")` aufgerufen.
    - `<AuthProvider>` wickelt die App; `useAuth()` gibt `{ user, isAuthenticated, isLoading, tenantId, role, tenantStatus, signOut }` zurück.
    - Initial-Render: `isLoading=true`, `user=null`. Nach `onAuthStateChanged` mit user → `isLoading=false`, `user=<User>`, `tenantId=<from-claims>`, `tenantStatus="active"` (vom Backend gelesen). Nach `onAuthStateChanged(null)` → `isLoading=false`, `user=null`.
    - Bei Token-Refresh-Fail wird user auf null gesetzt.
  </behavior>
  <action>
    Erstelle `portal/.env.example` mit:
    - `VITE_FIREBASE_API_KEY=demo-api-key-for-emulator`
    - `VITE_FIREBASE_AUTH_DOMAIN=osim-dev.firebaseapp.com`
    - `VITE_FIREBASE_PROJECT_ID=osim-dev`
    - `VITE_API_BASE_URL=http://localhost:8000`

    Erstelle `portal/src/auth/firebase.ts` (PATTERNS.md Sektion §portal/src/auth/* + 3fls-Original):
    - Imports: `initializeApp`, `getAuth`, `connectAuthEmulator` aus firebase/app + firebase/auth
    - firebaseConfig aus `import.meta.env.VITE_FIREBASE_*`
    - `export const app = initializeApp(firebaseConfig)`, `export const auth = getAuth(app)`
    - `if (import.meta.env.DEV) { connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true }); }` — Pitfall #9: NUR via DEV-Flag, NICHT via custom env-var.

    Erstelle `portal/src/auth/auth-provider.tsx` (PATTERNS.md §portal/src/auth/* + 3fls-Original Z.1-100):
    - AuthContext + AuthState-Interface (`{ user: User | null, isAuthenticated: boolean, isLoading: boolean, tenantId: string | null, role: string, tenantStatus: string, signOut: () => Promise<void> }`).
    - `<AuthProvider>`-Component nutzt `onAuthStateChanged(auth, async (fbUser) => { ... })`.
    - In der Callback: wenn fbUser → `getIdTokenResult(fbUser)` → tenantId/role aus customClaims lesen. Dann `apiFetch<AuthMeResponse>("/api/v1/auth/me")` aufrufen → tenantStatus aus Response speichern. setState mit isLoading=false.
    - Wenn fbUser null → setState({user:null, isAuthenticated:false, isLoading:false, tenantId:null, role:"user", tenantStatus:""}).
    - signOut → `await firebaseSignOut(auth)`.
    - WICHTIG: useEffect mit empty deps; cleanup via unsubscribe.
    - Anti-Pattern (PATTERNS.md): KEIN extra `isReady`-Flag — `isLoading` reicht (RESEARCH-Empfehlung war Doppelung).

    Erstelle `portal/src/auth/use-auth.ts`:
    - `export function useAuth(): AuthState`
    - `useContext(AuthContext)` mit Null-Check → throw "useAuth must be used within AuthProvider".
    - `export type { AuthState }` re-export aus auth-provider.
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npx tsc -b --noEmit 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    portal/src/auth/firebase.ts, auth-provider.tsx, use-auth.ts existieren. tsc -b läuft ohne Type-Errors. .env.example dokumentiert alle 4 VITE_-Variablen. Auto-Emulator-Connect ist DEV-only. isLoading-Flag schützt vor Pitfall #8.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: API-Client (fetch.ts + error-message.ts) + lib/utils.ts</name>
  <files>portal/src/api/fetch.ts, portal/src/api/error-message.ts, portal/src/lib/utils.ts</files>
  <read_first>
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\portal\src\api\fetch.ts (Z.1-89 — apiFetch + ApiError)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\portal\src\api\error-message.ts (Z.1-150 — Pattern; osim-Codes neu)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\portal\src\lib\utils.ts (cn-Helper für shadcn — 1:1)
    - portal/src/auth/firebase.ts (aus Task 2 — auth wird hier importiert)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `portal/src/api/fetch.ts` + `portal/src/api/error-message.ts` mit osim-DE-Codes)
  </read_first>
  <behavior>
    - `import { apiFetch, ApiError } from "@/api/fetch"` funktioniert.
    - `apiFetch<T>(path, init?)` hängt `Authorization: Bearer <token>` automatisch an wenn ein User eingeloggt ist.
    - Bei response.ok=false wirft apiFetch eine ApiError mit `status` und parsed `body`.
    - Bei response.status=204 returnt apiFetch undefined.
    - `apiErrorMessage(err)` gibt für ApiError mit `body.code = "E_MODEL_LOCKED"` den deutschen String `"Modell wird gerade von einem anderen Nutzer bearbeitet."` zurück.
    - `cn(...inputs)` aus utils.ts ist eine clsx+tailwind-merge-Kombination (shadcn-Standard).
  </behavior>
  <action>
    Erstelle `portal/src/lib/utils.ts` (1:1 shadcn-Default):
    - `import { clsx, type ClassValue } from "clsx"`
    - `import { twMerge } from "tailwind-merge"`
    - `export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }`

    Erstelle `portal/src/api/fetch.ts` (PATTERNS.md §portal/src/api/fetch.ts Z.852-895):
    - `BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"`
    - `class ApiError extends Error` mit Properties `status: number`, `body: unknown` (siehe PATTERNS.md Excerpt).
    - `apiFetch<T>(path: string, init?: RequestInit): Promise<T>`:
      - Headers: Accept=application/json; wenn body und ohne Content-Type → Content-Type=application/json
      - Wenn auth.currentUser existiert → token = await user.getIdToken(false), Header `Authorization: Bearer ${token}` setzen
      - fetch(`${BASE_URL}${path}`, {...init, headers})
      - Wenn !response.ok → text-body lesen, JSON-parse versuchen, ApiError werfen
      - Wenn status=204 → return undefined as T
      - Sonst return response.json()
    - KEIN apiFetchBlob in Phase 1 (kommt in Plan 04 für OTX-Download — wenn benötigt).

    Erstelle `portal/src/api/error-message.ts` (PATTERNS.md §portal/src/api/error-message.ts Z.905-940):
    - `import { ApiError } from "./fetch"`
    - `TOAST_DE: Record<string, string>` mit MINDESTENS 5 osim-spezifischen Codes:
      - `E_MODEL_LOCKED`: "Modell wird gerade von einem anderen Nutzer bearbeitet."
      - `E_LOCK_EXPIRED`: "Ihre Bearbeitungs-Sperre ist abgelaufen. Bitte Seite neu laden."
      - `E_OTX_PARSE_FAILED`: "Die OTX-Datei konnte nicht gelesen werden. Encoding muss Latin-1 sein."
      - `E_OTX_COVERAGE_INCOMPLETE`: "Modell enthält Objekte, die nicht zurück nach OTX gespeichert werden können."
      - `E_VERSION_CONFLICT`: "Modell wurde inzwischen geändert. Bitte neu laden und Änderungen wiederholen."
      - `E_UPLOAD_TOO_LARGE`: "Datei ist zu groß (max. 30 MB)."
      - `E_INVALID_OTX_MIMETYPE`: "Datei muss eine OTX-Datei sein."
    - `extractErrorCode(err): string` extrahiert err.body.code wenn ApiError
    - `apiErrorMessage(err, fallback = "Fehler"): string`:
      - Wenn !ApiError → err.message oder fallback
      - code aus body → wenn in TOAST_DE → return; sonst body.detail wenn string; sonst `${fallback} (HTTP ${err.status}).`
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npx tsc -b --noEmit 2>&amp;1 | tail -10 &amp;&amp; node -e "const { TOAST_DE } = await import('./portal/src/api/error-message.ts').catch(()=>({TOAST_DE:null})); console.log(TOAST_DE);" 2>&amp;1 | tail -5 || echo "ts-import via node nur als Hinweis"</automated>
  </verify>
  <done>
    portal/src/api/fetch.ts exportiert apiFetch + ApiError. portal/src/api/error-message.ts hat TOAST_DE mit allen 7 osim-Codes. portal/src/lib/utils.ts hat cn-Helper. tsc-b läuft ohne Errors.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: shadcn-Mini-Setup (Button + Input + Sonner) + AuthenticatedLayout-Skelett</name>
  <files>portal/src/components/ui/button.tsx, portal/src/components/ui/input.tsx, portal/src/components/ui/sonner.tsx, portal/src/components/AuthenticatedLayout.tsx</files>
  <read_first>
    - portal/src/lib/utils.ts (aus Task 3)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `portal/src/routes/_authenticated/models/$id.tsx` — Layout-Vorbild)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\portal\src\components\ui (browse — übernommene shadcn-Komponenten als Stil-Vorlage)
    - Shadcn-Default-Templates für button.tsx, input.tsx, sonner.tsx (sind public; Executor nutzt `npx shadcn@latest add button input sonner` wenn netzfähig, sonst manuelles Skelett)
  </read_first>
  <behavior>
    - `<Button variant="default|outline|ghost">` rendert mit Tailwind-Classes; click ist normaler button-Event.
    - `<Input type="text|email|password">` rendert ein controlled input.
    - `<Toaster />` aus sonner ist gemounted (kommt aus Task 6 in app.tsx).
    - `<AuthenticatedLayout>` rendert Header (links: "osim-ui", rechts: User-Email + Logout-Button) + flex-Container mit Outlet.
  </behavior>
  <action>
    Versuche `cd portal && npx shadcn@latest add button input sonner --yes` für automatische Generierung. Wenn das fehlt (offline / CLI-Probleme), erstelle die Files manuell als Subset der shadcn-Templates (alle MIT-lizenziert; Code aus shadcn-docs übernommen):

    `portal/src/components/ui/button.tsx`:
    - `cva`-basierte Variants: default (primary bg), outline (border), ghost (transparent), destructive (red).
    - Sizes: sm/default/lg/icon.
    - asChild-Prop via Radix Slot (oder ohne Radix in Phase 1 — einfache button-Komponente reicht).

    `portal/src/components/ui/input.tsx`:
    - forwardRef-button mit `cn("flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ...", className)`.

    `portal/src/components/ui/sonner.tsx`:
    - Re-Export `Toaster` aus sonner mit shadcn-Theme-Wrapper (toastClassName aus shadcn-Docs).

    `portal/src/components/AuthenticatedLayout.tsx`:
    - Props: `{ children: ReactNode }`.
    - Layout: `<div className="flex h-screen flex-col">`
      - `<header className="flex h-14 items-center justify-between border-b px-4">`
        - Links: `<h1 className="text-lg font-semibold">osim-ui</h1>` + Optional Tagline `<span className="ml-2 text-sm text-muted-foreground">OSim-Modellierung im Browser</span>`
        - Rechts: User-Email aus useAuth + `<Button variant="outline" size="sm" onClick={signOut}>Abmelden</Button>`
      - `<main className="flex-1 overflow-hidden">{children}</main>`

    KEINE Sidebar-Komponente hier — die kommt in Plan 07 als Teil der /models/$id-Route.
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npx tsc -b --noEmit 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    portal/src/components/ui/{button,input,sonner}.tsx existieren als shadcn-Komponenten. portal/src/components/AuthenticatedLayout.tsx hat Header + main mit children. tsc -b läuft ohne Errors. Alle Files nutzen cn() für className-Komposition.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 5: Routing-Skelett (__root.tsx + _authenticated.tsx + login.tsx + index.tsx)</name>
  <files>portal/src/routes/__root.tsx, portal/src/routes/_authenticated.tsx, portal/src/routes/login.tsx, portal/src/routes/index.tsx</files>
  <read_first>
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\portal\src\routes\__root.tsx (Z.1-20)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\portal\src\routes\_authenticated.tsx (Z.1-27)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\portal\src\routes\login.tsx (Z.1-80 — UI-Vorlage)
    - portal/src/auth/use-auth.ts (aus Task 2 — context.auth)
    - portal/src/components/AuthenticatedLayout.tsx (aus Task 4)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `portal/src/routes/_authenticated.tsx` — Pitfall #8 isLoading-Pattern)
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Code Examples Example 6
  </read_first>
  <behavior>
    - `/` (Index) ist `_authenticated` gewrappt → wenn nicht eingeloggt → redirect zu /login.
    - `/login` zeigt Email+Passwort + Sign-In-Button; bei Submit `signInWithEmailAndPassword(auth, email, password)`.
    - Nach erfolgreichem Login → router.navigate({to: "/"}).
    - `/index.tsx` zeigt placeholder-Content "Modell-Bibliothek wird in Plan 04 gefüllt".
    - TanStack-Router-Context hat `auth: AuthState`.
  </behavior>
  <action>
    `portal/src/routes/__root.tsx` (PATTERNS.md / RESEARCH §Example 6 Z.1244-1251):
    - `import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"`
    - `import type { AuthState } from "@/auth/use-auth"`
    - `interface RouterContext { auth: AuthState }`
    - `export const Route = createRootRouteWithContext<RouterContext>()({ component: () => <Outlet /> })`

    `portal/src/routes/_authenticated.tsx` (PATTERNS.md Z.951-960):
    - `import { createFileRoute, redirect, Outlet } from "@tanstack/react-router"`
    - `import { AuthenticatedLayout } from "@/components/AuthenticatedLayout"`
    - `export const Route = createFileRoute("/_authenticated")({ beforeLoad: ({ context, location }) => { if (context.auth.isLoading) return; if (!context.auth.isAuthenticated) throw redirect({ to: "/login", search: { redirect: location.href } }); }, component: () => <AuthenticatedLayout><Outlet /></AuthenticatedLayout> })`

    `portal/src/routes/login.tsx`:
    - `import { createFileRoute, useNavigate } from "@tanstack/react-router"`
    - `import { signInWithEmailAndPassword } from "firebase/auth"`
    - `import { auth } from "@/auth/firebase"`
    - `import { Button } from "@/components/ui/button"; import { Input } from "@/components/ui/input"`
    - `import { useState } from "react"`
    - `import { toast } from "sonner"`
    - Login-Form: 2 Inputs (email, password) + Button "Anmelden". Bei Submit → try signIn, bei Erfolg navigate({to: redirect-from-search-params || "/"}), bei Fehler toast.error(error.message).
    - Layout: zentrierte Card, max-w-md, mit Header "osim-ui — Anmelden".
    - WICHTIG: Wenn `context.auth.isAuthenticated` schon true → auto-redirect zu /.

    `portal/src/routes/index.tsx` (Phase-1-Placeholder):
    - `import { createFileRoute } from "@tanstack/react-router"`
    - `export const Route = createFileRoute("/_authenticated/")({ component: Dashboard })`
    - `function Dashboard() { return <div className="p-8"><h2 className="text-2xl font-semibold">Willkommen</h2><p className="mt-2 text-muted-foreground">Modell-Bibliothek wird in Plan 04 implementiert. Aktuell siehst du nur das Layout-Skelett.</p></div>; }`

    HINWEIS: index.tsx muss in `routes/_authenticated/index.tsx` liegen (Subdir des _authenticated-Layouts) wenn TanStack-Router file-based-Routes nutzt. ABER für Phase 1 wo wir nur eine Route haben, ist es OK als `routes/index.tsx` ohne _authenticated-Wrap — Executor entscheidet das passende file-based-Pattern und passt entsprechend an. PATTERNS.md zeigt beide Möglichkeiten. Empfehlung: `portal/src/routes/_authenticated.tsx` (Layout) + `portal/src/routes/_authenticated/index.tsx` (Dashboard) als TanStack-Convention.

    routeTree.gen.ts wird vom TanStack-Router-Vite-Plugin AUTOMATISCH generiert beim ersten `npm run dev`. Nicht manuell anlegen.
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npm run dev &amp; sleep 5 &amp;&amp; ls -la portal/src/routeTree.gen.ts 2>&amp;1 | head -3; cd portal &amp;&amp; npx tsc -b --noEmit 2>&amp;1 | tail -10; pkill -f "vite" 2>/dev/null || true</automated>
  </verify>
  <done>
    4 Route-Files existieren. routeTree.gen.ts wird automatisch generiert beim ersten vite-Start. tsc -b läuft ohne Errors. _authenticated-Guard redirected korrekt. Login-Page hat 2 Inputs + Button.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 6: main.tsx + app.tsx (Provider-Wrap + RouterProvider + Toaster)</name>
  <files>portal/src/main.tsx, portal/src/app.tsx</files>
  <read_first>
    - portal/src/main.tsx (aktueller Stand)
    - portal/src/app.tsx (aktueller Stand)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\portal\src\main.tsx (Vorlage Z.1-11)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\portal\src\app.tsx (Vorlage Z.1-70)
    - portal/src/auth/auth-provider.tsx (aus Task 2)
    - portal/src/auth/use-auth.ts (aus Task 2)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `portal/src/main.tsx + portal/src/app.tsx`)
  </read_first>
  <behavior>
    - main.tsx mounted StrictMode + App + lädt globals.css.
    - app.tsx wickelt: QueryClientProvider > AuthProvider > InnerApp > Toaster.
    - InnerApp ruft useAuth + RouterProvider mit context={ auth }.
    - QueryClient hat defaultOptions: queries.staleTime = 5 min, retry = 1.
  </behavior>
  <action>
    Überschreibe `portal/src/main.tsx` (PATTERNS.md §portal/src/main.tsx Z.779-790):
    - `import { StrictMode } from "react"`
    - `import { createRoot } from "react-dom/client"`
    - `import "@/styles/globals.css"`
    - `import { App } from "./app"`
    - `createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>)`

    Überschreibe `portal/src/app.tsx` (PATTERNS.md §portal/src/app.tsx Z.793-833):
    - QueryClientProvider + RouterProvider + AuthProvider + Toaster wie in PATTERNS.md
    - `const router = createRouter({ routeTree, context: { auth: undefined as any } })`
    - `declare module "@tanstack/react-router" { interface Register { router: typeof router } }`
    - `InnerApp` Function-Component: `const auth = useAuth(); return <RouterProvider router={router} context={{ auth }} />`
    - `export function App()`: wickelt QueryClientProvider > AuthProvider > (InnerApp + Toaster)
    - Toaster mit `position="top-right" richColors`
    - KEIN GlobalExcelImportProvider, KEIN i18n-Import (PATTERNS.md §portal/src/main.tsx — Phase 1 ohne i18n).
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npx tsc -b --noEmit 2>&amp;1 | tail -10 &amp;&amp; cd portal &amp;&amp; timeout 8 npm run dev 2>&amp;1 | tail -10 || true</automated>
  </verify>
  <done>
    main.tsx + app.tsx sind aktualisiert nach 3fls-Pattern. `npm run dev` startet ohne Errors. RouterProvider hat Context mit auth.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 7: Vitest-Setup mit Mocked AuthProvider + erster Smoke-Test</name>
  <files>portal/vitest.config.ts, portal/src/test/setup.ts, portal/src/api/__tests__/fetch.spec.ts, portal/src/api/__tests__/error-message.spec.ts</files>
  <read_first>
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\portal\vitest.config.ts (1:1)
    - portal/src/api/fetch.ts (aus Task 3 — wird getestet)
    - portal/src/api/error-message.ts (aus Task 3 — wird getestet)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `portal/vitest.config.ts`)
  </read_first>
  <behavior>
    - `npm test` läuft Vitest im Watch-Mode; `npm run test:run` einmalig.
    - `@testing-library/jest-dom` ist via setup.ts geladen (matchers wie `toBeInTheDocument`).
    - `fetch.spec.ts` hat 3 Tests: (a) apiFetch hängt Bearer-Token an wenn auth.currentUser existiert, (b) apiFetch wirft ApiError bei 401, (c) apiFetch returnt undefined bei 204.
    - `error-message.spec.ts` hat 3 Tests: (a) apiErrorMessage liefert DE-String für E_MODEL_LOCKED, (b) apiErrorMessage liefert fallback für unbekannten Code, (c) apiErrorMessage liefert err.message für nicht-ApiError.
  </behavior>
  <action>
    `portal/vitest.config.ts` (1:1 aus tbx_stzrim, angepasst):
    - `import { defineConfig } from "vitest/config"`
    - `import react from "@vitejs/plugin-react"`
    - `import tsconfigPaths from "vite-tsconfig-paths"` (optional; sonst paths-Alias manuell auflisten in resolve.alias)
    - `defineConfig({ plugins: [react()], test: { globals: true, environment: "jsdom", setupFiles: ["./src/test/setup.ts"], css: false } })`
    - resolve.alias `@` → src wie in vite.config.ts

    `portal/src/test/setup.ts`:
    - `import "@testing-library/jest-dom/vitest"`
    - Mock `@/auth/firebase`: `vi.mock("@/auth/firebase", () => ({ auth: { currentUser: null } }))` — Module-Level-Mock; in einzelnen Tests via `auth.currentUser = { getIdToken: vi.fn().mockResolvedValue("FAKE_TOKEN") }` überschreiben.
    - Global `vi.stubGlobal("fetch", vi.fn())`-Pattern als Helfer (optional in einzelnen Tests).

    `portal/src/api/__tests__/fetch.spec.ts`:
    - Test 1 "fügt Bearer-Token hinzu wenn user authentisiert": setze auth.currentUser via Test-Mock, mocke fetch zu `new Response(JSON.stringify({}), { status: 200 })`, rufe apiFetch("/foo"), prüfe dass fetch mit Header `Authorization: Bearer FAKE_TOKEN` aufgerufen wurde.
    - Test 2 "wirft ApiError bei 401": mocke fetch zu Response status=401, expect apiFetch.then() throws ApiError mit status=401.
    - Test 3 "returnt undefined bei 204": mocke fetch zu Response status=204, expect await apiFetch("/foo") === undefined.

    `portal/src/api/__tests__/error-message.spec.ts`:
    - Test 1 "liefert deutsche Nachricht für E_MODEL_LOCKED": `new ApiError(409, "Conflict", { code: "E_MODEL_LOCKED", message: "..." })`, expect apiErrorMessage() === "Modell wird gerade von einem anderen Nutzer bearbeitet."
    - Test 2 "liefert fallback bei unbekanntem Code": new ApiError(500, ..., { code: "E_UNKNOWN" }), expect apiErrorMessage() endet auf "(HTTP 500)."
    - Test 3 "liefert err.message für plain Error": expect apiErrorMessage(new Error("Network down")) === "Network down"
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npm run test:run 2>&amp;1 | tail -15</automated>
  </verify>
  <done>
    vitest.config.ts existiert. setup.ts mockt @/auth/firebase. 6 Tests in 2 Spec-Files, alle grün. `npm run test:run` läuft fehlerfrei.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → Backend | Bearer-Token wird via fetch verschickt; CSRF nicht relevant da kein Cookie-Auth |
| Firebase-SDK → Backend | Token-Refresh läuft browser-seitig; verifikation backend-seitig |
| User-Input (Login-Form) → Firebase | Email+Passwort via Firebase-SDK; kein eigenes Credential-Handling |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-01 | Spoofing | Token-Refresh-Race | mitigate | Firebase-SDK cached Token + Auto-Refresh; getIdToken(false) verwendet Cache, getIdToken(true) erzwingt Refresh |
| T-03-02 | Information Disclosure | Firebase-API-Key im Frontend-Bundle | accept | Firebase-Client-API-Keys sind Public-by-Design (Domain-Whitelist im Firebase-Project schützt) |
| T-03-03 | Tampering | XSS via Toast-Message-Inhalt aus Backend | mitigate | sonner escaped Strings; KEIN dangerouslySetInnerHTML |
| T-03-04 | Information Disclosure | Sensitive-Daten in localStorage/IndexedDB | accept | Phase 1 speichert nur Modell-Snapshots (kein PII); per Tenant isoliert via IndexedDB-DB-Namen in Plan 11 |
| T-03-05 | Repudiation | Frontend-Logging von Auth-Events | accept | Phase 1: nur console.error bei Login-Fehler; structurierter Frontend-Log kommt in Phase 5 |
</threat_model>

<verification>
- `cd portal && npm install` läuft ohne Errors
- `cd portal && npm run dev` startet Vite auf Port 3002
- `cd portal && npm run build` läuft fehlerfrei
- `cd portal && npm run lint` läuft fehlerfrei
- `cd portal && npm run test:run` läuft 6 Tests, alle grün
- Manuelle Smoke-Test: Browser → http://localhost:3002 → automatischer Redirect zu /login (kommt in Plan 05)
</verification>

<success_criteria>
SC-2 (User-Register/Login via Firebase-Emulator; Tenant-Bootstrap beim ersten /api/v1/auth/me):
- Frontend-Anteil: Login-Form + AuthProvider + apiFetch sind funktional. Backend-Anteil ist Plan 02. End-to-End-Test ist Plan 05.
</success_criteria>

<output>
After completion, create `.planning/phases/01-vertical-slice/01-03-SUMMARY.md` with:
- Liste der 3fls-1:1-Übernahmen vs. eigene Anpassungen
- Lib-Stack-Abweichungen von RESEARCH.md (lucide-react statt react-icons; keine extra isReady-Flag)
- Welche shadcn-Komponenten installiert sind und welche noch fehlen (kommen mit OCtrls in Plan 06)
- Hinweis dass `npm run dev` jetzt + Plan 02 (Backend startet auf :8000) + Plan 05 (docker-compose mit Firebase-Emulator) zusammen ein funktionierendes Login-Flow ergeben
</output>
</content>
</invoke>