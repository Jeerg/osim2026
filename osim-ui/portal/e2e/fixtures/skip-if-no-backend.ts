// Helper: Skip-Logic fuer Tests, die Backend + Firebase-Emulator brauchen.
//
// Wird zu Test-Start geprueft. Wenn /api/v1/health oder Firebase-Emulator
// (Port 9099) nicht antwortet, wird der gesamte Test geskipped -- so
// blockiert ein lokaler Setup-Fehler nicht den Test-Lauf.

import { test } from "@playwright/test";

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_BASE ?? "http://localhost:8000";
const FIREBASE_EMULATOR = process.env.PLAYWRIGHT_FIREBASE_EMULATOR
  ?? "http://localhost:9099";

let _backendOk: boolean | null = null;
let _firebaseOk: boolean | null = null;

async function probe(url: string, timeoutMs = 2000): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return r.ok || r.status === 401 || r.status === 404;
  } catch {
    return false;
  }
}

export async function backendIsUp(): Promise<boolean> {
  if (_backendOk !== null) return _backendOk;
  _backendOk = await probe(`${BACKEND_BASE}/health`);
  return _backendOk;
}

export async function firebaseEmulatorIsUp(): Promise<boolean> {
  if (_firebaseOk !== null) return _firebaseOk;
  // Emulator UI / Identity-Toolkit answers on root path with 200/404
  _firebaseOk = await probe(FIREBASE_EMULATOR);
  return _firebaseOk;
}

export async function skipIfNoBackend(): Promise<void> {
  const ok = await backendIsUp();
  test.skip(!ok, `Backend nicht erreichbar unter ${BACKEND_BASE} -- bitte 'uv run uvicorn app.main:app' starten`);
}

export async function skipIfNoFirebaseEmulator(): Promise<void> {
  const ok = await firebaseEmulatorIsUp();
  test.skip(!ok, `Firebase-Emulator nicht erreichbar unter ${FIREBASE_EMULATOR} -- bitte 'docker compose up firebase-emulator' starten`);
}

export async function skipIfNoStack(): Promise<void> {
  const be = await backendIsUp();
  const fe = await firebaseEmulatorIsUp();
  test.skip(!be || !fe, `Dev-Stack unvollstaendig: backend=${be}, firebase=${fe}`);
}
