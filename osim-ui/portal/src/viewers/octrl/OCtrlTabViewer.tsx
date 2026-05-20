// Plan 01-04 Task 3: OCtrlTabViewer — Tab-Container.
//
// Portierung von OCtrlTabViewer.h (C++): CTabCtrl mit OCtrlTabChild's.
// Phase 1: einfacher Tab-Switch ohne Store-Roundtrip (alle Tabs operieren
// auf demselben Objekt). Falls Tabs unterschiedliche Sub-Objekte zeigen
// sollen, kann der Konsument innerhalb des Tab-Inhalts einen ChildCtrl
// auf das jeweilige Sub-Objekt verwenden.

import { useState, type ReactNode } from "react";

export interface TabSpec {
  label: string;
  render: () => ReactNode;
}

export interface OCtrlTabViewerProps {
  tabs: TabSpec[];
  /** Default-aktiver Tab-Index. */
  defaultIndex?: number;
}

export function OCtrlTabViewer({
  tabs,
  defaultIndex = 0,
}: OCtrlTabViewerProps) {
  const [active, setActive] = useState(defaultIndex);
  const current = tabs[active];
  return (
    <div className="text-sm" data-testid="octrl-tabviewer">
      <div className="flex border-b border-gray-200">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            type="button"
            onClick={() => setActive(i)}
            className={
              i === active
                ? "border-b-2 border-blue-700 px-3 py-1 text-blue-700"
                : "px-3 py-1 text-gray-500 hover:text-gray-700"
            }
            data-testid={`octrl-tabviewer-tab-${i}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-3">{current?.render()}</div>
    </div>
  );
}
