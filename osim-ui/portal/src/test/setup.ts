import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Globaler Mock für `@/auth/firebase`. Tests, die einen authentisierten User
// brauchen, überschreiben `auth.currentUser` per-Test:
//
//     import { auth } from "@/auth/firebase";
//     (auth as unknown as { currentUser: unknown }).currentUser = {
//       getIdToken: vi.fn().mockResolvedValue("FAKE_TOKEN"),
//     };
//
// Default ist `null` (kein User eingeloggt).
vi.mock("@/auth/firebase", () => ({
  auth: { currentUser: null },
}));

// matchMedia ist in jsdom nicht implementiert — manche shadcn/Component-Libs
// rufen es beim Mount auf. Stub damit Tests nicht crashen.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// jsdom 29 implementiert die Pointer-Capture- und scrollIntoView-Methoden
// nicht. Radix-Primitives (Select, Combobox, Dialog) rufen diese in ihren
// Pointer-Event-Handlern. Wir stubbern sie auf das Element-Prototype, damit
// die Mount- und Click-Handler nicht crashen.
//
// Bekannter jsdom-Issue, dokumentiert u.a. unter
// https://github.com/radix-ui/primitives/issues/1882
type PointerStub = {
  hasPointerCapture: () => boolean;
  setPointerCapture: () => void;
  releasePointerCapture: () => void;
  scrollIntoView: () => void;
};
if (typeof Element !== "undefined") {
  const proto = Element.prototype as unknown as PointerStub;
  if (typeof proto.hasPointerCapture !== "function") {
    proto.hasPointerCapture = () => false;
  }
  if (typeof proto.setPointerCapture !== "function") {
    proto.setPointerCapture = () => {};
  }
  if (typeof proto.releasePointerCapture !== "function") {
    proto.releasePointerCapture = () => {};
  }
  if (typeof proto.scrollIntoView !== "function") {
    proto.scrollIntoView = () => {};
  }
}
