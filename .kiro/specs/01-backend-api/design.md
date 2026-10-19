Status: Aprovado em 2026-10-18 por Diêgo

# Design — Backend API

Este documento explica como a API atende aos requisitos da spec. Ele foi reescrito depois da troca de Node.js para Python (D-03), então descreve o que está no código hoje.

## 1. Visão geral

A API é um serviço Python 3.12 com FastAPI e psycopg 3. Ela cria e lista links, faz o redirect contando cliques, guarda tudo no PostgreSQL 16 e expõe métricas (Prometheus) e traces (OTLP).

Dependências principais, todas com versão fixa em `api/requirements.txt`:

- `fastapi` e `uvicorn[standard]`;
- `psycopg[binary,pool]` e `psycopg-pool`;
- `opentelemetry-sdk`, exporter OTLP/HTTP, exporter Prometheus e as instrumentações de FastAPI e psycopg;
- `prometheus-client`.

Escolhemos FastAPI porque a validação do corpo e o OpenAPI vêm prontos, e porque existe instrumentação oficial do OpenTelemetry tanto para ele quanto para o psycopg.

## 2. Organização do código

```
api/
├── app/
│   ├── main.py         # create_app(), lifespan, rotas e handlers de erro
│   ├── config.py       # Settings lido das variáveis de ambiente
│   ├── db.py           # pool, espera pelo banco e migração
│   ├── repository.py   # LinkRepository: todo o SQL
│   ├── shortcode.py    # geração e validação de código e URL
│   ├── telemetry.py    # tudo de OpenTelemetry
│   └── schema.sql      # tabelas, view active_links e índices
├── tests/              # pytest (unitários, integração com Postgres e contrato de telemetria)
├── Dockerfile
├── requirements.txt
└── requirements-dev.txt
```

Não criamos uma camada de serviços. A lógica de cada rota é curta e cabe no handler do `main.py`; o SQL fica no repositório e a telemetria no seu módulo. Com isso, para entender uma rota basta ler uma função.

## 3. Configuração

`config.py` monta um `Settings` imutável a partir das variáveis de ambiente. No Kubernetes elas vêm do ConfigMap `api-config` e do Secret `db-credentials`.

| Variável | Padrão | Uso |
|---|---|---|
| `DATABASE_URL` | — | Connection string completa. Se não existir, usamos as `DB_*` |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | `localhost`, `5432`, `encurtador`, `kiro`, vazio | Conexão com o Postgres |
| `DB_POOL_MIN` / `DB_POOL_MAX` | 1 / 10 (teto 100) | Tamanho do pool |
| `DB_STARTUP_TIMEOUT_SECONDS` | 60 | Quanto tempo esperar o banco no boot |
| `BASE_URL` | `http://localhost:8080` | Prefixo do `short_url` |
| `SHORT_CODE_LENGTH` | 7 | Tamanho do código aleatório |
| `SHORT_CODE_ALPHABET` | `a-z0-9` | Alfabeto do código aleatório |
| `OTEL_*` | — | Lidas direto pelo SDK do OpenTelemetry |

A porta (8080) é definida no comando do uvicorn, no Dockerfile.

## 4. Inicialização

O `lifespan` do FastAPI faz, em ordem:

1. cria o pool (`autocommit=True`, linhas como dicionário) e abre sem bloquear;
2. `wait_for_database`: tenta `SELECT 1` a cada 2s, com 5s por tentativa, até `DB_STARTUP_TIMEOUT_SECONDS`. Se estourar, levanta `RuntimeError` e o processo sai com erro;
3. `migrate`: pega `pg_advisory_lock(7201026)`, roda o `schema.sql` e solta o lock. O schema usa `IF NOT EXISTS`, `CREATE OR REPLACE` e `ADD COLUMN IF NOT EXISTS`, então pode rodar a cada boot;
4. registra `repo.count_active` como fonte do gauge `kiro.active_links`.

Os passos 2 e 3 rodam dentro de `telemetry.untraced()` para não gerar spans de inicialização.

O orçamento de 60s conversa com o `startupProbe` do Kubernetes (120s). Quando o probe era menor que a espera interna, o kubelet matava a API no primeiro boot do Postgres no kind.

## 5. Modelo de dados

