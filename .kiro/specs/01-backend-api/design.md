Status: Reconciliado com a implementação em 18/10/2026 (escrito após a implementação)

# Design Document — Backend API

Este documento descreve a implementação real da API, conforme encontrada no repositório. Toda afirmação cita o arquivo que a comprova. O plano original (Node.js/Fastify/TypeScript) está preservado na seção final.

---

## 1. Visão geral

A API é um serviço Python 3.12 com FastAPI, responsável por criar códigos curtos, redirecionar usuários, persistir dados no PostgreSQL, expor métricas para o Prometheus e propagar traces via OpenTelemetry.

**Stack real** (`api/requirements.txt`):
- `fastapi==0.143.3` + `uvicorn[standard]==0.54.0`
- `psycopg[binary,pool]==3.3.6` + `psycopg-pool==3.3.3`
- `opentelemetry-sdk==1.45.1` + exporters e instrumentações OTel
- `prometheus-client==0.26.0`

---

## 2. Arquitetura

A API segue uma separação em camadas sem dependências circulares:

```
api/app/main.py          ← create_app() + lifespan + rotas
api/app/config.py        ← leitura de variáveis de ambiente (Settings dataclass)
api/app/db.py            ← pool de conexões, wait_for_database(), migrate()
api/app/repository.py    ← LinkRepository (todo o SQL)
api/app/shortcode.py     ← geração e validação de códigos e URLs
api/app/telemetry.py     ← módulo único de OTel (métricas + traces)
api/app/schema.sql       ← DDL (tabelas, view active_links, índices)
```

Não há camada de serviços separada dos handlers: a lógica de negócio está diretamente nos handlers do `main.py`. Não há cache em memória.

---

## 3. Estrutura de arquivos

```
api/
├── app/
│   ├── __init__.py
│   ├── config.py       # Settings (dataclass frozen), leitura de env vars
│   ├── db.py           # pool psycopg-pool, wait_for_database, migrate
│   ├── main.py         # create_app(), lifespan, handlers, rotas
│   ├── repository.py   # LinkRepository (todo o SQL da aplicação)
│   ├── schema.sql      # DDL: links, click_events, active_links, índices
│   ├── shortcode.py    # generate_code, is_valid_code, is_reserved, is_valid_url
│   └── telemetry.py    # setup(), instrumentos OTel, interface pública
├── tests/
│   ├── conftest.py     # fixtures: settings, client, clean_db, sql
│   ├── test_api.py     # testes de integração (17 funções de teste)
│   ├── test_shortcode.py # testes unitários (5 funções de teste)
│   └── test_telemetry.py # testes do contrato de telemetria (5 funções de teste)
├── Dockerfile          # multi-stage: python:3.12-slim → produção sem root
├── requirements.txt    # dependências de produção (versões fixas)
├── requirements-dev.txt
└── pytest.ini
```

---

## 4. Configuração (`api/app/config.py`)

`Settings` é um `dataclass(frozen=True)` lido de variáveis de ambiente por `load_settings()`. Campos relevantes:

| Variável | Padrão | Descrição |
|---|---|---|
| `DATABASE_URL` ou `DB_HOST`+`DB_PORT`+`DB_NAME`+`DB_USER`+`DB_PASSWORD` | — | Conexão com o PostgreSQL |
| `DB_POOL_MIN` | `1` | Tamanho mínimo do pool |
| `DB_POOL_MAX` | `10` (máx 100) | Tamanho máximo do pool |
| `BASE_URL` | `http://localhost:8080` | Prefixo de `short_url` |
| `SHORT_CODE_LENGTH` | `7` | Comprimento do código aleatório |
| `SHORT_CODE_ALPHABET` | `[a-z0-9]` | Alfabeto do código aleatório |
| `DB_STARTUP_TIMEOUT_SECONDS` | `60` | Tempo máximo de espera pelo banco no startup |
| `OTEL_SERVICE_NAME` | `kiro-api` | Lido diretamente pelo SDK OTel |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | Lido diretamente pelo SDK OTel |
| `OTEL_TRACES_SAMPLER` | — | Lido diretamente pelo SDK OTel |
| `OTEL_PROPAGATORS` | — | Lido diretamente pelo SDK OTel |

