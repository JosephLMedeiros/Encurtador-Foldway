"""API do encurtador: criação, listagem, estatísticas e redirect de links."""

import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import psycopg
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, RedirectResponse
from psycopg_pool import PoolTimeout
from pydantic import BaseModel

from . import db, shortcode, telemetry
from .config import Settings, load_settings
from .repository import LinkRepository, Row

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("kiro-api")

MAX_LIMIT = 200
MAX_RANKING_HOURS = 24 * 30
MAX_GENERATION_ATTEMPTS = 5


class LinkCreate(BaseModel):
    original_url: str
    custom_code: str | None = None
    expires_at: datetime | None = None


def error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": code, "message": message})


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        pool = db.create_pool(settings)
        pool.open(wait=False)
        with telemetry.untraced():
            db.wait_for_database(pool, settings.db_startup_timeout)
            db.migrate(pool)
        app.state.repo = LinkRepository(pool)
        telemetry.set_active_links_source(app.state.repo.count_active)
        yield
        pool.close()

    app = FastAPI(title="Kiro Portal API", version="1.0.0", lifespan=lifespan)
    telemetry.setup(app)

    def repo(request: Request) -> LinkRepository:
        return request.app.state.repo

    def short_url(code: str) -> str:
        return f"{settings.base_url}/r/{code}"

    def serialize(row: Row) -> dict:
        return {
            "short_code": row["short_code"],
            "short_url": short_url(row["short_code"]),
            "original_url": row["original_url"],
            "clicks": row["clicks"],
            "created_at": row["created_at"].isoformat(),
            "expires_at": row["expires_at"].isoformat() if row["expires_at"] else None,
        }

    # ---------- Erros ----------

    @app.exception_handler(RequestValidationError)
    async def on_validation_error(_request: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        field = ".".join(str(p) for p in first.get("loc", []) if p not in ("body", "query"))
        return error(400, "invalid_request", f"parâmetro inválido: {field or 'corpo'}")

    @app.exception_handler(psycopg.OperationalError)
    @app.exception_handler(PoolTimeout)
    async def on_db_unavailable(_request: Request, exc: Exception):
        log.error("banco indisponível: %s", exc)
        return error(503, "database_unavailable", "banco de dados indisponível")

    # ---------- Probes ----------

    @app.get("/healthz")
    def healthz():
        return {"status": "ok"}

    @app.get("/readyz")
    def readyz(request: Request):
        try:
            with telemetry.untraced():  # chamado a cada 5s pelas probes
                repo(request).ping(timeout=2)
        except Exception as exc:
            log.warning("readyz falhou: %s", exc)
            return JSONResponse(status_code=503, content={"status": "error", "db": "unavailable"})
        return {"status": "ok", "db": "ok"}

    # ---------- Links ----------

    @app.post("/api/links", status_code=201)
    def create_link(body: LinkCreate, request: Request):
        if not shortcode.is_valid_url(body.original_url):
            return error(400, "invalid_url", "original_url deve ser uma URL http(s) absoluta")

        expires_at = body.expires_at
        if expires_at is not None:
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at <= datetime.now(timezone.utc):
                return error(400, "invalid_expires_at", "expires_at deve estar no futuro")

        links = repo(request)
        if body.custom_code is not None:
            code = body.custom_code
            if not shortcode.is_valid_code(code):
                return error(400, "invalid_custom_code",
                             "custom_code deve ter 3-50 caracteres [A-Za-z0-9_-]")
            if shortcode.is_reserved(code):
                return error(400, "reserved_custom_code", f"'{code}' é um caminho reservado")
            row = links.create(code, body.original_url, expires_at)
            if row is None:
                return error(409, "code_in_use", f"o código '{code}' já está em uso")
        else:
            row = None
            for _ in range(MAX_GENERATION_ATTEMPTS):
                code = shortcode.generate_code(settings.short_code_length,
                                               settings.short_code_alphabet)
                row = links.create(code, body.original_url, expires_at)
                if row is not None:
                    break
            if row is None:
                return error(503, "code_generation_failed", "não foi possível gerar um código único")

        telemetry.link_created(vanity=body.custom_code is not None)
        telemetry.tag_short_code(row["short_code"])
        return serialize(row)

    @app.get("/api/links")
    def list_links(request: Request, limit: int = 50, offset: int = 0):
        if limit < 0 or offset < 0:
            return error(400, "invalid_pagination", "limit e offset devem ser inteiros não negativos")
        if limit > MAX_LIMIT:
            return error(400, "invalid_pagination", f"limit máximo é {MAX_LIMIT}")
        total, rows = repo(request).list_page(limit, offset)
        return {"total": total, "items": [serialize(r) for r in rows]}

    @app.get("/api/links/{short_code}/stats")
    def link_stats(short_code: str, request: Request):
        if not shortcode.is_valid_code(short_code):
            return error(400, "invalid_code", "código com formato inválido")
        telemetry.tag_short_code(short_code)
        links = repo(request)
        row = links.get(short_code)
        if row is None:
            return error(404, "not_found", "link não encontrado")
        telemetry.feature_used("stats")
        series = links.clicks_by_hour(short_code, 24)
        return {**serialize(row), "last_24h": [
            {"hour": p["hour"].isoformat(), "clicks": p["clicks"]} for p in series]}

    @app.get("/api/ranking")
    def ranking(request: Request, hours: int = 24, limit: int = 10):
        if not 1 <= hours <= MAX_RANKING_HOURS or not 1 <= limit <= 50:
            return error(400, "invalid_ranking",
                         f"hours deve estar entre 1 e {MAX_RANKING_HOURS} e limit entre 1 e 50")
        telemetry.feature_used("ranking")
        rows = repo(request).ranking(hours, limit)
        return {"hours": hours, "items": [
            {"position": i, "short_code": r["short_code"], "short_url": short_url(r["short_code"]),
             "original_url": r["original_url"], "clicks": r["clicks"]}
            for i, r in enumerate(rows, start=1)]}

    # ---------- Redirect ----------

    def redirect(short_code: str, request: Request, via: str | None = None):
        if not shortcode.is_valid_code(short_code):
            return error(404, "not_found", "link não encontrado")
        telemetry.tag_short_code(short_code)
        links = repo(request)
        started = time.perf_counter()
        url = links.register_click(short_code, request.headers.get("user-agent"),
                                   request.headers.get("referer"))
        if url is None:
            outcome = "expired" if links.exists(short_code) else "not_found"
            telemetry.redirect_finished(time.perf_counter() - started, outcome)
            if outcome == "expired":
                return error(410, "expired", "este link expirou")
            return error(404, "not_found", "link não encontrado")
        telemetry.redirect_finished(time.perf_counter() - started, "found")
        telemetry.link_clicked()
        if via == "qr":  # o QR Code do frontend aponta para /r/{code}?via=qr
            telemetry.feature_used("qrcode")
        return RedirectResponse(url, status_code=302, headers={"Cache-Control": "no-store"})

    app.add_api_route("/r/{short_code}", redirect, methods=["GET"], name="redirect")
    # Compatibilidade com o contrato original (openapi.yaml: GET /{shortCode}). Registrada por último.
    app.add_api_route("/{short_code}", redirect, methods=["GET"], name="redirect_root",
                      include_in_schema=False)

    return app


app = create_app()
