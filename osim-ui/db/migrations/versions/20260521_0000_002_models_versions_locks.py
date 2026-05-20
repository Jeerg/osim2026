"""tenant-scoped tables: models, model_versions, edit_locks (doku-only)

Revision ID: 002_models
Revises: 001_initial
Create Date: 2026-05-21 00:00:00.000000

Phase-1-Plan-01-03-Task-1: dokumentiert die Tenant-scoped Tabellen
``models``, ``model_versions`` und ``edit_locks``. Diese Tabellen leben
**NICHT im public-Schema**, sondern in den pro-Tenant-Schemata
``tenant_{slug}``. Alembic ist fuer die Migration des ``public``-Schemas
verantwortlich; die Tenant-Schemata werden zur Laufzeit aus
``app.services.tenant_service._create_tenant_schema_tables`` mittels
SQLAlchemy ``Table.to_metadata(schema=tenant_id) + create_all(checkfirst=True)``
angelegt.

**Konsequenz fuer das Schema-Lifecycle in Phase 1:**
  * Strukturelle Aenderungen an den Tabellen (Spalten, Indizes, Constraints)
    werden in den SQLAlchemy-Modellen vorgenommen (``app/models/model.py``,
    ``app/models/model_version.py``, ``app/models/edit_lock.py``). Neue
    Tenants bekommen die aktuelle Struktur automatisch.
  * Bestehende Tenants benoetigen eine **separate Tenant-Migrations-Loop**,
    die in Phase 4 (Cloud-Deployment) als Backlog-Item eingeplant ist
    (siehe ``risks``-Section in 01-03-PLAN.md).

Diese Migration ist daher absichtlich leer -- sie dient als
Versionsnachweis im Alembic-Log, dass das Schema-Konzept fuer Plan 01-03
eingefuehrt wurde.
"""

from __future__ import annotations

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "002_models"
down_revision: str | Sequence[str] | None = "001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Leer -- Tenant-Tabellen werden zur Laufzeit ueber
    ``app.services.tenant_service._create_tenant_schema_tables`` angelegt.
    Siehe Module-Docstring fuer Details.
    """


def downgrade() -> None:
    """Leer -- Tenant-Schemata mit ihren Tabellen werden manuell oder im
    Rahmen einer Tenant-Loeschung gedroppt.
    """