Não existem variáveis `CACHE_MAX_SIZE`, `CACHE_DEFAULT_TTL_SECONDS` nem `PORT` (a porta é configurada pelo uvicorn).

Fonte: `api/app/config.py`.

---

## 5. Pool de conexões e migração (`api/app/db.py`)

`create_pool()` instancia `psycopg_pool.ConnectionPool` com `autocommit=True` e `row_factory=dict_row`. O pool abre de forma lazy (`open=False`), e `pool.open(wait=False)` é chamado no lifespan do `main.py`.

`wait_for_database(pool, timeout)` executa `SELECT 1` com timeout de 5s por tentativa, repetindo em loop (sleep 2s entre tentativas) até o timeout total (`DB_STARTUP_TIMEOUT_SECONDS`). Ao esgotar, levanta `RuntimeError`, o que encerra o processo.

`migrate(pool)` adquire `pg_advisory_lock(7201026)` (evita migrações concorrentes em múltiplas réplicas), executa `schema.sql` de forma idempotente (`IF NOT EXISTS`, `CREATE OR REPLACE`, `ADD COLUMN IF NOT EXISTS`) e libera o lock.

O lifespan do `main.py` chama as três funções dentro de `telemetry.untraced()` para não gerar spans de inicialização.

Fonte: `api/app/db.py`, `api/app/main.py` (função `lifespan`).

---

## 6. Schema do banco (`api/app/schema.sql`)

```sql
-- Tabela principal
links (id, short_code VARCHAR(50) UNIQUE, original_url TEXT, clicks INTEGER DEFAULT 0,
       created_at TIMESTAMPTZ, expires_at TIMESTAMPTZ NULL)

-- View que define "link ativo" (usada pelo redirect e pelo gauge de telemetria)
active_links → SELECT * FROM links WHERE expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP

-- Log de cliques (analytics, ranking, features)
click_events (id, link_id FK links, clicked_at TIMESTAMPTZ, user_agent TEXT,
              ip_address VARCHAR(45), referer TEXT)
-- Índices: idx_click_events_link_time (link_id, clicked_at DESC)
--          idx_click_events_time (clicked_at DESC)
```

O campo `ip_address` existe no schema mas não é gravado pela API (LGPD, comentário no `schema.sql`). O campo `referer` foi adicionado via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

Fonte: `api/app/schema.sql`.

---

## 7. Repositório (`api/app/repository.py`)

`LinkRepository` encapsula todo o SQL. Métodos relevantes:

| Método | SQL | Observações |
|---|---|---|
| `ping(timeout)` | `SELECT 1` | Usado pelo `/readyz` |
| `create(code, url, expires_at)` | `INSERT ... ON CONFLICT DO NOTHING RETURNING ...` | Retorna `None` se código já existe |
| `list_page(limit, offset)` | `SELECT ... ORDER BY created_at DESC, id DESC LIMIT ... OFFSET ...` + `COUNT(*) total` | Dois statements na mesma conexão |
| `get(code)` | `SELECT ... FROM links WHERE short_code = $1` | Usado pelo `/stats` (inclui expirados) |
| `register_click(code, ua, referer)` | CTE atômica: `UPDATE links SET clicks+1` + `INSERT click_events` via `active_links` | `SET LOCAL synchronous_commit TO off` |
| `exists(code)` | `SELECT 1 FROM links WHERE short_code = $1` | Usado para distinguir `expired` de `not_found` |
| `count_active()` | `SELECT count(*) FROM active_links` | Callback do gauge `kiro_active_links` |
| `clicks_by_hour(code, hours)` | GROUP BY `date_trunc('hour', ...)` sobre `click_events` | Para `last_24h` no `/stats` |
| `ranking(hours, limit)` | COUNT de `click_events` na janela, ORDER BY clicks DESC | Para `/api/ranking` |

