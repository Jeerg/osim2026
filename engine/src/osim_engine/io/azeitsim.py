"""AZeitSim.exe-Roundtrip-Runner für Counter-Vergleiche Python ↔ C++.

Hintergrund: das C++-Original OSim2004 ist eine MFC-GUI-Anwendung ohne
Batch-Modus. Über die in Phase-4-Nachklang erprobte Windows-Automation
können wir AZeitSim.exe trotzdem vollautomatisch laufen lassen:

    Workflow:
    1. AZeitSim.exe <otx-path> starten   (Modell wird geladen)
    2. WM_COMMAND 4003 → Steuerungsfenster öffnet
    3. WM_COMMAND 4030 → Simulation startet
    4. Polling bis die Steuerungs-Counter stabil sind
    5. WM_COMMAND 57603 (ID_FILE_SAVE) → OTX überschrieben mit Post-State
    6. Prozess beenden

Plattform: Nur Windows. Auf anderen OS wird ein `RuntimeError` geworfen.

Verwendung:
    >>> from osim_engine.io.azeitsim import run_azeitsim
    >>> result = run_azeitsim(input_otx=Path("input.otx"))
    >>> print(f"Sim-Dauer: {result.duration_seconds}s, Events: {result.event_count}")
    >>> # result.otx_after enthält den OtxFile-Post-State

CLI:
    python -m osim_engine.io.azeitsim INPUT.otx [WORKING.otx]
"""

from __future__ import annotations

import ctypes
import shutil
import subprocess
import sys
import time
from ctypes import wintypes
from dataclasses import dataclass
from pathlib import Path

from osim_engine.io.otx_reader import OtxFile, parse_otx_file


# ----------------------------------------------------------------------
# Konstanten — Menü- und Control-IDs aus OSim-Source verifiziert
# ----------------------------------------------------------------------

ID_SIMULATOR_STEUERUNG = 4003  # Simulator > Steuerung
ID_PSIM_START = 4030  # Steuerungsfenster „Start"-Button
ID_FILE_SAVE = 57603  # Datei > Speichern (MFC-Standard)

WM_COMMAND = 0x0111

# Default-Pfade — können via Argument überschrieben werden
DEFAULT_AZEITSIM_EXE = Path(r"C:\Users\JörgWFischer\PycharmProjects\OSim2004\AZeitSim.exe")
DEFAULT_AZEITSIM_CWD = Path(r"C:\Users\JörgWFischer\PycharmProjects\OSim2004")


# ----------------------------------------------------------------------
# Win32-Bindings (ctypes)
# ----------------------------------------------------------------------


def _check_windows() -> None:
    if sys.platform != "win32":
        raise RuntimeError(
            "azeitsim-Runner ist nur auf Windows verfügbar (AZeitSim.exe + Win32 API)."
        )


_user32 = ctypes.windll.user32 if sys.platform == "win32" else None

if _user32 is not None:
    _EnumWindowsProc = ctypes.WINFUNCTYPE(
        wintypes.BOOL, wintypes.HWND, wintypes.LPARAM
    )

    _user32.EnumWindows.argtypes = [_EnumWindowsProc, wintypes.LPARAM]
    _user32.EnumWindows.restype = wintypes.BOOL
    _user32.EnumChildWindows.argtypes = [wintypes.HWND, _EnumWindowsProc, wintypes.LPARAM]
    _user32.EnumChildWindows.restype = wintypes.BOOL
    _user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    _user32.GetWindowThreadProcessId.restype = wintypes.DWORD
    _user32.IsWindowVisible.argtypes = [wintypes.HWND]
    _user32.IsWindowVisible.restype = wintypes.BOOL
    _user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    _user32.GetWindowTextW.restype = ctypes.c_int
    _user32.GetDlgCtrlID.argtypes = [wintypes.HWND]
    _user32.GetDlgCtrlID.restype = ctypes.c_int
    _user32.PostMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
    _user32.PostMessageW.restype = wintypes.BOOL


