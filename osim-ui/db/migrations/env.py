"""Alembic-Environment fuer async SQLAlchemy 2 + asyncpg.

Folgt dem offiziellen Async-Cookbook:
https://alembic.sqlalchemy.org/en/latest/cookbook.html#using-asyncio-with-alembic
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# App-Settings + Metadata einziehen (sys.path wird durch alembic.ini prepend_sys_path = ../ gesetzt).
from app.core.config import settings
from app.core.database import Base

# Trigger Model-Discovery -- damit autogenerate alle Tabellen sieht.
# (Modelle werden in Plan 01-02 Task 2 angelegt; Import ist hier ein no-op
# wenn die Models noch nicht existieren.)
import app.models  # noqa: F401

config = context.config

# Override sqlalchemy.url aus Settings (vermeidet env-Duplikation).
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Offline-Mode: emittiert SQL ohne DB-Connection."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        include_schemas=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Erzeugt eine async-Engine und lässt die Migrationen sync laufen."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Online-Mode: führt run_async_migrations() in einem Event-Loop aus."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
