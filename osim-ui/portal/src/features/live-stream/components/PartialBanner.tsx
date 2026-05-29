/**
 * PartialBanner — Banner für partial-Streams + Schema-Mismatch (Plan 01-05
 * Task 2, D-2.2 / D-OP-4 / AC-7).
 *
 * Liest direkt aus dem Live-Stream-Store (D-4.2):
 *   (a) `streamStatus[tag].status === "partial"` → ein neutral-informatives
 *       Banner „Stream unvollständig (fehlende Slices …, Grund …)". Quelle:
 *       meta.json.streams (01-04).
 *   (b) `schemaMismatch === true` → ein gelbes Warn-Banner „einige Daten
 *       möglicherweise unvollständig" (Best-Effort, KEIN Hard-Block/Crash;
 *       D-OP-4, AC-7).
 *
 * A11y (3FLS-Guide): Status nie nur über Farbe — jedes Banner trägt zusätzlich
 * ein Symbol (ℹ/⚠) + Text. Styling strikt über Design-Tokens (das gelbe
 * Warn-Banner nutzt das `warning`-Token bzw. dessen Fallback, keine ad-hoc
 * Hex-Werte).
 */

import * as React from "react";
import { useLiveStreamStore } from "../store";
import type { StreamTag } from "../types";

export interface PartialBannerProps {
  /** Stream-Tag, dessen partial-Status angezeigt werden soll. */
  tag: StreamTag;
}

export function PartialBanner({ tag }: PartialBannerProps): React.ReactElement | null {
  const status = useLiveStreamStore((s) => s.streamStatus[tag]);
  const schemaMismatch = useLiveStreamStore((s) => s.schemaMismatch);

  const isPartial = status?.status === "partial";
  if (!isPartial && !schemaMismatch) return null;

  const missing = status?.missing_slices ?? [];
  const reason = status?.reason;

  return (
    <div className="flex flex-col gap-2" data-testid={`partial-banner-${tag}`}>
      {schemaMismatch && (
        <p
          role="alert"
          data-testid="schema-mismatch-banner"
          className="inline-flex items-center gap-2 rounded-md border border-warning-border bg-warning-bg px-3 py-1 text-sm font-medium text-foreground"
        >
          <span aria-hidden="true">⚠</span>
          <span>
            Schema-Version unbekannt — einige Daten möglicherweise unvollständig
            (Best-Effort-Darstellung).
          </span>
        </p>
      )}
      {isPartial && (
        <p
          role="status"
          data-testid={`partial-status-${tag}`}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-1 text-sm text-muted-foreground"
        >
          <span aria-hidden="true">ℹ</span>
          <span>
            Stream unvollständig
            {missing.length > 0 && ` (fehlende Slices: ${missing.join(", ")})`}
            {reason ? ` — ${reason}` : ""}
          </span>
        </p>
      )}
    </div>
  );
}
