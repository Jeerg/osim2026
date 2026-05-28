"""Strukturiertes Logging via structlog.

JSON-Renderer in Produktion (Cloud-Logging-kompatibel), ConsoleRenderer in Dev.

3fls-Pattern-Parität (siehe tbx_stzrim/app/core/logging.py):
    * merge_contextvars für request-scoped Kontext-Binding (TenantAuthMiddleware
      bindet tenant_id / user_email / method / path)
    * TimeStamper mit ISO-Format
    * ProcessorFormatter brückt structlog in stdlib-logging
"""

from __future__ import annotations

import logging

import structlog

from app.core.config import settings


def configure_logging() -> None:
    """Configure structlog mit JSON (Prod) oder Console (Dev) Rendering."""
    is_dev = settings.environment == "dev"

    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if is_dev:
        renderer: structlog.types.Processor = structlog.dev.ConsoleRenderer(
            colors=True
        )
    else:
        renderer = structlog.processors.JSONRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # Bridge stdlib-logging zu structlog
    handler = logging.StreamHandler()
    handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            processors=[*shared_processors, renderer],
        )
    )
    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(logging.INFO)