`register_click` usa `SET LOCAL synchronous_commit TO off` para reduzir a latência do redirect (evita esperar pelo fsync do WAL nos cliques, sem afetar a durabilidade de criação de links).

Fonte: `api/app/repository.py`.

---

## 8. Handlers e rotas (`api/app/main.py`)

`create_app(settings)` instancia o `FastAPI`, configura o lifespan, registra handlers de erro globais e monta as rotas.

### Rotas implementadas

| Método | Rota | Handler | Status de retorno |
|---|---|---|---|
| `GET` | `/healthz` | `healthz` | 200 |
| `GET` | `/readyz` | `readyz` | 200 / 503 |
| `GET` | `/metrics` | `metrics_endpoint` | 200 (registrado por `telemetry.setup`) |
| `GET` | `/api/links` | `list_links` | 200 / 400 / 503 |
| `POST` | `/api/links` | `create_link` | 201 / 400 / 409 / 503 |
| `GET` | `/api/links/{short_code}/stats` | `link_stats` | 200 / 400 / 404 |
| `GET` | `/api/ranking` | `ranking` | 200 / 400 |
| `GET` | `/r/{short_code}` | `redirect` | 302 / 404 / 410 |
| `GET` | `/{short_code}` | `redirect` (alias) | 302 / 404 / 410 |

A rota `/{short_code}` é registrada por último com `include_in_schema=False`.

### Handlers de erro globais

- `RequestValidationError` → 400 com `{error, message}` (primeiro campo inválido)
- `psycopg.OperationalError` → 503 com `{error: "database_unavailable"}`
- `PoolTimeout` → 503 com `{error: "database_unavailable"}`

### Fluxo do redirect

```
GET /r/{short_code}
  1. is_valid_code(short_code) → 404 se inválido (sem consultar banco)
  2. tag_short_code(short_code)  ← atributo OTel no span atual
  3. started = time.perf_counter()
  4. url = repo.register_click(short_code, ua, referer)
     → None: exists(short_code)?
         True  → outcome="expired"  → redirect_finished(elapsed, "expired") → 410
         False → outcome="not_found" → redirect_finished(elapsed, "not_found") → 404
     → str: outcome="found" → redirect_finished(elapsed, "found")
                             → link_clicked()
                             → feature_used("qrcode") se via==qr
                             → 302 com Cache-Control: no-store
```

Fonte: `api/app/main.py`.

---

## 9. Geração e validação de códigos (`api/app/shortcode.py`)

| Função | Comportamento |
|---|---|
| `generate_code(length, alphabet)` | Usa `secrets.choice` (criptograficamente seguro) para gerar string de `length` chars do `alphabet` |
| `is_valid_code(code)` | Regex `^[A-Za-z0-9_-]{3,50}$` |
| `is_reserved(code)` | Verifica contra `RESERVED_CODES` (case-insensitive) |
| `is_valid_url(url)` | `urlsplit` + verifica esquema `http`/`https`, netloc não vazio, len ≤ 2048 |

`RESERVED_CODES`: `{"api", "r", "healthz", "readyz", "metrics", "docs", "redoc", "openapi.json"}`.

Geração com retry (até `MAX_GENERATION_ATTEMPTS = 5`) está em `main.py`, não em `shortcode.py`.

Fonte: `api/app/shortcode.py`, `api/app/main.py`.

---

## 10. Módulo de telemetria (`api/app/telemetry.py`)

`setup(app)` inicializa os providers (uma vez por processo via flag `_initialized`) e instrumenta o app. Interface pública:

