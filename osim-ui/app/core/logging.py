"""structlog-Konfiguration für osim-ui.

- Dev: Console-Renderer, lesbar, farbig
- Prod / Staging: JSON-Renderer, Cloud-Logging-kompatibel

Wird in app/main.py:lifespan einmal beim Startup aufgerufen.
"""

from __future__ import annotations

import logging
import sys

import structlog

from app.core.config import settings


def configure_logging() -> None:
    """Initialisiert structlog + stdlib logging.

    Idempotent -- mehrfacher Aufruf ist safe.
    """
    log_level_name = settings.log_level
    log_level = getattr(logging, log_level_name, logging.INFO)

    # stdlib root-logger
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=log_level,
        force=True,
    )

    # Gemeinsame Prozessoren
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
    ]

    if settings.environment in ("prod", "staging"):
        # JSON-Output (cloud-logging-freundlich)
        renderer: structlog.types.Processor = structlog.processors.JSONRenderer()
        processors = [
            *shared_processors,
            structlog.processors.format_exc_info,
            structlog.processors.dict_tracebacks,
            renderer,
        ]
    else:
        # Dev / Test: Console-Renderer
        renderer = structlog.dev.ConsoleRenderer(colors=True)
        processors = [
            *shared_processors,
            structlog.processors.format_exc_info,
            renderer,
        ]

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """Convenience-Wrapper für strukturiertes Loggen."""
    return structlog.get_logger(name)
