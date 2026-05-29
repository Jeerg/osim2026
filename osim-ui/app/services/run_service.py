"""RunService — startet Sim-Läufe als separate OS-Prozesse + liest deren Stream.

Plan 01-08 (GAP-2 + GAP-3). Schließt die Lücke, dass ein gespeichertes Modell
heute nicht ausgeführt werden kann und es keinen Datei-Read-Endpoint zwischen
dem containerisierten Portal und ``runs/<run-id>/stream.jsonl`` gibt.

Reproduzierbarkeitsvertrag (osim-ui/CLAUDE.md, heilig):
    Ein Sim-Lauf läuft in einem SEPARATEN OS-PROZESS (``subprocess.Popen`` von
    ``python -m osim_engine.streaming.run_otx``), NIEMALS in einem Thread. Die
    PAWLICEK-LCG ist ein Modul-Singleton — nur Prozess-Isolation garantiert
    Reproduzierbarkeit.

Pacing (beobachtbar live):
    Der gespawnte Lauf ist „paced" (``--pace`` aus ``default_pace``): er schreibt
    über ein kontrollierbares Wall-Clock-Fenster nach. ``start_run`` liest die
    ``RUN_DIR=``-Zeile aus stdout, OHNE auf das Prozess-Ende zu warten — der
    Prozess läuft im Hintergrund weiter (kein blockierendes ``wait``/
    ``communicate``).

run-dir-Layout (= storage.py-Konvention, Tenant-Prefix = Authz-Confinement):

    <runs_dir>/tenants/{tenant_id}/models/{model_id}/<run-id>/
        stream.jsonl       ← der wachsende Frame-Stream
        meta.json          ← Run-Metadaten (schema_version, coverage_ratio, ...)
        run_meta.json       ← Ownership-Persistenz {tenant_id, model_id, run_id}

Ownership-Persistenz (Plan-Entscheid): KEINE DB-Tabelle, KEINE Alembic-
Migration. Die AuthZ wird allein über den tenant-präfixierten run-dir-Pfad
durchgesetzt — ein run_id wird nur aufgelöst, wenn sein Verzeichnis physisch
unter ``<runs_dir>/tenants/{current_tenant}/`` liegt. ``run_meta.json``
dokumentiert die Ownership, ist aber NICHT der Auth-Entscheid.

Threat-Mitigations (siehe PLAN §threat_model):
    * T-RUN-01 / T-RUN-05: run_id steuert Pfad-Konstruktion; ``..``/``/``/``\\``
      → ValueError; nur fixe Dateinamen ``stream.jsonl``/``meta.json`` gelesen.
    * T-RUN-02: ``_resolve_run_dir`` sucht NUR unter dem Tenant-Prefix; nicht
      gefundene run_id → ``RunNotFound`` (kein Cross-Tenant-Leak).
    * T-RUN-03: subprocess-argv als Liste (kein ``shell=True``); otx-Pfad
      serverseitig als tempfile konstruiert; periods/pace int/float-validiert.
    * T-RUN-04: ``periods`` auf ``max_periods`` gecappt; Pacing bindet die
      Gesamt-Laufzeit zusätzlich.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path
from uuid import UUID

import structlog
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.services.model_service import ModelService
from app.services.storage import StorageService

log = structlog.get_logger(__name__)


class RunNotFound(KeyError):
    """run_id konnte unter dem Tenant-Prefix nicht aufgelöst werden.

    Subclass von ``KeyError`` — der Router mapped das auf HTTP 404
    ``E_RUN_NOT_FOUND`` (kein Cross-Tenant-Leak, T-RUN-02).
    """


def _assert_safe_run_id(run_id: str) -> None:
    """T-RUN-01: lehnt Pfad-Traversal-Segmente ab, BEVOR ein Pfad gebaut wird."""
    if not run_id or any(seg in run_id for seg in ("..", "/", "\\")):
        raise ValueError(f"Ungültige run_id (Traversal-Verdacht): {run_id!r}")


class RunService:
    """Pro-Request-Service zum Starten + Lesen von Sim-Läufen.

    Eine Instanz pro Request (FastAPI-Dependency-Scope). ``conn`` hat per
    ``get_db`` bereits ``search_path`` auf das Tenant-Schema gesetzt — der
    ModelService-Reuse trifft damit das richtige Schema.
    """

    def __init__(
        self,
        conn: Connection,
        storage: StorageService,
        tenant_id: str,
        user_uid: str,
        runs_dir: str,
        default_pace: float,
        max_periods: int,
    ) -> None:
        self.conn = conn
        self.storage = storage
        self.tenant_id = tenant_id
        self.user_uid = user_uid
        self.runs_dir = Path(runs_dir)
        self.default_pace = default_pace
        self.max_periods = max_periods
        # ModelService-Reuse für get_meta (404 wenn nicht im Tenant) + Storage.
        self._models = ModelService(
            conn=conn,
            storage=storage,
            tenant_id=tenant_id,
            user_uid=user_uid,
        )

    # ------------------------------------------------------------------
    # Pfad-Helfer (Tenant-Confinement)
    # ------------------------------------------------------------------

    def _tenant_models_base(self) -> Path:
        """``<runs_dir>/tenants/{tenant_id}/models`` (absolut)."""
        return (
            self.runs_dir.resolve()
            / "tenants"
            / self.tenant_id
            / "models"
        )

    def _model_run_base(self, model_id: UUID) -> Path:
        """run-Basis-Verzeichnis für ein Modell (run_otx legt darunter run-id)."""
        return self._tenant_models_base() / str(model_id)

    def _resolve_run_dir(self, run_id: str) -> Path:
        """Löst ``run_id`` zum konkreten run-dir auf — NUR unter dem Tenant-
        Prefix dieses Service-Aufrufs (T-RUN-02 Authz-Confinement).

        Raises:
            ValueError: run_id enthält Traversal-Segmente (T-RUN-01).
            RunNotFound: kein Verzeichnis ``.../models/*/run_id`` gefunden.
        """
        _assert_safe_run_id(run_id)
        base = self._tenant_models_base()
        if base.is_dir():
            for model_dir in base.iterdir():
                if not model_dir.is_dir():
                    continue
                candidate = model_dir / run_id
                if candidate.is_dir():
                    return candidate
        raise RunNotFound(run_id)

    # ------------------------------------------------------------------
    # start_run
    # ------------------------------------------------------------------

    def start_run(
        self,
        model_id: UUID,
        periods: int | None = None,
        pace: float | None = None,
    ) -> dict:
        """Startet einen paced Lauf des Modells in einem separaten OS-Prozess.

        Schreibt die aktuelle Modell-OTX in ein tempfile, spawnt
        ``run_otx`` (Popen, kein shell), liest die FRÜHE ``RUN_DIR=``-Zeile aus
        stdout (ohne auf Prozess-Ende zu warten) und persistiert ``run_meta.json``.

        Args:
            model_id: ID des zu startenden Modells (404 wenn nicht im Tenant).
            periods: Anzahl Perioden (auf ``max_periods`` gecappt, T-RUN-04).
            pace: Wall-Clock-Drossel (Default ``self.default_pace``).

        Returns:
            ``{"run_id", "run_dir", "model_id", "coverage_ratio", "status"}``.
        """
        # 404 wenn das Modell nicht im Tenant existiert (ModelService-Reuse).
        meta = self._models.get_meta(model_id)

        eff_periods = self.max_periods if periods is None else min(periods, self.max_periods)
        eff_periods = max(1, eff_periods)
        eff_pace = self.default_pace if pace is None else pace

        # Aktuelle OTX-Bytes laden (Latin-1 1:1) und als tempfile schreiben —
        # der otx-Pfad ist serverseitig konstruiert, NIE aus User-Input (T-RUN-03).
        row = self.conn.execute(
            text("SELECT storage_key FROM models WHERE id = :id"),
            {"id": str(model_id)},
        ).one_or_none()
        if row is None:  # pragma: no cover - get_meta hat bereits geprüft
            raise RunNotFound(str(model_id))
        otx_bytes = self.storage.get_object(row.storage_key)

        run_base = self._model_run_base(model_id)
        run_base.mkdir(parents=True, exist_ok=True)

        with tempfile.NamedTemporaryFile(
            mode="wb", suffix=".otx", delete=False
        ) as tmp:
            tmp.write(otx_bytes)
            tmp_path = Path(tmp.name)

        try:
            # SEPARATER OS-PROZESS (Reproduzierbarkeitsvertrag) — argv als Liste,
            # kein shell=True (T-RUN-03).
            proc = subprocess.Popen(  # noqa: S603
                [
                    sys.executable,
                    "-m",
                    "osim_engine.streaming.run_otx",
                    "--otx",
                    str(tmp_path),
                    "--run-dir",
                    str(run_base),
                    "--periods",
                    str(eff_periods),
                    "--pace",
                    str(eff_pace),
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )

            # FRÜHE RUN_DIR=-Zeile lesen, OHNE auf Prozess-Ende zu warten:
            # run_otx gibt sie laut Task-1-Kontrakt vor der Pacing-Schleife aus.
            run_dir_path = self._read_run_dir_line(proc)
        finally:
            # tempfile wird vom run_otx nur am Start gelesen (parse_otx_file
            # liest die Datei vollständig ein, bevor RUN_DIR= geprintet wird) —
            # nach dem frühen Read ist es sicher löschbar.
            tmp_path.unlink(missing_ok=True)

        run_id = run_dir_path.name

        # Ownership-Persistenz: run_meta.json (KEINE DB-Tabelle).
        run_meta = {
            "tenant_id": self.tenant_id,
            "model_id": str(model_id),
            "run_id": run_id,
        }
        (run_dir_path / "run_meta.json").write_text(
            json.dumps(run_meta, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        # coverage_ratio best-effort aus der (ggf. noch initialen) meta.json.
        coverage_ratio = None
        meta_file = run_dir_path / "meta.json"
        if meta_file.is_file():
            try:
                run_meta_json = json.loads(meta_file.read_text(encoding="utf-8"))
                coverage_ratio = run_meta_json.get("sim_config", {}).get(
                    "coverage_ratio"
                )
            except (json.JSONDecodeError, OSError):  # pragma: no cover - defensiv
                coverage_ratio = None

        log.info(
            "run.started",
            run_id=run_id,
            model_id=str(model_id),
            tenant_id=self.tenant_id,
            periods=eff_periods,
            pace=eff_pace,
            pid=proc.pid,
        )

        return {
            "run_id": run_id,
            "run_dir": run_dir_path,
            "model_id": meta.id,
            "coverage_ratio": coverage_ratio,
            "status": "running",
        }

    @staticmethod
    def _read_run_dir_line(proc: subprocess.Popen) -> Path:
        """Liest stdout zeilenweise bis zur ``RUN_DIR=``-Zeile.

        Blockiert NICHT auf Prozess-Ende — der Lauf ist paced und schreibt
        absichtlich über ein Wall-Clock-Fenster weiter. Wenn der Prozess vor der
        RUN_DIR=-Zeile endet (Fehler), wird ``RuntimeError`` mit stderr geworfen.
        """
        assert proc.stdout is not None
        for line in proc.stdout:
            line = line.rstrip("\r\n")
            if line.startswith("RUN_DIR="):
                return Path(line[len("RUN_DIR=") :])
        # EOF ohne RUN_DIR= → der Subprozess ist gescheitert.
        stderr = ""
        if proc.stderr is not None:
            stderr = proc.stderr.read()
        proc.wait()
        raise RuntimeError(
            f"run_otx-Subprozess endete ohne RUN_DIR=-Zeile (rc={proc.returncode}): "
            f"{stderr.strip()}"
        )

    # ------------------------------------------------------------------
    # read_stream / read_meta
    # ------------------------------------------------------------------

    def read_stream(self, run_id: str, offset: int = 0) -> dict:
        """Liest die ``stream.jsonl`` inkrementell ab ``offset`` (Byte-Offset).

        Returns:
            ``{"text": str, "next_offset": int}``. Bei ``offset >= filesize``
            ist ``text=""`` und ``next_offset=offset`` (defensiv).
        """
        run_dir = self._resolve_run_dir(run_id)
        stream_path = run_dir / "stream.jsonl"
        if not stream_path.is_file():
            # Lauf gerade gestartet, aber noch keine Bytes — kein Fehler.
            return {"text": "", "next_offset": offset}

        with stream_path.open("rb") as f:
            f.seek(offset)
            data = f.read()
        # Frames sind ASCII-JSON; utf-8 deckt das ab.
        text = data.decode("utf-8", errors="strict")
        return {"text": text, "next_offset": offset + len(data)}

    def read_meta(self, run_id: str) -> dict:
        """Liest die ``meta.json`` eines Laufs als dict.

        Raises:
            ValueError / RunNotFound wie ``_resolve_run_dir``.
        """
        run_dir = self._resolve_run_dir(run_id)
        meta_path = run_dir / "meta.json"
        if not meta_path.is_file():
            raise RunNotFound(run_id)
        return json.loads(meta_path.read_text(encoding="utf-8"))


__all__ = ["RunService", "RunNotFound"]
