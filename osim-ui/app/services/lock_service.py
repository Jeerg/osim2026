"""Edit-Lock-Service (D-13).

**STUB-IMPLEMENTIERUNG -- wird in Task 3 (Plan 01-03) ersetzt.**

In Task 2 ist nur ``check_lock_for_edit`` als No-op gemounted, damit der
PUT-/tree-Endpoint testbar ist, ohne den Lock-Pflichtpfad bereits zu
forcieren. Die echte Lock-Mechanik (acquire/release/heartbeat + TTL +
Konflikt-Detection) kommt in Task 3.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession


async def check_lock_for_edit(
    *,
    model_id: int,  # noqa: ARG001 (stub)
    user_uid: str,  # noqa: ARG001 (stub)
    db: AsyncSession,  # noqa: ARG001 (stub)
) -> None:
    """STUB. Wird in Task 3 ersetzt durch Lock-Pflicht-Check + 403."""
    return None
