Status: Reconciliado com a implementação em 18/10/2026 (escrito após a implementação)

> Tarefas reconstruídas a partir da implementação; não refletem o histórico real do desenvolvimento.

# Implementation Plan — Backend API

As tarefas originais foram escritas para Node.js/TypeScript/Fastify (D-03 pendente). A decisão D-03 foi confirmada como Python 3.12 + FastAPI + psycopg 3. Todas as tarefas originais de Node.js são marcadas como **obsoletas**. As tarefas abaixo são a reconstrução do que foi efetivamente construído, citando o arquivo que comprova cada item.

---

## Concluídas

### T-01 — Configuração e leitura de variáveis de ambiente
**Arquivo:** `api/app/config.py`

- [x] `Settings` dataclass frozen com todos os campos de configuração
- [x] Suporte a `DATABASE_URL` completa ou variáveis individuais (`DB_HOST`, `DB_PORT`, etc.)
- [x] `DB_POOL_MIN`, `DB_POOL_MAX` (máximo absoluto 100)
- [x] `SHORT_CODE_LENGTH` (padrão 7), `SHORT_CODE_ALPHABET` (padrão `[a-z0-9]`)
- [x] `DB_STARTUP_TIMEOUT_SECONDS` (padrão 60s)
- [x] `BASE_URL`

---

### T-02 — Pool de conexões e migração do schema
**Arquivo:** `api/app/db.py`

- [x] `create_pool()` — `psycopg_pool.ConnectionPool` com `autocommit=True` e `row_factory=dict_row`
- [x] `wait_for_database(pool, timeout)` — retry com `SELECT 1` até timeout total
- [x] `migrate(pool)` — `pg_advisory_lock` + execução idempotente do `schema.sql`

---

### T-03 — Schema do banco
**Arquivo:** `api/app/schema.sql`

- [x] Tabela `links` com `short_code UNIQUE`, `clicks`, `expires_at`
- [x] View `active_links` (filtra por `expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP`)
- [x] Tabela `click_events` com `user_agent`, `ip_address` (não gravado — LGPD), `referer`
- [x] Índices em `click_events` (`link_id, clicked_at DESC` e `clicked_at DESC`)

---

### T-04 — Geração e validação de códigos curtos
**Arquivo:** `api/app/shortcode.py`

- [x] `generate_code(length, alphabet)` — usa `secrets.choice` (criptograficamente seguro)
- [x] `is_valid_code(code)` — regex `^[A-Za-z0-9_-]{3,50}$`
- [x] `is_reserved(code)` — verifica `RESERVED_CODES` (case-insensitive)
- [x] `is_valid_url(url)` — `urlsplit`, esquema `http`/`https`, netloc, len ≤ 2048

---

### T-05 — Repositório de links
**Arquivo:** `api/app/repository.py`

- [x] `LinkRepository` com pool injetado
- [x] `ping(timeout)` — `SELECT 1`
- [x] `create(code, url, expires_at)` — `INSERT ... ON CONFLICT DO NOTHING RETURNING`
- [x] `list_page(limit, offset)` — paginação com `COUNT(*)` total, `ORDER BY created_at DESC, id DESC`
- [x] `get(code)` — busca direta em `links` (inclui expirados)
- [x] `register_click(code, ua, referer)` — CTE atômica (`UPDATE clicks` + `INSERT click_events`) via `active_links`; `synchronous_commit off`
- [x] `exists(code)` — para distinguir `expired` de `not_found`
- [x] `count_active()` — `SELECT count(*) FROM active_links`
- [x] `clicks_by_hour(code, hours)` — série por hora para `/stats`
- [x] `ranking(hours, limit)` — ranking para `/api/ranking`

---

### T-06 — Módulo de telemetria
**Arquivo:** `api/app/telemetry.py`

- [x] `setup(app)` — inicializa `TracerProvider` (OTLP/HTTP condicional) e `MeterProvider` (PrometheusMetricReader); instrumenta FastAPI e psycopg; registra `GET /metrics`
- [x] `OTEL_SEMCONV_STABILITY_OPT_IN=http` forçado antes dos imports
- [x] Instrumentos: `kiro.links.created`, `kiro.link.clicks`, `kiro.link.redirect.duration` (buckets explícitos), `kiro.feature.used`, `kiro.active_links` (gauge observável)
- [x] Interface pública: `link_created`, `link_clicked`, `redirect_finished`, `feature_used`, `tag_short_code`, `untraced`, `set_active_links_source`
- [x] `FastAPIInstrumentor` com `excluded_urls` para probes e `/metrics`, `exclude_spans=["receive","send"]`
- [x] `PsycopgInstrumentor` para spans automáticos do banco

---

### T-07 — Handlers e rotas
**Arquivo:** `api/app/main.py`

- [x] `create_app(settings)` com lifespan (pool + wait + migrate + set_active_links_source)
- [x] Handlers de erro globais: `RequestValidationError` → 400; `psycopg.OperationalError` / `PoolTimeout` → 503
- [x] `GET /healthz` — retorna `{"status": "ok"}` sem banco
- [x] `GET /readyz` — `repo.ping(timeout=2)` dentro de `untraced()`; 200 ou 503
- [x] `GET /api/links` — paginação `limit`/`offset`; `{total, items}` com `short_url = BASE_URL/r/code`
- [x] `POST /api/links` — validação de URL, `custom_code`, `expires_at`, reservados; retry até 5; `link_created(vanity=...)`
- [x] `GET /api/links/{short_code}/stats` — inclui `last_24h`; `feature_used("stats")`
- [x] `GET /api/ranking` — `feature_used("ranking")`
- [x] `GET /r/{short_code}` (rota canônica) e `GET /{short_code}` (alias) — redirect 302/404/410; `Cache-Control: no-store`; `feature_used("qrcode")` quando `via=qr`