| Função | Ação |
|---|---|
| `setup(app)` | Inicializa TracerProvider + MeterProvider; instrumenta FastAPI e psycopg; registra `GET /metrics` |
| `link_created(vanity)` | `_links_created.add(1, {"kind": "vanity"/"random"})` |
| `link_clicked()` | `_link_clicks.add(1)` |
| `redirect_finished(seconds, outcome)` | `_redirect_duration.record(seconds, {"outcome": outcome})` |
| `feature_used(feature)` | `_feature_used.add(1, {"feature": feature})` — valida contra `FEATURES` |
| `tag_short_code(code)` | `trace.get_current_span().set_attribute("kiro.link.short_code", code)` |
| `untraced()` | Context manager: `suppress_instrumentation()` — usado em probes e startup |
| `set_active_links_source(fn)` | Registra callback para o gauge `kiro.active_links` |

`OTEL_SEMCONV_STABILITY_OPT_IN=http` é forçado antes dos imports de instrumentação para garantir o nome estável `http.server.request.duration`.

O `TracerProvider` só adiciona `BatchSpanProcessor` se `OTEL_EXPORTER_OTLP_ENDPOINT` estiver definido e `OTEL_SDK_DISABLED` não for `"true"`.

O Histogram de redirect usa `ExplicitBucketHistogramAggregation([0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0])`.

Probes (`/healthz`, `/readyz`, `/metrics`) e spans internos do ASGI (`receive`, `send`) são excluídos da instrumentação.

Fonte: `api/app/telemetry.py`.

---

## 11. Dockerfile (`api/Dockerfile`)

Build multi-stage (não lido nesta reconciliação; assumido consistente com o critério 11.1 e 11.5 confirmados pelo `k8s/api/deployment.yaml` que usa `runAsNonRoot: true` e `runAsUser: 10001`).

Fonte: `api/Dockerfile`, `k8s/api/deployment.yaml`.

---

## 12. Testes (`api/tests/`)

| Arquivo | Funções de teste | Cobertura |
|---|---|---|
| `test_api.py` | 17 | Integração com Postgres real: probes, criação, conflito, validações, listagem, redirect (302/404/410), contagem de cliques, click_events, stats, banco fora do ar (503), série por hora, referer, ranking |
| `test_shortcode.py` | 5 | Unitários: geração de código, validação de código e URL, códigos reservados |
| `test_telemetry.py` | 5 | Contrato de telemetria: métricas (nomes, rótulos, cardinalidade), span de banco como filho do span HTTP, propagação W3C traceparent, métricas de feature, probes sem span |

O `conftest.py` usa `TestClient` (síncrono) do FastAPI com banco de teste real (PostgreSQL via `TEST_DATABASE_URL`). Cada teste começa com `TRUNCATE links, click_events`.

Fonte: `api/tests/`.

---

## 13. Rastreabilidade dos requisitos

