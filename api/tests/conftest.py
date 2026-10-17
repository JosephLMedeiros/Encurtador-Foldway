import os
import string

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL", "postgresql://kiro:kiro@localhost:5433/kiro_test"
)
BASE_URL = "http://test.local"


def _database_available() -> bool:
    try:
        with psycopg.connect(TEST_DATABASE_URL, connect_timeout=3):
            return True
    except psycopg.OperationalError:
        return False


@pytest.fixture(scope="session")
def settings() -> Settings:
    if not _database_available():
        pytest.skip(f"Postgres de teste indisponível em {TEST_DATABASE_URL}")
    return Settings(
        database_url=TEST_DATABASE_URL,
        base_url=BASE_URL,
        short_code_length=7,
        short_code_alphabet=string.ascii_lowercase + string.digits,
        db_pool_min=1,
        db_pool_max=5,
        db_startup_timeout=10,
    )


@pytest.fixture(scope="session")
def client(settings):
    with TestClient(create_app(settings), follow_redirects=False) as c:
        yield c


@pytest.fixture(autouse=True)
def clean_db(request):
    if "client" not in request.fixturenames:
        yield
        return
    with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as conn:
        conn.execute("TRUNCATE links, click_events RESTART IDENTITY CASCADE")
    yield


@pytest.fixture
def sql():
    """Executa SQL direto no banco de teste (para montar cenários e conferir efeitos)."""
    def run(query, params=None):
        with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as conn:
            cur = conn.execute(query, params)
            return cur.fetchall() if cur.description else None
    return run
