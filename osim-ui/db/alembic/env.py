"""Alembic-Environment-Konfiguration für osim-ui.

Phase 1 (D-A02 / D-17 Self-Service): Migrationen verwalten ausschließlich das
``public``-Schema (``alembic_version``, ``tenants``, ``users``). Tenant-
spezifische Schemata werden vom Service-Layer ``app.services.auth_service``
lazy-bootstrapped (CREATE SCHEMA IF NOT EXISTS + explizites DDL für
``models``/``model_locks``). KEIN Alembic-Programmatic-Upgrade pro Tenant in
Phase 1.

3fls-Pattern-Parität: ``DATABASE_URL`` wird aus ``app.core.config.settings``
gelesen (override-fähig via ``.env``), NICHT aus ``alembic.ini``.
``version_table_schema="public"`` — ``alembic_version`` ist installation-meta.
"""

from __future__ import annotations

from alembic import context
from sqlalchemy import engine_from_config, pool

# settings lädt .env via python-dotenv (override=False, weil .env nur Defaults
# liefern soll falls das übergeordnete ENV den DATABASE_URL nicht setzt).
from app.core.config import settings
from app.db.models import Base

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

# autogenerate-Target.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (SQL-Generierung ohne Connection)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        version_table_schema="public",
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (mit DB-Connection)."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            version_table_schema="public",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