```sql
links (
  id, short_code VARCHAR(50) UNIQUE, original_url TEXT,
  clicks INTEGER DEFAULT 0, created_at TIMESTAMPTZ, expires_at TIMESTAMPTZ NULL
)

-- Única definição de "link ativo", usada pelo redirect, pelo gauge e pelos painéis SQL
active_links = links WHERE expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP

click_events (
  id, link_id → links, clicked_at TIMESTAMPTZ,
  user_agent TEXT, ip_address VARCHAR(45), referer TEXT
)
-- índices: (link_id, clicked_at DESC) e (clicked_at DESC)
```

`ip_address` fica vazio de propósito (LGPD). `referer` entrou depois, via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, para dar base às features de analytics.

## 6. Repositório

`LinkRepository` recebe o pool e tem um método por consulta:

| Método | O que faz |
|---|---|
| `ping(timeout)` | `SELECT 1`, usado pelo `/readyz` |
| `create(code, url, expires_at)` | `INSERT ... ON CONFLICT DO NOTHING RETURNING`. Devolve `None` se o código já existe |
| `list_page(limit, offset)` | Página ordenada por `created_at DESC, id DESC` e o total |
| `get(code)` | Busca na tabela `links`, incluindo expirados (usado no `/stats`) |
| `register_click(code, ua, referer)` | Conta o clique e grava o evento numa única instrução |
| `exists(code)` | Diferencia link expirado de inexistente depois de um redirect sem sucesso |
| `count_active()` | `count(*)` na view, para o gauge |
| `clicks_by_hour(code, hours)` | Série por hora para o `/stats` |
| `ranking(hours, limit)` | Links mais clicados na janela |

O `register_click` é o ponto mais sensível da API:

```sql
WITH hit AS (
  UPDATE links SET clicks = clicks + 1
  WHERE id = (SELECT id FROM active_links WHERE short_code = :code)
  RETURNING id, original_url
), event AS (
  INSERT INTO click_events (link_id, user_agent, referer)
  SELECT id, :ua, :referer FROM hit
)
SELECT original_url FROM hit
```

Numa ida ao banco ele confere se o link está ativo, soma o clique e grava o evento. Como é uma instrução só, o contador e o log nunca ficam diferentes.

A transação roda com `SET LOCAL synchronous_commit TO off`. Pelos traces, o p95 do redirect estava na casa das centenas de milissegundos, e a causa era o fsync do commit no disco do Docker/WSL. Desligando isso só no clique, o pior caso caiu de cerca de 1s para cerca de 12 ms. O custo é perder, num crash do Postgres, no máximo uma fração de segundo de cliques. A criação de links continua com commit durável.

## 7. Rotas

| Método | Rota | Respostas |
|---|---|---|
| `GET` | `/healthz` | 200 |
| `GET` | `/readyz` | 200, 503 |
| `GET` | `/metrics` | 200 (registrada pelo `telemetry.setup`) |
| `POST` | `/api/links` | 201, 400, 409, 503 |
| `GET` | `/api/links` | 200, 400, 503 |
| `GET` | `/api/links/{short_code}/stats` | 200, 400, 404 |
| `GET` | `/api/ranking` | 200, 400 |
| `GET` | `/r/{short_code}` | 302, 404, 410 |
| `GET` | `/{short_code}` | igual a `/r/{short_code}`, fora do OpenAPI |

A rota `/{short_code}` é registrada por último para não engolir as outras. É por causa dela que existe a lista de códigos reservados.

Erros seguem sempre o formato `{ "error": "<código>", "message": "<texto>" }`. Três handlers globais cuidam dos casos comuns:

- `RequestValidationError` (corpo ou query fora do tipo) vira 400 `invalid_request`, citando o primeiro campo inválido;
- `psycopg.OperationalError` e `PoolTimeout` viram 503 `database_unavailable`, com log do erro.

### Fluxo do redirect

```
GET /r/{short_code}[?via=qr]
  código com formato inválido     → 404 (sem ir ao banco)
  tag_short_code(code)            → atributo no span
  register_click(code, ua, ref)
    devolveu a URL                → redirect_finished("found"), link_clicked(),
                                    feature_used("qrcode") se via=qr,
                                    302 com Cache-Control: no-store
    devolveu None e exists(code)  → redirect_finished("expired")   → 410
    devolveu None                 → redirect_finished("not_found") → 404
```

O tempo medido vai do início do `register_click` até a decisão. O `Cache-Control: no-store` evita que o navegador guarde o 302 e deixe de contar os próximos acessos.

### Criação