def _get_window_text(hwnd: int) -> str:
    buf = ctypes.create_unicode_buffer(256)
    _user32.GetWindowTextW(hwnd, buf, 256)
    return buf.value


def _find_process_windows(pid: int, title_substring: str = "") -> list[int]:
    """Alle sichtbaren Top-Level-Fenster eines Prozesses (optional Title-Filter)."""
    hwnds: list[int] = []

    def callback(hwnd: int, _: int) -> bool:
        wpid = wintypes.DWORD()
        _user32.GetWindowThreadProcessId(hwnd, ctypes.byref(wpid))
        if wpid.value == pid and _user32.IsWindowVisible(hwnd):
            if not title_substring or title_substring in _get_window_text(hwnd):
                hwnds.append(hwnd)
        return True

    _user32.EnumWindows(_EnumWindowsProc(callback), 0)
    return hwnds


def _find_child_by_ctrl_id(parent_hwnd: int, ctrl_id: int) -> int | None:
    """Erstes Descendant-Fenster mit der gegebenen Control-ID (rekursiv)."""
    found: list[int] = []

    def callback(hwnd: int, _: int) -> bool:
        if _user32.GetDlgCtrlID(hwnd) == ctrl_id:
            found.append(hwnd)
            return False  # Abbrechen
        return True

    _user32.EnumChildWindows(parent_hwnd, _EnumWindowsProc(callback), 0)
    return found[0] if found else None


def _read_dlg_observer_static(parent_hwnd: int, ctrl_id: int) -> str | None:
    """Liest den Text-Inhalt eines Observer-Static-Controls im Steuerungsfenster."""
    h = _find_child_by_ctrl_id(parent_hwnd, ctrl_id)
    if h is None:
        return None
    return _get_window_text(h)


def _post_command(hwnd: int, cmd_id: int) -> None:
    _user32.PostMessageW(hwnd, WM_COMMAND, cmd_id, 0)


# ----------------------------------------------------------------------
# Ergebnis-Datenklasse
# ----------------------------------------------------------------------


@dataclass
class RunResult:
    """Ergebnis eines AZeitSim-Roundtrip-Laufs."""
    working_otx: Path
    otx_after: OtxFile
    # Counter aus dem Steuerungsfenster — falls erfasst
    duration_seconds: int | None
    event_count: int | None
    # Roh-Zeitmessung (Wall-Clock)
    wall_clock_seconds: float


# ----------------------------------------------------------------------
# Haupt-API
# ----------------------------------------------------------------------


