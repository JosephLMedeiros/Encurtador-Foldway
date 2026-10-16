"""Pool de conexões e migração do schema."""

import logging
import time
from pathlib import Path

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import Settings

log = logging.getLogger(__name__)

SCHEMA_PATH = Path(__file__).with_name("schema.sql")
MIGRATION_LOCK_ID = 7201026  # chave arbitrária do pg_advisory_lock


def create_pool(settings: Settings) -> ConnectionPool:
    # autocommit: cada comando é sua própria transação; as escritas compostas usam um único
    # statement (CTE), então continuam atômicas.
    return ConnectionPool(
        settings.database_url,
        min_size=settings.db_pool_min,
        max_size=settings.db_pool_max,
        kwargs={"autocommit": True, "row_factory": dict_row},
        open=False,
        name="kiro-api",
    )


def wait_for_database(pool: ConnectionPool, timeout: float) -> None:
    """Espera o banco aceitar conexões (no cluster ele pode subir depois da API)."""
    deadline = time.monotonic() + timeout
    attempt = 0
    while True:
        attempt += 1
        try:
            with pool.connection(timeout=5) as conn:
                conn.execute("SELECT 1")
            return
        except Exception as exc:
            if time.monotonic() >= deadline:
                raise RuntimeError(f"banco indisponível após {timeout:.0f}s") from exc
            log.warning("banco indisponível (tentativa %d): %s", attempt, exc)
            time.sleep(2)


def migrate(pool: ConnectionPool) -> None:
    with pool.connection() as conn:
        conn.execute("SELECT pg_advisory_lock(%s)", (MIGRATION_LOCK_ID,))
        try:
            conn.execute(SCHEMA_PATH.read_text(encoding="utf-8"))
        finally:
            conn.execute("SELECT pg_advisory_unlock(%s)", (MIGRATION_LOCK_ID,))
    log.info("schema aplicado")