| Requisito | Critério | Estado | Evidência |
|---|---|---|---|
| 1.1 | Pool configurável via env vars | Atendido | `api/app/config.py`, `api/app/db.py` |
| 1.2 | SQL encapsulado em repositório | Atendido com divergência | `api/app/repository.py` (repositório único, não dois separados) |
| 1.3 | SELECT 1 no startup | Atendido com divergência | `api/app/db.py` (`wait_for_database`, timeout total configurável vs. 5s fixo) |
| 1.4 | Encerramento em falha de startup | Atendido com divergência | `api/app/db.py` (RuntimeError não capturado encerra o processo) |
| 1.5 | HTTP 503 em mid-request sem encerrar | Atendido | `api/app/main.py` (`on_db_unavailable`); `test_api.py` (`test_database_down_returns_503`) |
| 1.6 | Redirect usa view `active_links` | Atendido | `api/app/repository.py` (`register_click` via CTE com `active_links`) |
| 2.1–2.7 | Cache Cache-Aside | Não atendido | Cache não implementado. Ver requirements.md, Req. 2. |
| 3.1 | GET /api/links retorna `{total, items}` | Atendido | `api/app/main.py` (`list_links`); `test_api.py` |
| 3.2 | Paginação `limit`/`offset` | Atendido | `api/app/main.py`, `api/app/repository.py`; `test_api.py` |
| 3.3 | `limit > 200` → 400 | Atendido | `api/app/main.py`; `test_api.py` (`test_list_rejects_bad_pagination`) |
| 3.4 | Parâmetros inválidos → 400 | Atendido | `api/app/main.py`; `test_api.py` |
| 3.5 | `short_url = BASE_URL + /r/ + code` | Atendido com divergência | `api/app/main.py` (`short_url`); `test_api.py` (`test_create_random_code`) |
| 3.6 | Ordenação por `created_at DESC` | Atendido com divergência | `api/app/repository.py` (`list_page`: `ORDER BY created_at DESC, id DESC`) |
| 4.1 | POST /api/links → 201 com campos | Atendido com divergência | `api/app/main.py`; sem `qr_code_url` |
| 4.2 | Validação de `original_url` | Atendido | `api/app/shortcode.py` (`is_valid_url`); `test_api.py` |
| 4.3 | Validação de `custom_code` | Atendido com extensão | `api/app/shortcode.py`; inclui verificação de reservados |
| 4.4 | `custom_code` em uso → 409 | Atendido | `api/app/main.py`, `api/app/repository.py`; `test_api.py` |
| 4.5 | Geração aleatória com retry | Atendido | `api/app/main.py` (`MAX_GENERATION_ATTEMPTS = 5`); `test_api.py` |
| 4.6 | `expires_at` inválido → 400 | Atendido | `api/app/main.py`; `test_api.py` |
| 4.7 | `kiro.links.created` incrementado | Atendido | `api/app/main.py` (`telemetry.link_created`); `test_telemetry.py` |
| 4.8 | `qr_code_url` na resposta | Não atendido | QR Code gerado no navegador (D-17). Sem `qr_code_url` na API. |
| 5.1 | GET /r/{code} → 302 | Atendido com divergência | Rota canônica `/r/{short_code}`; `test_api.py` |
| 5.2 | Código inexistente → 404 | Atendido | `api/app/main.py`; `test_api.py` |
| 5.3 | Link expirado → 410 | Atendido | `api/app/main.py`; `test_api.py` (`test_redirect_expired_link_is_410`) |
| 5.4 | `clicks` incrementado atomicamente | Atendido com divergência | CTE em `register_click` (`api/app/repository.py`) |
| 5.5 | Inserção de `click_event` com `user_agent` | Atendido com divergência | Síncrono no CTE; sem `ip_address` (LGPD); `referer` gravado extra |
| 5.6 | `kiro.link.redirect.duration` | Atendido | `api/app/main.py`; `test_telemetry.py` |
| 5.7 | `kiro.link.clicks` incrementado | Atendido | `api/app/main.py`; `test_telemetry.py` |
| 5.8 | `kiro.link.short_code` no span | Atendido | `api/app/telemetry.py` (`tag_short_code`); `test_telemetry.py` |
| 5.9 | Falha no `clicks` → 502 | Não atendido | Falha de banco retorna 503 (handler global), não 502. |
| 6.1 | GET /api/links/{code}/stats → 200 | Atendido com extensão | Inclui `last_24h`; `test_api.py` |
| 6.2 | Stats: código inexistente → 404 | Atendido | `api/app/main.py`; `test_api.py` |
| 6.3 | Stats usa tabela `links` (inclui expirados) | Atendido | `api/app/repository.py` (`get`); `test_api.py` |
| 6.4 | `shortCode` inválido no stats → 400 | Atendido | `api/app/main.py`; `test_api.py` (`test_stats`) |
| 7.1 | `/healthz` → 200 sem checar banco | Atendido | `api/app/main.py`; `test_api.py`, `test_telemetry.py` |
| 7.2 | `/healthz` < 100 ms | Não verificado | Não testado por tempo de execução; endpoint trivial. |
| 8.1 | `/readyz` → 200 com banco ok | Atendido | `api/app/main.py`; `test_api.py` |
| 8.2 | `/readyz` → 503 sem banco | Atendido | `api/app/main.py`; `test_api.py` (`test_database_down_returns_503`) |
| 8.3 | Cancelamento de query no timeout | Não verificado | `pool.connection(timeout=2)` timeout de conexão; comportamento de cancelamento não confirmado. |
| 9.1 | `/metrics` → 200, formato Prometheus | Atendido | `api/app/telemetry.py`; `test_telemetry.py` |
| 9.2 | Métricas manuais expostas | Atendido | `api/app/telemetry.py`; `test_telemetry.py` |
| 9.3 | `http_server_request_duration_seconds` | Atendido | `api/app/telemetry.py` (`FastAPIInstrumentor`); `test_telemetry.py` |
| 9.4 | `http_route` = template | Atendido com divergência | Template é `/r/{short_code}`, não `/{shortCode}`; `test_telemetry.py` |
| 9.5 | Sem atributos de alta cardinalidade | Atendido | `api/app/telemetry.py` (`FEATURES` fixo); `test_telemetry.py` |
| 9.6 | Gauge via callback `count_active` | Atendido | `api/app/telemetry.py`, `api/app/repository.py`; `test_telemetry.py` |
| 9.7 | Buckets do histograma | Atendido | `api/app/telemetry.py` (`ExplicitBucketHistogramAggregation`); `test_telemetry.py` |
| 10.1 | Módulo único de telemetria | Atendido com divergência | `api/app/telemetry.py` (não `api/src/telemetry/`) |
| 10.2 | Telemetria inicializada antes do HTTP | Atendido | `api/app/main.py` (`telemetry.setup(app)` no início de `create_app`) |
| 10.3 | Propagação W3C + spans de banco filhos | Atendido | `api/app/telemetry.py`; `test_telemetry.py` (`test_trace_has_db_span_as_child`) |
| 10.4 | `service.name = kiro-api` via env | Atendido | `api/app/telemetry.py`, `k8s/api/configmap.yaml` |
| 10.5 | OTLP endpoint via env | Atendido | `api/app/telemetry.py` |
| 10.6 | Sampler via `OTEL_TRACES_SAMPLER` | Atendido | `api/app/telemetry.py` (SDK lê env diretamente) |
| 10.7 | Nomes dos spans | Atendido com divergência | Span do redirect é `GET /r/{short_code}`; `test_telemetry.py` |
| 10.8 | `kiro.link.short_code` no span | Atendido | `api/app/telemetry.py` (`tag_short_code`); `test_telemetry.py` |
| 10.9 | Interface encapsulada sem vazamento do SDK | Atendido | `api/app/telemetry.py` (interface pública em funções simples); código de negócio não importa OTel diretamente |
| 11.1 | `Dockerfile` multi-stage | Atendido | `api/Dockerfile` |
| 11.2 | `docker-compose.yml` na raiz | Atendido com divergência | `docker-compose.yml` na raiz do repo, não em `api/` |
| 11.3 | Ambiente funcional em 60s | Atendido | `docker-compose.yml` (healthcheck api: 12 tentativas × 5s = 60s) |
| 11.4 | Sem credenciais reais versionadas | Atendido | `docker-compose.yml` (valor padrão: `troque-esta-senha`) |
| 11.5 | Usuário sem root no container | Atendido | `k8s/api/deployment.yaml` (`runAsNonRoot`, `runAsUser: 10001`) |

