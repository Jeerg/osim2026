// Vitest setup file.
// Plan 01-04 Task 1: testing-library matchers fuer expect() global verfuegbar machen.
import "@testing-library/jest-dom/vitest";
// Plan 01-09 Task 1: fake-indexeddb-Polyfill fuer happy-dom (Dexie braucht IndexedDB).
// Stellt globale indexedDB/IDBKeyRange-Implementierung bereit, ohne dass jeder Test
// das selbst importieren muss.
import "fake-indexeddb/auto";