1. valida a URL (`shortcode.is_valid_url`);
2. valida `expires_at` (sem fuso vira UTC; precisa estar no futuro);
3. com `custom_code`: valida formato, confere a lista de reservados e tenta inserir; `None` vira 409;
4. sem `custom_code`: gera com `secrets.choice` e tenta até 5 vezes; se todas colidirem, 503;
5. chama `telemetry.link_created(vanity=...)` e `tag_short_code`.

Com 7 caracteres de `a-z0-9` são cerca de 78 bilhões de combinações, então as 5 tentativas são só uma rede de segurança.

## 8. Telemetria

`telemetry.py` é o único arquivo que importa o OpenTelemetry. O resto da API usa estas funções:

| Função | O que faz |
|---|---|
| `setup(app)` | Liga providers e instrumentações (uma vez por processo) e registra `GET /metrics` |
| `link_created(vanity)` | `kiro.links.created` com `kind` |
| `link_clicked()` | `kiro.link.clicks` |
| `redirect_finished(seconds, outcome)` | `kiro.link.redirect.duration` com `outcome` |
| `feature_used(feature)` | `kiro.feature.used`. Só aceita valores do conjunto `FEATURES` (`stats`, `ranking`, `qrcode`), para não criar rótulo novo por engano |
| `tag_short_code(code)` | Atributo `kiro.link.short_code` no span atual |
| `untraced()` | Suspende a instrumentação (probes e boot) |
| `set_active_links_source(fn)` | Fonte do gauge `kiro.active_links` |

Detalhes que deram trabalho:

- `OTEL_SEMCONV_STABILITY_OPT_IN=http` é definido antes dos imports das instrumentações. Sem isso a métrica sai com o nome antigo (`http.server.duration`, em ms).
- O histograma do redirect tem buckets explícitos. Os padrões do SDK são pensados para milissegundos e jogariam tudo no primeiro bucket.
- `/healthz`, `/readyz` e `/metrics` ficam fora da instrumentação, e os spans internos do ASGI (`receive`, `send`) também. Antes disso, cada trace vinha cheio de spans soltos.
- O exportador de spans só é ligado se `OTEL_EXPORTER_OTLP_ENDPOINT` existir e `OTEL_SDK_DISABLED` não for `true`. Nos testes os spans ficam em memória.

O design completo da observabilidade (Collector, Tempo, Prometheus e Grafana) está na spec `04-observabilidade`.

## 9. Imagem e ambiente local

O `api/Dockerfile` tem duas etapas. A primeira instala as dependências num virtualenv; a segunda copia só o virtualenv e o código para um `python:3.12-slim` limpo, cria o usuário `kiro` (UID 10001) e roda como ele. O uvicorn sobe com 1 worker por pod: quem escala é o Kubernetes, com réplicas, e assim o `/metrics` de cada pod é consistente.

No `docker-compose.yml` da raiz, a API depende do banco saudável e tem healthcheck no `/readyz`. O profile `test` sobe um Postgres descartável e roda o pytest num container `python:3.12`.

## 10. Testes

| Arquivo | O que cobre |
|---|---|
| `test_shortcode.py` | Geração de código, validação de código e URL, reservados |
| `test_api.py` | Integração com Postgres real: probes, criação, conflito, validações, listagem, redirect 302/404/410, contagem e eventos de clique, stats, série por hora, referer, ranking e banco fora do ar (503) |
| `test_telemetry.py` | Nomes e rótulos das métricas, `http_route` como template, span do banco como filho do span HTTP, continuação do `traceparent`, métrica de features e do QR Code, probes sem span |

São 44 testes no total, contando os parametrizados. O `conftest.py` usa o `TestClient` do FastAPI com o banco de `TEST_DATABASE_URL` e limpa as tabelas antes de cada teste.

Os testes rodam também em Python 3.12. Isso entrou depois de um bug que passava no 3.14 local e quebrava na imagem: o método `list` do repositório sombreava o builtin. Ele foi renomeado para `list_page`.

## 11. O que ainda não foi verificado

- O `/healthz` não tem teste de tempo de resposta. Como não consulta nada, não esperamos problema.
- No `/readyz`, o timeout de 2s vale para conseguir uma conexão do pool. Não testamos o caso de um banco que aceita a conexão mas demora para responder a query.
- A métrica `db.client.operation.duration` da instrumentação do psycopg não apareceu no `/metrics`. Os spans do banco aparecem normalmente.
