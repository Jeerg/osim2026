# Deferred Items — Phase 01.2

Out-of-scope-Befunde aus Plan-Ausführung, die NICHT durch die jeweilige Welle verursacht wurden und nicht in deren Scope fallen.

## Plan 02 (Welle A — MatrixGrid + MatrixCell)

### Pre-existing TypeScript-Errors (3) im Graph-Foundation-Code

Bei `tsc -p tsconfig.app.json --noEmit` werden in der Welle-A-Validierung folgende Errors gemeldet, die **vor Plan 02 bereits im Codebase existierten** (git blame zeigt: Welle G24/G26/G27 in Phase 01.1, vor 5839108):

```
src/graph/foundation/__tests__/GObjSub-MultiGrid.spec.ts(88,20): error TS2774:
  This condition will always return true since this function is always defined.
  Did you mean to call it instead?

src/graph/foundation/interactions.ts(185,39): error TS2339:
  Property 'pGridPos' does not exist on type 'OGPosition'.

src/graph/foundation/interactions.ts(186,39): error TS2339:
  Property 'pGridPos' does not exist on type 'OGPosition'.
```

**Status:** NICHT von Welle 1.2-A verursacht. Die Matrix-Foundation
(`src/graph/foundation/matrix/*`) ist tsc-clean — beim Filtern nach `matrix`
in der tsc-Output kommen 0 Treffer.

**Empfehlung:** Eigene Mini-Welle in Phase 01.2 oder als Cleanup-Item in
Phase 01.3. Die Vitest-Tests laufen trotz dieser tsc-Errors grün (33 Files
/ 198 passed / 2 skipped), das Verhalten ist also nicht blockierend.
