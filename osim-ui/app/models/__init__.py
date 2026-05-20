"""SQLAlchemy-Modelle fuer osim-ui.

Re-Export aller Modelle, damit Alembic-autogenerate sie ueber
``from app.models import *`` sieht.

Schema-Strategie:
  - ``Tenant`` und ``User`` leben im ``public``-Schema
    (``__table_args__ = {"schema": "public"}``).
  - ``Model``, ``ModelVersion``, ``EditLock`` leben im **Tenant-Schema**
    (kein ``__table_args__``-schema). Sie werden zur Laufzeit beim
    ersten Auth-Call eines Users über
    ``app.services.tenant_service._create_tenant_schema_tables`` im
    jeweiligen ``tenant_{slug}``-Schema angelegt.
"""

from app.models.edit_lock import EditLock
from app.models.model import Model
from app.models.model_version import ModelVersion
from app.models.tenant import Tenant
from app.models.user import User

__all__ = ["EditLock", "Model", "ModelVersion", "Tenant", "User"]
