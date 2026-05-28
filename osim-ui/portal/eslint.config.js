import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

// Flat-Config (1:1 aus tbx_stzrim/portal/eslint.config.js mit zwei osim-ui-spezifischen Anpassungen):
//
// 1. routeTree.gen.ts global-ignore (Generated File).
// 2. react-refresh/only-export-components downgrade auf `warn` für TanStack-
//    Router-Konvention: routes/*.tsx MUSS `export const Route` + Component
//    nebeneinander haben — die HMR-Constraint ist hier irrelevant, weil der
//    Router-Vite-Plugin den Route-Manifest eh neu generiert.
//    Auch in ui/button.tsx (cva-export) und auth-provider.tsx (Context-Export)
//    sind diese gemischten Exports gewollt und 1:1 aus 3fls übernommen.
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
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      "react-refresh/only-export-components": "warn",
      // ViewerRegistry resolves stable component references per (klass, hint).
      // ESLint v7's react-hooks erkennt diese Pattern-Architektur als
      // "Component created during render" — false positive für das hier
      // dokumentierte Routing-Pattern (siehe ViewerFrame.tsx und
      // RESEARCH.md §Pattern 1). Downgrade auf warn, damit die
      // Foundation-Schicht baut.
      "react-hooks/static-components": "warn",
    },
  },
]);