---

### T-08 — Dockerfile multi-stage
**Arquivo:** `api/Dockerfile`

- [x] Build multi-stage: instalação de dependências → imagem de produção mínima
- [x] Usuário sem privilégios de root (UID 10001); confirmado por `k8s/api/deployment.yaml` (`runAsNonRoot: true`)

---

### T-09 — Ambiente local (docker-compose)
**Arquivo:** `docker-compose.yml` (raiz do repositório)

- [x] Serviço `database` (PostgreSQL 16) com healthcheck `pg_isready`
- [x] Serviço `api` com `depends_on: database (service_healthy)`; healthcheck em `/readyz`
- [x] Serviços de observabilidade incluídos (otel-collector, tempo, prometheus, grafana)
- [x] Senhas com valores placeholder (`troque-esta-senha`)
- [x] Profile `test` para testes com banco descartável

---

### T-10 — Testes unitários de shortcode
**Arquivo:** `api/tests/test_shortcode.py` (5 funções de teste)

- [x] `test_generated_code_respects_length_and_alphabet`
- [x] `test_valid_codes` (parametrizado)
- [x] `test_invalid_codes` (parametrizado)
- [x] `test_reserved_codes` (parametrizado)
- [x] `test_valid_urls` / `test_invalid_urls` (parametrizados)

---

### T-11 — Testes de integração da API
**Arquivo:** `api/tests/test_api.py` (17 funções de teste)

- [x] Probes: `test_healthz`, `test_readyz`
- [x] Criação: `test_create_random_code`, `test_create_custom_code_and_conflict`, `test_create_with_future_expiration`, `test_create_rejects_invalid_input`
- [x] Listagem: `test_list_is_paginated_and_newest_first`, `test_list_rejects_bad_pagination`
- [x] Redirect: `test_redirect_counts_click_and_records_event`, `test_redirect_unknown_code_is_404`, `test_redirect_expired_link_is_410`
- [x] Stats: `test_stats`
- [x] Banco fora do ar: `test_database_down_returns_503`
- [x] Analytics: `test_stats_has_hourly_series_and_referer_is_recorded`, `test_ranking_orders_by_clicks_in_window`

---

### T-12 — Testes do contrato de telemetria
**Arquivo:** `api/tests/test_telemetry.py` (5 funções de teste)

- [x] `test_metrics_follow_contract` — nomes de métricas, rótulos, `http_route` como template
- [x] `test_trace_has_db_span_as_child_of_server_span` — propagação W3C, span de banco filho
- [x] `test_feature_usage_metric`
- [x] `test_qrcode_access_metric`
- [x] `test_probes_and_asgi_internals_do_not_create_spans`

---

## Obsoletas (Node.js/TypeScript — substituídas por D-03)

As tarefas abaixo foram escritas para a stack Node.js/Fastify original. São preservadas para rastreabilidade, mas não devem ser executadas.

| Tarefa original | Motivo de obsolescência |
|---|---|
| 1.1 Inicializar projeto Node.js com TypeScript | D-03: API em Python/FastAPI |
| 1.2 Instalar dependências npm (fastify, pg, lru-cache, nanoid, zod, OTel) | D-03 |
| 1.3 Criar estrutura `src/`, `tests/` | D-03: estrutura é `app/`, `tests/` |
| 1.4 Criar `src/config.ts` com zod | D-03: `api/app/config.py` com dataclass |
| 2.1–2.4 Módulo de telemetria (`src/telemetry/`) | D-03: `api/app/telemetry.py` |
| 3.1–3.3 Pool e repositórios (`src/db/`) | D-03: `api/app/db.py`, `api/app/repository.py` |
| 4.1–4.2 Cache Cache-Aside (`src/cache/`) | D-03 + cache não implementado |
| 5.1–5.10 Serviços (`src/services/`) | D-03: lógica nos handlers de `main.py` |
| 6 Checkpoint TypeScript | D-03 |
| 7.1–7.6 Rotas Fastify (`src/routes/`) | D-03: rotas em `api/app/main.py` |
| 8.1–8.6 Testes Vitest/Testcontainers | D-03: pytest com TestClient e PostgreSQL real |
| 9 Checkpoint testes TypeScript | D-03 |
| 10.1–10.2 Dockerfile e docker-compose Node.js | D-03: `api/Dockerfile` Python; `docker-compose.yml` na raiz |
| 11 Checkpoint final Node.js | D-03 |

---

## Verificações pendentes

### V-01 — Latência do `/healthz` < 100 ms (Requisito 7.2)
**Resultado: não verificado.** Critério de latência não testado. Endpoint trivial; sem banco.

### V-02 — Cancelamento de query no timeout do `/readyz` (Requisito 8.3)
**Resultado: não verificado.** `pool.connection(timeout=2)` aplica timeout na aquisição de conexão do pool; comportamento com banco lento (conexão adquirida mas query demorada) não confirmado em execução.

### V-03 — Emissão de `db.client.operation.duration` pelo `PsycopgInstrumentor`
**Resultado: não confirmado.** `PsycopgInstrumentor` gera spans de banco (`test_telemetry.py` confirma). O histograma `db_client_operation_duration_seconds` não foi verificado em `/metrics`.
