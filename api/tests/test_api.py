import re
from datetime import datetime, timedelta, timezone

import psycopg

from tests.conftest import BASE_URL


def create(client, **body):
    body.setdefault("original_url", "https://example.com/destino")
    return client.post("/api/links", json=body)


# ---------- Probes ----------

def test_healthz(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_readyz(client):
    r = client.get("/readyz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "db": "ok"}


# ---------- Criação ----------

def test_create_random_code(client):
    r = create(client)
    assert r.status_code == 201
    body = r.json()
    assert re.fullmatch(r"[a-z0-9]{7}", body["short_code"])
    assert body["short_url"] == f"{BASE_URL}/r/{body['short_code']}"
    assert body["original_url"] == "https://example.com/destino"
    assert body["clicks"] == 0
    assert body["expires_at"] is None


def test_create_custom_code_and_conflict(client):
    r = create(client, custom_code="meu-portal")
    assert r.status_code == 201
    assert r.json()["short_code"] == "meu-portal"

    r = create(client, custom_code="meu-portal")
    assert r.status_code == 409
    assert r.json()["error"] == "code_in_use"


def test_create_with_future_expiration(client):
    expires = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    r = create(client, expires_at=expires)
    assert r.status_code == 201
    assert r.json()["expires_at"] is not None


def test_create_rejects_invalid_input(client):
    assert create(client, original_url="nao-e-url").status_code == 400
    assert create(client, original_url="ftp://x.com").status_code == 400
    assert create(client, custom_code="a b").status_code == 400
    assert create(client, custom_code="healthz").json()["error"] == "reserved_custom_code"
    past = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    assert create(client, expires_at=past).status_code == 400
    assert client.post("/api/links", json={}).status_code == 400
    assert client.post("/api/links", content="{", headers={"content-type": "application/json"}).status_code == 400


# ---------- Listagem ----------

def test_list_is_paginated_and_newest_first(client):
    for i in range(3):
        create(client, custom_code=f"link-{i}")
    r = client.get("/api/links")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3
    assert [i["short_code"] for i in body["items"]] == ["link-2", "link-1", "link-0"]

    page = client.get("/api/links?limit=1&offset=1").json()
    assert page["total"] == 3
    assert [i["short_code"] for i in page["items"]] == ["link-1"]


def test_list_rejects_bad_pagination(client):
    assert client.get("/api/links?limit=201").status_code == 400
    assert client.get("/api/links?offset=-1").status_code == 400
    assert client.get("/api/links?limit=abc").status_code == 400


# ---------- Redirect ----------

def test_redirect_counts_click_and_records_event(client, sql):
    create(client, custom_code="portal", original_url="https://example.com/x")
    r = client.get("/r/portal", headers={"user-agent": "pytest-agent"})
    assert r.status_code == 302
    assert r.headers["location"] == "https://example.com/x"

    client.get("/portal")  # rota de compatibilidade /{shortCode}
    assert client.get("/api/links/portal/stats").json()["clicks"] == 2
    events = sql("SELECT user_agent FROM click_events ORDER BY id")
    assert len(events) == 2
    assert events[0][0] == "pytest-agent"


def test_redirect_unknown_code_is_404(client):
    assert client.get("/r/nao-existe").status_code == 404
    assert client.get("/r/x").status_code == 404  # formato inválido nem consulta o banco


def test_redirect_expired_link_is_410(client, sql):
    sql("INSERT INTO links (short_code, original_url, expires_at) "
        "VALUES ('velho', 'https://example.com', now() - interval '1 hour')")
    assert client.get("/r/velho").status_code == 410
    assert sql("SELECT clicks FROM links WHERE short_code = 'velho'")[0][0] == 0


# ---------- Estatísticas ----------

def test_stats(client):
    create(client, custom_code="stats-ok")
    r = client.get("/api/links/stats-ok/stats")
    assert r.status_code == 200
    assert r.json()["short_code"] == "stats-ok"
    assert client.get("/api/links/nada-aqui/stats").status_code == 404
    assert client.get("/api/links/a!/stats").status_code == 400


# ---------- Banco indisponível ----------

class BrokenRepo:
    def __getattr__(self, _name):
        def fail(*_args, **_kwargs):
            raise psycopg.OperationalError("connection refused")
        return fail


def test_database_down_returns_503(client):
    real = client.app.state.repo
    client.app.state.repo = BrokenRepo()
    try:
        r = client.get("/readyz")
        assert r.status_code == 503
        assert r.json() == {"status": "error", "db": "unavailable"}
        assert client.get("/api/links").status_code == 503
        assert client.get("/healthz").status_code == 200  # liveness não depende do banco
    finally:
        client.app.state.repo = real
