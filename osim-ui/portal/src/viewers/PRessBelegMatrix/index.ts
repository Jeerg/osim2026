/**
 * Barrel-Export fuer die PRessBelegMatrix-Viewer-Familie (Welle 1.2-E).
 *
 * Konsumenten:
 *   - `portal/src/viewers/setup.ts` registriert PRessBelegMatrixViewer
 *     unter (klass="PRessBeleg", hint="matrix").
 *   - Specs in `portal/src/viewers/__tests__/PRessBelegMatrixViewer*.spec.tsx`.
 */

export { PRessBelegMatrixViewer } from "./PRessBelegMatrixViewer";
export {
  PRessBelegMatrixToolbar,
  VERK_STATUS,
  VIEW_MODI,
  VERK_MODI,
} from "./PRessBelegMatrixToolbar";
export type { PRessBelegMatrixToolbarProps } from "./PRessBelegMatrixToolbar";