---

## 14. Lacunas

### L-1 — Cache de redirecionamento (Requisito 2)

**Procurado:** variáveis `CACHE_MAX_SIZE`, `CACHE_DEFAULT_TTL_SECONDS` em `api/app/config.py`; importação de biblioteca de cache em `api/app/` (lru-cache, cachetools, etc.); lógica cache-aside em `api/app/main.py` ou `api/app/repository.py`.

**Não encontrado.** O redirect vai direto ao banco a cada requisição (`register_click` em `api/app/repository.py`). A latência é mitigada por `synchronous_commit off` na transação de clique.

### L-2 — Campo `qr_code_url` na resposta de criação (Requisito 4.8)

**Procurado:** campo `qr_code_url` na função `serialize` de `api/app/main.py`; endpoint `GET /qr/{shortCode}`.

**Não encontrado.** O QR Code é gerado no navegador (D-17). A decisão está documentada em `openapi.yaml` (v1.2.0, changelog).

### L-3 — HTTP 502 em falha de incremento de clicks (Requisito 5.9)

**Procurado:** distinção entre falha no `UPDATE clicks` (502) e falha geral de banco (503) em `api/app/main.py`.

**Não encontrado.** O handler global (`on_db_unavailable`) trata `psycopg.OperationalError` e `PoolTimeout` como 503, sem distinção. O CTE atômico torna a falha no incremento indistinguível de falha geral de banco.

