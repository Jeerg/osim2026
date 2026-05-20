"""SQLAlchemy-Modelle fuer osim-ui.

Re-Export aller Modelle, damit Alembic-autogenerate sie ueber
``from app.models import *`` sieht.
"""

from app.models.tenant import Tenant
from app.models.user import User

__all__ = ["Tenant", "User"]
