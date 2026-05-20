import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", "src/routeTree.gen.ts"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      // TanStack-Router-File-Routes muessen sowohl `Route` als auch die
      // Component exportieren — das ist der vom Plugin vorgegebene
      // Convention. Wir erlauben `Route` als zusaetzlichen Export.
      // Analog fuer Context-Provider-Pattern (z.B. AuthContext + AuthProvider).
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true, allowExportNames: ["Route", "AuthContext"] },
      ],
    },
  },
  // Route-Dateien des TanStack Routers kombinieren konventionell den
  // Route-Const-Export mit einer in-File-Komponente. Wir disablen
  // hier die Fast-Refresh-Regel; HMR funktioniert in Praxis trotzdem,
  // weil der Router-Plugin im Hintergrund die Route-Defs handlt.
  {
    files: ["src/routes/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  // Viewer-Foundation: ViewerHost und ChildCtrl waehlen die ChildDialog-
  // Komponente ZUR RENDER-ZEIT aus der viewer-registry. Das ist der
  // GENAUE Sinn der Registry (D-07) — wir deaktivieren die strict-Regel
  // "react-hooks/static-components" fuer diese Files. Re-Mount bei
  // Klassen-Wechsel ist gewollt.
  //
  // Plus: ChildDialog.tsx exportiert Context + Hook (useChildDialog) neben
  // der Komponente — Fast-Refresh-Regel ist hier irrelevant.
  {
    files: ["src/viewers/core/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/static-components": "off",
      "react-refresh/only-export-components": "off",
    },
  },
  // OCtrl-Familie: einige OCtrls exportieren Konvertierungs-Helfer
  // (colorrefToHex / hexToColorref) oder Types (LogFontValue) neben der
  // Komponente. Fast-Refresh-Regel deaktivieren — HMR funktioniert hier
  // implizit via React-Reconciler.
  {
    files: ["src/viewers/octrl/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  // Test-Dateien duerfen mehr (mock-Components, beforeEach mit Side-Effects).
  {
    files: ["**/__tests__/**/*.{ts,tsx}", "src/test-setup.ts"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
]);
