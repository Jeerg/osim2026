# osim2026

Monorepo für die OSim2026-Plattform.

| Komponente | Pfad | Beschreibung |
|---|---|---|
| **engine** | [`engine/`](engine/) | 1:1-Portierung der OSim2004-C++-Codebase nach Python, headless. |
| **ui** | `ui/` | Web-/Desktop-UI für die Engine (separate Entwicklung, kommt parallel dazu). |

## Engine

Headless-Sim-Engine — Phase 5 strukturell vollständig (Slices A–N). Tests: 464 + 1 xfailed.

Details: [`engine/README.md`](engine/README.md).

## UI

Wird in einem parallelen Entwicklungs-Fenster aufgebaut und in dieses Repo unter `ui/` integriert.

## Designprinzip

Den existierenden C++-Code 1:1 übernehmen — nichts neu erfinden. Quelle: `OSim2004/OSimV01(Fj)/`.