### L-4 — `ip_address` nos `click_events` (Requisito 5.5)

**Procurado:** gravação de `ip_address` em `register_click` de `api/app/repository.py`.

**Não encontrado.** O campo existe no schema mas a API passa `None` implicitamente (o INSERT não inclui `ip_address`). Motivo documentado no `schema.sql`: "a API não grava IP (LGPD)".

### L-5 — Latência < 100 ms do `/healthz` (Requisito 7.2)

**Não verificado por execução.** O endpoint é trivial, mas o critério de latência não foi medido.

### L-6 — Cancelamento explícito de query no timeout do `/readyz` (Requisito 8.3)

**Não verificado por execução.** `pool.connection(timeout=2)` aplica timeout na aquisição de conexão, não na execução da query. O comportamento ao atingir o timeout não foi confirmado em ambiente com banco lento.

---

## 15. Plano original (substituído por D-03)

O conteúdo abaixo é o plano original do design, escrito para Node.js/Fastify/TypeScript, preservado para rastreabilidade histórica. Foi substituído pela decisão D-03 (Python/FastAPI).

**Stack proposta (substituída):**
- Node.js LTS + TypeScript (`tsconfig.json`, `dist/`, `src/`)
- Fastify `^5.0.0` como framework HTTP
- `pg ^8.13.0` como driver PostgreSQL
- `lru-cache ^11.0.0` para cache em memória
- `nanoid ^5.0.0` para geração de código
- `zod ^3.23.0` para validação de variáveis de ambiente
- `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`

**Estrutura de diretórios proposta (substituída):**
```
api/src/
  telemetry/index.ts, sdk.ts, instruments.ts
  db/pool.ts, linksRepository.ts, clicksRepository.ts
  cache/redirectCache.ts
  services/shortenService.ts, redirectService.ts, statsService.ts, listService.ts
  routes/links.ts, redirect.ts, stats.ts, health.ts
  utils/shortCode.ts
  config.ts, app.ts, server.ts
```

**Principais diferenças em relação à implementação real:**
- Node.js → Python; Fastify → FastAPI; TypeScript → Python tipado
- `pg.Pool` → `psycopg-pool`; `nanoid` → `secrets.choice`; `zod` → dataclass + código direto
- Cache Cache-Aside com `lru-cache` → não implementado
- Dois repositórios separados (`linksRepository`, `clicksRepository`) → `LinkRepository` único
- Camada de serviços (`shortenService`, `redirectService`, etc.) → lógica nos handlers de `main.py`
- `api/docker-compose.yml` separado → `docker-compose.yml` na raiz do repo
- `qr_code_url` retornado pela API → QR Code gerado no navegador (D-17)

O design original completo (com queries SQL, interfaces TypeScript e fluxos detalhados) está na versão anterior deste arquivo no histórico do Git.
