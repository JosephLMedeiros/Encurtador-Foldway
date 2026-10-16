"""Configuração da API, lida exclusivamente de variáveis de ambiente (ConfigMap/Secret no K8s)."""

import os
import string
from dataclasses import dataclass

from psycopg.conninfo import make_conninfo


@dataclass(frozen=True)
class Settings:
    database_url: str
    base_url: str
    short_code_length: int
    short_code_alphabet: str
    db_pool_min: int
    db_pool_max: int
    db_startup_timeout: float


def _database_url() -> str:
    if url := os.getenv("DATABASE_URL"):
        return url
    return make_conninfo(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
        dbname=os.getenv("DB_NAME", "encurtador"),
        user=os.getenv("DB_USER", "kiro"),
        password=os.getenv("DB_PASSWORD", ""),
    )


def load_settings() -> Settings:
    return Settings(
        database_url=_database_url(),
        base_url=os.getenv("BASE_URL", "http://localhost:8080").rstrip("/"),
        short_code_length=int(os.getenv("SHORT_CODE_LENGTH", "7")),
        short_code_alphabet=os.getenv(
            "SHORT_CODE_ALPHABET", string.ascii_lowercase + string.digits
        ),
        db_pool_min=int(os.getenv("DB_POOL_MIN", "1")),
        db_pool_max=min(int(os.getenv("DB_POOL_MAX", "10")), 100),
        db_startup_timeout=float(os.getenv("DB_STARTUP_TIMEOUT_SECONDS", "60")),
    )
