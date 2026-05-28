import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";

// 1:1-Übernahme aus tbx_stzrim/portal/src/auth/firebase.ts (Plan 01-03 PATTERNS.md
// §portal/src/auth/*). Pitfall #9: Emulator-Auto-Connect NUR via
// `import.meta.env.DEV`, nicht via custom env-var — sonst landet Dev-Code im
// Production-Build.

// Dev-Defaults für den Emulator (public-by-design — der Emulator validiert
// den API-Key nicht). Falls VITE_*-Env-Vars gesetzt sind, gewinnen die.
const firebaseConfig = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ?? "demo-api-key-for-emulator",
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "osim-dev.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "osim-dev",
};

const app = initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);

// Dev-Mode: Firebase Auth Emulator. Try/catch fängt den HMR-Reconnect ab.
if (import.meta.env.DEV) {
  try {
    connectAuthEmulator(auth, "http://localhost:19099", {
      disableWarnings: true,
    });
  } catch {
    // Emulator-Connection besteht bereits (Vite-HMR-safe).
  }
}
