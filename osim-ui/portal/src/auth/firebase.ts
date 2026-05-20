// Plan 01-04 Task 1: Firebase-Client. 1:1 aus tbx_stzrim uebernommen.
// Im Dev-Modus wird gegen den lokalen Firebase-Auth-Emulator gesprochen
// (Port 9099, gestartet via docker-compose aus Plan 01-02).
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "demo-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "osim-ui-dev.local",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "osim-ui-dev",
};

const app = initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);

// Connect to Firebase Auth Emulator in dev mode.
// Try/catch weil HMR-Reloads den Emulator-Connect doppelt triggern wuerden.
if (import.meta.env.DEV) {
  try {
    connectAuthEmulator(auth, "http://localhost:9099", {
      disableWarnings: true,
    });
  } catch {
    // Emulator already connected (hot-reload safe)
  }
}
