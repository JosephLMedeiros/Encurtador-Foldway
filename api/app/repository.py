"""Todas as consultas SQL da API ficam aqui (nenhum SQL nas rotas)."""

from datetime import datetime
from typing import Any

from psycopg_pool import ConnectionPool

Row = dict[str, Any]

LINK_COLUMNS = "short_code, original_url, clicks, created_at, expires_at"


class LinkRepository:
    def __init__(self, pool: ConnectionPool):
        self.pool = pool

    def ping(self, timeout: float) -> None:
        with self.pool.connection(timeout=timeout) as conn:
            conn.execute("SELECT 1")

    def create(self, code: str, url: str, expires_at: datetime | None) -> Row | None:
        """Insere o link; retorna None se o código já existir."""
        with self.pool.connection() as conn:
            return conn.execute(
                f"""INSERT INTO links (short_code, original_url, expires_at)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (short_code) DO NOTHING
                    RETURNING {LINK_COLUMNS}""",
                (code, url, expires_at),
            ).fetchone()

    def list(self, limit: int, offset: int) -> tuple[int, list[Row]]:
        with self.pool.connection() as conn:
            total = conn.execute("SELECT count(*) AS n FROM links").fetchone()["n"]
            rows = conn.execute(
                f"""SELECT {LINK_COLUMNS} FROM links
                    ORDER BY created_at DESC, id DESC
                    LIMIT %s OFFSET %s""",
                (limit, offset),
            ).fetchall()
        return total, rows

    def get(self, code: str) -> Row | None:
        with self.pool.connection() as conn:
            return conn.execute(
                f"SELECT {LINK_COLUMNS} FROM links WHERE short_code = %s", (code,)
            ).fetchone()

    def register_click(self, code: str, user_agent: str | None,
                       referer: str | None = None) -> str | None:
        """Conta o clique e registra o evento num único statement atômico.

        Só considera links ativos (view active_links). Retorna a URL de destino ou None.
        """
        with self.pool.connection() as conn:
            row = conn.execute(
                """WITH hit AS (
                       UPDATE links SET clicks = clicks + 1
                       WHERE id = (SELECT id FROM active_links WHERE short_code = %(code)s)
                       RETURNING id, original_url
                   ), event AS (
                       INSERT INTO click_events (link_id, user_agent, referer)
                       SELECT id, %(ua)s, %(referer)s FROM hit
                   )
                   SELECT original_url FROM hit""",
                {"code": code, "ua": user_agent, "referer": referer},
            ).fetchone()
        return row["original_url"] if row else None

    def exists(self, code: str) -> bool:
        with self.pool.connection() as conn:
            return conn.execute(
                "SELECT 1 FROM links WHERE short_code = %s", (code,)
            ).fetchone() is not None

    def count_active(self) -> int:
        with self.pool.connection(timeout=2) as conn:
            return conn.execute("SELECT count(*) AS n FROM active_links").fetchone()["n"]

    # ---------- Analytics (base para as features exclusivas) ----------

    def clicks_by_hour(self, code: str, hours: int) -> list[Row]:
        with self.pool.connection() as conn:
            return conn.execute(
                """SELECT date_trunc('hour', e.clicked_at) AS hour, count(*)::int AS clicks
                   FROM click_events e JOIN links l ON l.id = e.link_id
                   WHERE l.short_code = %s
                     AND e.clicked_at > now() - make_interval(hours => %s)
                   GROUP BY 1 ORDER BY 1""",
                (code, hours),
            ).fetchall()

    def ranking(self, hours: int, limit: int) -> list[Row]:
        """Links mais clicados na janela (ranking do "link do dia")."""
        with self.pool.connection() as conn:
            return conn.execute(
                """SELECT l.short_code, l.original_url, count(*)::int AS clicks
                   FROM click_events e JOIN links l ON l.id = e.link_id
                   WHERE e.clicked_at > now() - make_interval(hours => %s)
                   GROUP BY l.id ORDER BY clicks DESC, l.short_code LIMIT %s""",
                (hours, limit),
            ).fetchall()
