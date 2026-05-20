"""Integration-Tests fuer das osim-ui-Backend (Plan 01-10).

Diese Tests laufen Cross-Plan und verifizieren das Zusammenspiel der
einzelnen Plan-Komponenten:

- Plan 01-01: Engine-OTX-Writer
- Plan 01-02: Backend-Foundation (Auth, Tenant-Bootstrap)
- Plan 01-03: Modell-CRUD (Upload, Tree, Lock)

Voraussetzungen: Postgres-Test-DB erreichbar (sonst Skip via
``pytest.mark.requires_db``-Marker -- siehe ``tests/conftest.py``).
"""