def run_azeitsim(
    input_otx: Path,
    *,
    working_otx: Path | None = None,
    azeitsim_exe: Path | None = None,
    azeitsim_cwd: Path | None = None,
    boot_timeout: float = 10.0,
    run_timeout: float = 120.0,
    stable_polls: int = 4,
    min_sim_duration: int = 0,
) -> RunResult:
    """Führt AZeitSim.exe auf einer Kopie der `input_otx` aus.

    Args:
        input_otx: Pfad zur Eingabe-OTX. Wird nicht modifiziert.
        working_otx: Optionaler Pfad für die Arbeits-Kopie. Wenn nicht
            gegeben, wird neben `input_otx` ein `*-azeitsim-work.otx`
            angelegt. **Diese Datei wird vom Lauf überschrieben** und
            enthält am Ende den Post-Run-State.
        azeitsim_exe: Pfad zur AZeitSim.exe. Default siehe Konstante.
        azeitsim_cwd: Working-Directory beim Launch (DLL-Suchpfad).
        boot_timeout: Sekunden bis das Hauptfenster sichtbar sein muss.
        run_timeout: Sekunden für den eigentlichen Sim-Lauf.
        stable_polls: Anzahl Polls mit unverändertem Event-Count, nach
            der die Sim als „fertig" gilt.

    Returns:
        RunResult mit geparstem Post-Run-OtxFile + Lauf-Metriken.

    Raises:
        RuntimeError: bei Nicht-Windows, fehlenden Fenstern oder Timeout.
    """
    _check_windows()

    exe = azeitsim_exe or DEFAULT_AZEITSIM_EXE
    cwd = azeitsim_cwd or DEFAULT_AZEITSIM_CWD
    if not exe.exists():
        raise RuntimeError(f"AZeitSim.exe nicht gefunden: {exe}")
    input_otx = Path(input_otx).resolve()
    if not input_otx.exists():
        raise FileNotFoundError(f"Input-OTX nicht gefunden: {input_otx}")

    # Arbeits-Kopie anlegen (absoluter Pfad, damit AZeitSim ihn aus seinem
    # eigenen CWD korrekt auflöst)
    if working_otx is None:
        working_otx = input_otx.with_suffix(".azeitsim-work.otx")
    working_otx = Path(working_otx).resolve()
    shutil.copy2(input_otx, working_otx)

    wall_start = time.perf_counter()
    proc = subprocess.Popen(
        [str(exe), str(working_otx)],
        cwd=str(cwd),
    )

    try:
        main_hwnd = _wait_for_main_window(proc.pid, boot_timeout)
        steuerung_hwnd = _open_steuerung(main_hwnd, timeout=5.0)
        _start_simulation(steuerung_hwnd)
        duration, events = _wait_for_completion(
            steuerung_hwnd, timeout=run_timeout, stable_polls=stable_polls,
            min_sim_duration=min_sim_duration,
        )
        _save_otx(main_hwnd, working_otx)
        wall_seconds = time.perf_counter() - wall_start
    finally:
        try:
            proc.terminate()
            proc.wait(timeout=5.0)
        except (subprocess.TimeoutExpired, OSError):
            proc.kill()

    return RunResult(
        working_otx=working_otx,
        otx_after=parse_otx_file(working_otx),
        duration_seconds=duration,
        event_count=events,
        wall_clock_seconds=wall_seconds,
    )


# ----------------------------------------------------------------------
# Lifecycle-Helfer
# ----------------------------------------------------------------------


def _wait_for_main_window(pid: int, timeout: float) -> int:
    deadline = time.perf_counter() + timeout
    while time.perf_counter() < deadline:
        windows = _find_process_windows(pid, title_substring="OSim-Ent")
        if windows:
            return windows[0]
        time.sleep(0.2)
    raise RuntimeError(f"Hauptfenster (PID={pid}) nicht innerhalb {timeout}s sichtbar.")


def _open_steuerung(main_hwnd: int, *, timeout: float) -> int:
    _post_command(main_hwnd, ID_SIMULATOR_STEUERUNG)
    pid = wintypes.DWORD()
    _user32.GetWindowThreadProcessId(main_hwnd, ctypes.byref(pid))
    deadline = time.perf_counter() + timeout
    while time.perf_counter() < deadline:
        windows = _find_process_windows(pid.value, title_substring="Steuerung")
        if windows:
            return windows[0]
        time.sleep(0.2)
    raise RuntimeError(f"Steuerungsfenster nicht innerhalb {timeout}s geöffnet.")


def _start_simulation(steuerung_hwnd: int) -> None:
    # WM_COMMAND mit BN_CLICKED-LowWord=ctrl_id an die Steuerung
    _post_command(steuerung_hwnd, ID_PSIM_START)


# Control-IDs im Steuerungsfenster (aus Phase-4 ermittelt)
# Die Zuordnung welcher Observer welche Bedeutung hat, leiten wir aus
# den umgebenden Static-Labels ab — diese IDs sind die m_iSZeit*-Outputs.
_OBSERVER_DAUER = 10024
_OBSERVER_EREIG_GESAMT = 10026
_OBSERVER_EREIG_AKTUELL = 10025


def _parse_int_or_none(s: str | None) -> int | None:
    if s is None or s == "":
        return None
    try:
        return int(s)
    except ValueError:
        return None


