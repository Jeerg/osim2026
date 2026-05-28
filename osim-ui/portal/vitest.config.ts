import { defineConfig } from "vitest/config";
// react() liefert eine Vite-7-Plugin-Definition. Vitest 2.x bringt eine
// eigene (ältere) Vite-Kopie mit — der Plugin-Type-Mismatch zwischen den
// beiden Vite-Versionen führt zu einem TypeScript-Fehler, ist aber
// laufzeit-unkritisch. `as any` ist hier der saubereste Workaround;
// alternativ Upgrade auf vitest@^4 sobald Compat geprüft ist.
import react from "@vitejs/plugin-react";
import path from "node:path";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reactPlugin = react() as any;

// 1:1-Subset aus tbx_stzrim/portal/vitest.config.ts.
//   - react()-Plugin damit Vitest TSX-Files parsen kann.
//   - jsdom-Environment für DOM-APIs in Tests.
//   - globals=true ⇒ describe/it/expect ohne Imports.
//   - css=false: shadcn-CSS-Variables sind irrelevant für Unit-Tests.
export default defineConfig({
  plugins: [reactPlugin],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Workspace-Pakete (Track C — Architektur-Audit 2026-05-28 §5.4).
      "@osim/graphobject": path.resolve(
        __dirname,
        "./packages/graphobject/src/index.ts",
      ),
      "@osim/graphobject-react-flow": path.resolve(
        __dirname,
        "./packages/graphobject-react-flow/src/index.ts",
      ),
      "@osim/graphobject-canvas": path.resolve(
        __dirname,
        "./packages/graphobject-canvas/src/index.ts",
      ),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // E2E-Specs unter portal/e2e/ laufen via Playwright (`npm run test:e2e`),
    // NICHT via Vitest. Vitest's globMatch wuerde sie sonst aufpicken und
    // schlagen mit "Playwright Test did not expect test.describe() to be
    // called here" fehl (Plan 01-12-Fix).
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*",
      "e2e/**",
    ],
  },
});
