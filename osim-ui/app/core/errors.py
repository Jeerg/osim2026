"""RFC-7807-ProblemDetail-Responses + globale Exception-Handler.

Pattern: alle Errors werden einheitlich als ``application/problem+json``
zurückgegeben. Frontend kann zentral auf ``type``/``status`` matchen.

Registrierung:
    from app.core.errors import register_exception_handlers
    register_exception_handlers(app)
"""

from __future__ import annotations

from typing import Any

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = structlog.get_logger(__name__)

PROBLEM_CONTENT_TYPE = "application/problem+json"


class ProblemDetail(BaseModel):
    """RFC 7807 -- Problem Details for HTTP APIs."""

    type: str = Field(default="about:blank", description="URI für den Problem-Typ.")
    title: str = Field(..., description="Kurzbeschreibung für Menschen.")
    status: int = Field(..., description="HTTP-Status-Code.")
    detail: str | None = Field(default=None, description="Längere Beschreibung.")
    instance: str | None = Field(default=None, description="URI der konkreten Auftretung.")
    errors: list[dict[str, Any]] | None = Field(
        default=None,
        description="Optional: Liste von Validation-Errors (custom Extension).",
    )


def _problem_response(
    status_code: int,
    title: str,
    detail: str | None = None,
    type_: str = "about:blank",
    instance: str | None = None,
    errors: list[dict[str, Any]] | None = None,
) -> JSONResponse:
    """Baut eine ProblemDetail-JSONResponse."""
    payload = ProblemDetail(
        type=type_,
        title=title,
        status=status_code,
        detail=detail,
        instance=instance,
        errors=errors,
    ).model_dump(exclude_none=True)
    return JSONResponse(
        status_code=status_code,
        content=payload,
        media_type=PROBLEM_CONTENT_TYPE,
    )


async def _http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Wandelt FastAPI/Starlette HTTPException in ProblemDetail-Response."""
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return _problem_response(
        status_code=exc.status_code,
        title=_http_title(exc.status_code),
        detail=detail,
        instance=str(request.url.path),
    )


async def _validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """RequestValidationError -> 422 ProblemDetail mit errors-Array."""
    return _problem_response(
        status_code=422,
        title="Validation Error",
        detail="Eingehende Anfrage entspricht nicht dem erwarteten Schema.",
        instance=str(request.url.path),
        errors=[dict(err) for err in exc.errors()],
    )


async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Fallback: 500 ProblemDetail. Loggt vollen Traceback."""
    logger.exception(
        "unhandled_exception",
        path=str(request.url.path),
        method=request.method,
        exc_type=type(exc).__name__,
    )
    return _problem_response(
        status_code=500,
        title="Internal Server Error",
        detail="Ein unerwarteter Fehler ist aufgetreten.",
        instance=str(request.url.path),
    )


def _http_title(status: int) -> str:
    return {
        400: "Bad Request",
        401: "Unauthorized",
        403: "Forbidden",
        404: "Not Found",
        405: "Method Not Allowed",
        409: "Conflict",
        413: "Payload Too Large",
        415: "Unsupported Media Type",
        422: "Unprocessable Entity",
        429: "Too Many Requests",
        500: "Internal Server Error",
        503: "Service Unavailable",
    }.get(status, "HTTP Error")


def register_exception_handlers(app: FastAPI) -> None:
    """Registriert alle ProblemDetail-Handler an der FastAPI-App."""
    app.add_exception_handler(StarletteHTTPException, _http_exception_handler)
    app.add_exception_handler(RequestValidationError, _validation_exception_handler)
    app.add_exception_handler(Exception, _unhandled_exception_handler)