def _wait_for_completion(
    steuerung_hwnd: int, *, timeout: float, stable_polls: int,
    min_sim_duration: int = 0,
) -> tuple[int | None, int | None]:
    """Pollt das Steuerungsfenster, bis die Event-Zahl stabil ist.

    Args:
        min_sim_duration: Mindest-Sim-Zeit (in Sekunden) bis "stable" als
            Stopp-Signal akzeptiert wird. Ohne diesen Guard erkennt das
            Polling bei m_bIsEntAktiv=True-Modellen sehr früh "fertig",
            weil zwischen den Entscheider-Auslösungen kaum Events anfallen.
            Default 0 = sofort akzeptieren (kompatibel mit alten Aufrufern).
    """
    deadline = time.perf_counter() + timeout
    last_events: int | None = None
    stable = 0
    duration: int | None = None
    events: int | None = None
    # Mindest-Wartezeit, damit wir nicht direkt nach Click „stable" sehen
    time.sleep(0.5)
    while time.perf_counter() < deadline:
        time.sleep(0.5)
        events = _parse_int_or_none(
            _read_dlg_observer_static(steuerung_hwnd, _OBSERVER_EREIG_GESAMT)
        )
        duration = _parse_int_or_none(
            _read_dlg_observer_static(steuerung_hwnd, _OBSERVER_DAUER)
        )
        if events == last_events and events is not None and events > 0:
            stable += 1
            # Stable nur akzeptieren wenn Sim-Zeit mindestens min_sim_duration
            if stable >= stable_polls and (duration or 0) >= min_sim_duration:
                return duration, events
        else:
            stable = 0
        last_events = events
    # Timeout — geben wir trotzdem die letzten Werte zurück
    return duration, events


def _save_otx(main_hwnd: int, expected_path: Path, timeout: float = 60.0) -> None:
    """Sendet ID_FILE_SAVE und wartet, bis die Datei modifiziert wurde.

    Args:
        timeout: Maximale Wartezeit auf mtime-Änderung. Default 60s
            (Bosch2-OTX hat 18 MB und braucht spürbar länger als kleine
            Modelle). Für sehr große Modelle ggf. weiter erhöhen.

    Nach Erkennung der mtime-Änderung wird gewartet, bis die Datei-
    Größe sich für 1s stabil hält (Indikator für abgeschlossenen Write).
    """
    mtime_before = expected_path.stat().st_mtime
    _post_command(main_hwnd, ID_FILE_SAVE)
    deadline = time.perf_counter() + timeout
    while time.perf_counter() < deadline:
        time.sleep(0.2)
        try:
            if expected_path.stat().st_mtime > mtime_before:
                # Warten bis Datei-Größe stabil → Write abgeschlossen
                last_size = -1
                stable_since = time.perf_counter()
                while time.perf_counter() - stable_since < 1.0:
                    time.sleep(0.2)
                    try:
                        size = expected_path.stat().st_size
                    except FileNotFoundError:
                        continue
                    if size != last_size:
                        last_size = size
                        stable_since = time.perf_counter()
                return
        except FileNotFoundError:
            pass
    raise RuntimeError(
        f"Save-Operation hat OTX nicht modifiziert (timeout={timeout}s): {expected_path}"
    )


# ----------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------


def _cli(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print("Usage: python -m osim_engine.io.azeitsim INPUT.otx [WORKING.otx]")
        return 1
    input_otx = Path(argv[1])
    working = Path(argv[2]) if len(argv) > 2 else None
    result = run_azeitsim(input_otx=input_otx, working_otx=working)
    print(f"Working OTX: {result.working_otx}")
    print(f"Sim-Dauer:   {result.duration_seconds}s")
    print(f"Events:      {result.event_count}")
    print(f"Wall-Clock:  {result.wall_clock_seconds:.1f}s")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(_cli(sys.argv))
