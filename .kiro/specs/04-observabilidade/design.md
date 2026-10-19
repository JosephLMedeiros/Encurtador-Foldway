Status: Reconciliado com a implementação em 18/10/2026 (escrito após a implementação)

# Design Document — 04 Observabilidade

Este documento descreve a implementação de observabilidade **conforme encontrada no repositório**. Toda afirmação cita o arquivo que a comprova. O que não foi confirmado por execução está marcado como "Não verificado" ou "Não confirmado".

---

## 1. Visão geral

A stack de observabilidade é composta por cinco componentes implantados como Deployments Kubernetes independentes (com equivalentes no docker-compose):

| Componente | Imagem | Responsabilidade |
|---|---|---|
| OTel Collector | `otel/opentelemetry-collector:0.120.0` | Recebe spans OTLP do navegador e da API; encaminha ao Tempo |
| Tempo | `grafana/tempo:2.6.1` | Backend de traces; gera métricas de service graph e span metrics |
| Prometheus | `prom/prometheus:v2.55.1` | Scrape do endpoint `/metrics` da API; recebe remote write do Tempo |
| Grafana | `grafana/grafana:11.3.0` | Dashboards; datasources Prometheus, Tempo e Postgres |
| API (FastAPI/Python 3.12) | — | Emite métricas (Prometheus) e traces (OTLP) |

Fontes: `docker-compose.yml`, `k8s/observability/otel-collector.yaml`, `k8s/observability/tempo.yaml`, `k8s/observability/prometheus.yaml`, `k8s/observability/grafana.yaml`.

---

## 2. Instrumentação da API

### 2.1 Módulo de telemetria

A API concentra toda a instrumentação em `api/app/telemetry.py`. O módulo é chamado uma vez por processo via `telemetry.setup(app)` em `api/app/main.py`.

**Bibliotecas Python usadas** (`api/requirements.txt`):
- `opentelemetry-sdk==1.45.1`
- `opentelemetry-exporter-otlp-proto-http==1.45.1`
- `opentelemetry-exporter-prometheus==0.66b1`
- `opentelemetry-instrumentation-fastapi==0.66b1`
- `opentelemetry-instrumentation-psycopg==0.66b1`
- `prometheus-client==0.26.0`

### 2.2 Endpoint de métricas

`telemetry.setup()` registra a rota `GET /metrics` diretamente no app FastAPI usando `prometheus_client.generate_latest(REGISTRY)`. A rota está excluída do schema OpenAPI (`include_in_schema=False`) e não gera spans (`EXCLUDED_URLS = "/healthz$,/readyz$,/metrics$"`).

Fonte: `api/app/telemetry.py`, função `setup()`.

### 2.3 Probes de saúde

Implementadas em `api/app/main.py`:

- `GET /healthz` — retorna `{"status": "ok"}` (HTTP 200) sem verificar o banco.
- `GET /readyz` — executa `repo.ping(timeout=2)` via `telemetry.untraced()` (sem gerar spans); retorna 200 se o banco responder ou 503 caso contrário.

Ambas excluídas das métricas HTTP via `EXCLUDED_URLS` em `telemetry.py`.

### 2.4 Convenção semântica estável

O módulo força `OTEL_SEMCONV_STABILITY_OPT_IN=http` via `os.environ.setdefault(...)` antes dos imports de instrumentação, garantindo o nome estável `http.server.request.duration` (em segundos) em vez do legado `http.server.duration` (em milissegundos).

Fonte: `api/app/telemetry.py`, topo do arquivo.

### 2.5 Métricas de negócio implementadas

Todos os instrumentos são criados em `_setup_providers()` em `api/app/telemetry.py`:

| Instrumento OTel | Tipo | Atributos | Função de emissão |
|---|---|---|---|
| `kiro.links.created` | Counter | `kind`: `random` \| `vanity` | `telemetry.link_created(vanity: bool)` |
| `kiro.link.clicks` | Counter | nenhum | `telemetry.link_clicked()` |
| `kiro.link.redirect.duration` | Histogram (s) | `outcome`: `found` \| `not_found` \| `expired` | `telemetry.redirect_finished(seconds, outcome)` |
| `kiro.feature.used` | Counter | `feature`: valor em `FEATURES` (`stats`, `ranking`, `qrcode`) | `telemetry.feature_used(feature)` |
| `kiro.active_links` | ObservableGauge | nenhum | callback `_observe_active_links` |

Os buckets do histograma de redirect são `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0]`, configurados por `ExplicitBucketHistogramAggregation` no `MeterProvider`.

Fonte: `api/app/telemetry.py`.

### 2.6 Gauge `kiro.active_links`

O callback `_observe_active_links` chama `_active_links_source()`, que é registrada em `main.py` como `repo.count_active`. Este método executa `SELECT count(*) AS n FROM active_links` usando a view definida em `api/app/schema.sql`. A execução ocorre dentro de `suppress_instrumentation()` para não gerar traces a cada ciclo de coleta.

Fontes: `api/app/telemetry.py` (`_observe_active_links`, `set_active_links_source`), `api/app/repository.py` (`count_active`), `api/app/schema.sql` (view `active_links`), `api/app/main.py` (`telemetry.set_active_links_source`).

### 2.7 Pontos de emissão no código de negócio

Em `api/app/main.py`:

- `create_link` — chama `telemetry.link_created(vanity=...)` e `telemetry.tag_short_code(code)` após a criação bem-sucedida.
- `redirect` — mede `time.perf_counter()` antes da consulta ao banco; chama `telemetry.redirect_finished(elapsed, outcome)`, `telemetry.link_clicked()` (só em `found`) e `telemetry.feature_used("qrcode")` quando `via=qr`.
- `link_stats` — chama `telemetry.feature_used("stats")` e `telemetry.tag_short_code(short_code)`.
- `ranking` — chama `telemetry.feature_used("ranking")`.

### 2.8 Instrumentação automática do banco

`PsycopgInstrumentor().instrument(enable_commenter=False)` é chamado em `_setup_providers()`. Isso gera spans de cliente do banco (`db.system.name=postgresql`) como filhos do span de servidor correspondente.

> **Não confirmado:** a emissão do histograma `db.client.operation.duration` não foi confirmada em execução. O comando `curl -s localhost:8080/metrics | grep db_client` não retornou nenhuma linha. O `PsycopgInstrumentor` gera os spans do banco, mas a emissão dessa métrica depende da versão do pacote e não foi verificada.

Fonte: `api/app/telemetry.py`.

### 2.9 Atributo `kiro.link.short_code`

`telemetry.tag_short_code(code)` chama `trace.get_current_span().set_attribute("kiro.link.short_code", code)`. É chamado nos handlers de `redirect`, `create_link` e `link_stats`.

Fonte: `api/app/telemetry.py` e `api/app/main.py`.

### 2.10 Configuração via variáveis de ambiente

Nenhuma URL ou nome de serviço está fixo no código. O módulo lê:
- `OTEL_SERVICE_NAME` (padrão `"kiro-api"`)
- `OTEL_EXPORTER_OTLP_ENDPOINT` (ausente = exportação desabilitada; flag `OTEL_SDK_DISABLED`)
- `OTEL_TRACES_SAMPLER` (lido pelo SDK automaticamente)
- `OTEL_PROPAGATORS` (lido pelo SDK automaticamente)

No docker-compose, essas variáveis são definidas inline no serviço `api`. No Kubernetes, são fornecidas pelo ConfigMap `api-config` em `k8s/api/configmap.yaml` (linhas 24–27: `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_PROPAGATORS` e `OTEL_TRACES_SAMPLER`), referenciado no Deployment da API via `envFrom.configMapRef`.

Fontes: `api/app/telemetry.py`, `docker-compose.yml`, `k8s/api/configmap.yaml`, `k8s/api/deployment.yaml`.

---

## 3. Traces distribuídos

### 3.1 Propagação W3C no frontend (JavaScript)

`frontend/src/api/tracing.js` implementa um tracer manual mínimo sem dependências de SDK (ver D-14 no SSOT). Para cada chamada de API:

1. Gera `traceId` (16 bytes hex) e `spanId` (8 bytes hex) usando `crypto.getRandomValues`.
2. Injeta o cabeçalho `traceparent: 00-<traceId>-<spanId>-01` na requisição `fetch`.
3. Ao terminar, serializa o span em formato OTLP/JSON e envia para `/otlp/v1/traces` com `keepalive: true`.

O `service.name` deste span é `'kiro-browser'`.

Fonte: `frontend/src/api/tracing.js`.

### 3.2 Nginx como elo do trace

O `frontend/Dockerfile` usa a imagem `nginx:1.27-alpine-otel`, que inclui o módulo `ngx_otel_module`. O `frontend/nginx.conf` configura:

```
otel_exporter { endpoint otel-collector:4317; }
otel_service_name kiro-frontend;
otel_trace on;
otel_trace_context propagate;
```

O nginx propaga o `traceparent` recebido do navegador para a API, criando um span intermediário com `service.name=kiro-frontend`. A rota `/otlp/` encaminha os spans do navegador ao Collector na porta 4318.

Fonte: `frontend/nginx.conf`, `frontend/Dockerfile`.

### 3.3 API: spans de servidor

`FastAPIInstrumentor.instrument_app(app, excluded_urls=EXCLUDED_URLS, exclude_spans=["receive","send"])` cria automaticamente um span de servidor por requisição. O atributo `http.route` usa o template da rota porque a instrumentação do FastAPI lê `request.scope["route"].path`.

Fonte: `api/app/telemetry.py`.

### 3.4 Cadeia de trace efetiva

```
Navegador (kiro-browser) → nginx (kiro-frontend) → API FastAPI (kiro-api) → psycopg (db)
```

O trace-id é gerado no navegador e propagado via `traceparent` por todas as camadas.

### 3.5 Exportação de traces

A API exporta spans via `OTLPSpanExporter` (OTLP/HTTP) para `OTEL_EXPORTER_OTLP_ENDPOINT` (porta 4318 do Collector). O nginx exporta via gRPC (porta 4317). O Collector encaminha tudo ao Tempo.

Fontes: `api/app/telemetry.py`, `frontend/nginx.conf`, `k8s/observability/config/otel-collector.yaml`.

---

## 4. Infraestrutura de observabilidade

### 4.1 OTel Collector

Configuração em `k8s/observability/config/otel-collector.yaml` (compartilhada com docker-compose):

- Receivers: `otlp` gRPC na 4317, HTTP na 4318.
- Processors: `memory_limiter` (200 MiB, spike 50 MiB) + `batch`.
- Exporter: `otlp/tempo` para `tempo:4317` (insecure).
- Pipeline: `traces` (receivers → processors → exporters).

Manifest Kubernetes: `k8s/observability/otel-collector.yaml` (Deployment + Service). A config é montada via ConfigMap `otel-collector-config`. Liveness/readiness probe no endpoint `/` na porta 13133.

### 4.2 Tempo

Configuração em `k8s/observability/config/tempo.yaml`:

- Modo monolítico; storage local em `/var/tempo`.
- Receiver OTLP gRPC na 4317.
- Retenção: 24h.
- `metrics_generator` habilitado com processors `service-graphs`, `span-metrics` e `local-blocks`; faz remote write para `http://prometheus:9090/api/v1/write` com exemplares.
- No Kubernetes usa `emptyDir` (traces perdidos ao reiniciar o pod — ver Limitação L-4).

Manifest Kubernetes: `k8s/observability/tempo.yaml` (Deployment + Service, portas 3200 e 4317).

### 4.3 Prometheus

Configuração Kubernetes (`k8s/observability/config/prometheus.yaml`): descoberta via `kubernetes_sd` (role `pod`, namespace `encurtador`), filtrando pods com anotação `prometheus.io/scrape=true`. Lê `prometheus.io/path` e `prometheus.io/port` para definir caminho e porta do scrape. O rótulo `app` é derivado do label do pod.

O Deployment da API (`k8s/api/deployment.yaml`, linhas 20–22) possui as anotações:
```yaml
prometheus.io/scrape: "true"
prometheus.io/port: "8080"
prometheus.io/path: "/metrics"
```

Configuração docker-compose (`k8s/observability/config/prometheus.compose.yaml`): scrape estático em `api:8080`.

Flags: `--web.enable-remote-write-receiver` e `--enable-feature=exemplar-storage` (recebe service graph do Tempo).

Manifest Kubernetes: `k8s/observability/prometheus.yaml` (ServiceAccount, Role, RoleBinding, Deployment, Service).

Fontes: `k8s/observability/config/prometheus.yaml`, `k8s/api/deployment.yaml`.

### 4.4 Grafana

Configuração: provisionamento automático por arquivos montados como ConfigMaps:

- Datasources (`k8s/observability/config/grafana-datasources.yaml`): Prometheus (`uid: prometheus`, padrão), Tempo (`uid: tempo`, com service map e node graph), Postgres (`uid: postgres` apontando para `database:5432`, credenciais via Secret `db-credentials`).
- Dashboard provider (`k8s/observability/config/grafana-dashboards.yaml`): lê JSONs de `/var/lib/grafana/dashboards` (pasta `Kiro Portal`, `allowUiUpdates: true`).
- Dashboard (`k8s/observability/dashboards/kiro-portal.json`): versionado no repositório.

Acesso anônimo habilitado (`GF_AUTH_ANONYMOUS_ENABLED=true`, role Viewer). Credenciais de admin em Secret `grafana-admin`.

Manifest Kubernetes: `k8s/observability/grafana.yaml` (Secret + Deployment + Service). Volumes: `emptyDir` para dados, ConfigMaps para datasources, provider e dashboard JSON.

---

## 5. Dashboard `kiro-portal.json`

O arquivo `k8s/observability/dashboards/kiro-portal.json` contém os seguintes painéis:

| ID | Tipo | Título | Fonte |
|---|---|---|---|
| 2 | stat | Cliques / s | Prometheus (`rate(kiro_link_clicks_total[1m])`) |
| 3 | stat | Cliques na última hora | Prometheus (`increase(kiro_link_clicks_total[1h])`) |
| 4 | stat | Links ativos | Prometheus (`kiro_active_links`) |
| 5 | stat | Latência p95 do redirect | Prometheus (`histogram_quantile(0.95, kiro_link_redirect_duration_seconds_bucket)`) |
| 6 | stat | Erros 5xx | Prometheus (proporção 5xx sobre total) |
| 7 | stat | Pods da API no ar | Prometheus (`sum(up{app="api"})`) |
| 9 | timeseries | Cliques por segundo | Prometheus |
| 10 | timeseries | Latência do redirect (p50, p95, p99) | Prometheus |
| 12 | timeseries | Requisições/s por rota | Prometheus |
| 13 | timeseries | Respostas por status | Prometheus |
| 14 | timeseries | Taxa de erros 5xx | Prometheus |
| 15 | timeseries | Latência HTTP p95 por rota | Prometheus |
| 16 | timeseries | Resultado dos redirects | Prometheus (`kiro_link_redirect_duration_seconds_count` por `outcome`) |
| 18 | timeseries | Links criados (aleatório x personalizado) | Prometheus |
| 19 | timeseries | Uso de features | Prometheus (`kiro_feature_used_total`) |
| 20 | table | Link do dia (24h, direto do Postgres) | Postgres (SQL sobre `click_events`) |
| 22 | timeseries | Spans/s por componente (span metrics do Tempo) | Prometheus (span metrics gerados pelo Tempo) |
| 23 | table | Traces recentes | Tempo (TraceQL `{ resource.service.name =~ "kiro-.*" }`) |

O painel "Link do dia" (id 20) usa o datasource Postgres, confirmando o painel desejável do Requisito 5.

---

## 6. Configuração compartilhada docker-compose ↔ Kubernetes

Os arquivos de configuração em `k8s/observability/config/` são montados tanto no docker-compose quanto nos Deployments Kubernetes, exceto `prometheus.compose.yaml` (scrape estático, somente compose). Isso garante paridade entre os dois ambientes.

Fonte: `docker-compose.yml` (seção volumes de cada serviço de observabilidade).

---

## 7. Divergências de projeto

Os itens abaixo representam divergências intencionais entre os requisitos originais e a implementação real. Não são defeitos.

### D-03 — API em Python, não em Node.js

O requirements.md original registrava D-03 como "API em Node.js". A decisão foi alterada para Python 3.12 + FastAPI + psycopg 3 (SSOT.md, D-03 Confirmada em 2026-10-16). Todo o módulo de telemetria usa as bibliotecas OTel para Python.

Fontes: `SSOT.md`, `api/requirements.txt`, `api/app/main.py`.

### D-14 — Tracer manual no frontend, sem SDK OTel para web

O requisito 4.10 previa o uso do SDK OTel para web. A implementação usa um tracer manual sem dependências (`frontend/src/api/tracing.js`). A decisão foi registrada como D-14 no SSOT com a justificativa de que o SDK oficial adicionaria peso ao bundle sem resultado diferente.

A propagação W3C `traceparent` está implementada. O `service.name` dos spans JavaScript é `'kiro-browser'` (não `'kiro-frontend'`).

Fontes: `SSOT.md` (D-14), `frontend/src/api/tracing.js`.

### Dois emissores de spans do frontend

O nginx (`frontend/nginx.conf`, `otel_service_name kiro-frontend`) e o código JavaScript (`frontend/src/api/tracing.js`, `service.name = 'kiro-browser'`) emitem spans com `service.name` distintos. Ambos são intencionais: o nginx cria spans de servidor/proxy e o JavaScript cria spans de cliente. O dashboard referencia `kiro-browser` explicitamente no painel "Spans/s por componente" (`kiro-portal.json`, painel id 22).

---

## 8. Limitações aceitas para demo

### L-4 — Storage volátil do Tempo e do Prometheus no Kubernetes

Os Deployments de Tempo e Prometheus usam `emptyDir` para storage (`k8s/observability/tempo.yaml`, `k8s/observability/prometheus.yaml`). Traces e séries métricas são perdidos ao reiniciar os pods. Nenhum PersistentVolumeClaim está configurado. Aceito como limitação de demo.

---

## 9. Lacunas pendentes

### L-6 — Span de erro 5xx marcado como erro (desejável)

**Não verificado.** Requisito desejável, não testado por falta de tempo antes da entrega. A instrumentação automática do FastAPI normalmente marca spans de exceções não tratadas com status de erro, mas isso não foi verificado em execução para respostas 5xx deliberadas.

### L-7 — `db.client.operation.duration` (desejável)

**Não confirmado.** O `PsycopgInstrumentor` foi instrumentado (`api/app/telemetry.py`) e gera spans de banco, mas o histograma `db.client.operation.duration` não foi confirmado em execução. O comando `curl -s localhost:8080/metrics | grep db_client` não retornou nenhuma linha.

---

## 10. Rastreabilidade dos requisitos

| Requisito | Critério | Estado | Evidência |
|---|---|---|---|
| 1.1 | Endpoint `/metrics` exposto | Atendido | `api/app/telemetry.py` (função `setup`) |
| 1.2 | `GET /healthz` retorna 200 | Atendido | `api/app/main.py` |
| 1.3 | `GET /readyz` retorna 200 com banco ok | Atendido | `api/app/main.py` |
| 1.4 | `GET /readyz` retorna 503 sem banco | Atendido | `api/app/main.py` |
| 1.5 | Sem autenticação nos endpoints | Atendido | `api/app/telemetry.py`, `api/app/main.py` |
| 2.1 | `http.server.request.duration` como Histogram (s) | Atendido | `api/app/telemetry.py` (`FastAPIInstrumentor`, `OTEL_SEMCONV_STABILITY_OPT_IN=http`) |
| 2.2 | `http.route` = template (não caminho real) | Atendido | `api/app/telemetry.py` (`FastAPIInstrumentor` lê `request.scope["route"].path`) |
| 2.3 | Nomes das séries conformes ao contrato | Atendido com divergência | Nomes confirmados em execução; painel "Saúde" usa `up{app="api"}` em vez de `up{job=~".*kiro-api.*"}` |
| 2.4 | Série `http_server_request_duration_seconds_count` exposta | Atendido | `api/app/telemetry.py` |
| 2.5 | Sem atributos de alta cardinalidade em métricas | Atendido | `api/app/telemetry.py` (FEATURES fixo), `api/app/main.py` |
| 3.1 | Counter `kiro.link.clicks` a cada 302 | Atendido | `api/app/main.py` (`telemetry.link_clicked()`) |
| 3.2 | Counter `kiro.links.created` com `kind` | Atendido | `api/app/main.py` (`telemetry.link_created(vanity=...)`) |
| 3.3 | Gauge `kiro.active_links` por callback | Atendido | `api/app/telemetry.py`, `api/app/repository.py`, `api/app/schema.sql` |
| 3.4 | Histogram `kiro.link.redirect.duration` com `outcome` | Atendido | `api/app/main.py`, `api/app/telemetry.py` |
| 3.5 | Buckets `[0.005…1.0]` | Atendido | `api/app/telemetry.py` (`ExplicitBucketHistogramAggregation`) |
| 3.6 | Séries de negócio expostas no Prometheus | Atendido | `api/app/telemetry.py` |
| 3 (desejável) | `db.client.operation.duration` | Não confirmado | Ver L-7 |
| 4.1 | Spans de servidor com nomes das rotas | Atendido com divergência | `api/app/telemetry.py` (`FastAPIInstrumentor`); rota canônica é `/r/{short_code}`, não `/{shortCode}` |
| 4.2 | Spans de cliente do banco como filhos | Atendido | `api/app/telemetry.py` (`PsycopgInstrumentor`) |
| 4.3 | `service.name = kiro-api` via env | Atendido | `api/app/telemetry.py`, `k8s/api/configmap.yaml` |
| 4.4 | Exportação OTLP via env | Atendido | `api/app/telemetry.py`, `k8s/api/configmap.yaml` |
| 4.5 | Propagadores via `OTEL_PROPAGATORS` | Atendido | `k8s/api/configmap.yaml` (`tracecontext,baggage`) |
| 4.6 | Sampler via `OTEL_TRACES_SAMPLER` | Atendido | `k8s/api/configmap.yaml` (`parentbased_always_on`) |
| 4.7 | Variáveis OTel em ConfigMap | Atendido | `k8s/api/configmap.yaml` (linhas 24–27), `k8s/api/deployment.yaml` (`envFrom`) |
| 4.8 | `kiro.link.short_code` no span | Atendido | `api/app/telemetry.py` (`tag_short_code`), `api/app/main.py` |
| 4.9 | Continua trace do frontend (`traceparent`) | Atendido | `api/app/telemetry.py` (`FastAPIInstrumentor`, propagação W3C) |
| 4.10 | SDK OTel para web no frontend | Atendido com divergência | Tracer manual sem SDK (`frontend/src/api/tracing.js`); propagação `traceparent` implementada. Ver seção 7. |
| 4.11 | `service.name = kiro-frontend` no frontend | Atendido com divergência | Nginx usa `kiro-frontend`; JS usa `kiro-browser`. Dois emissores intencionais. Ver seção 7. |
| 4.12 | Frontend exporta spans ao Collector via OTLP | Atendido | `frontend/src/api/tracing.js` (`/otlp/v1/traces`), `frontend/nginx.conf` (proxy `/otlp/`) |
| 4 (desejável) | Span 5xx marcado com erro | Não verificado | Ver L-6 |
| 5.1 req/s por rota | Painel presente | Atendido | `kiro-portal.json` painel id 12 |
| 5.1 cliques/min | Painel presente | Atendido com divergência | `kiro-portal.json` painéis id 2, 3, 9 — cliques/s e cliques/h; não cliques/min exatamente |
| 5.1 latência p50/p95/p99 | Painel presente | Atendido | `kiro-portal.json` painel id 10 |
| 5.1 taxa de erros 5xx | Painel presente | Atendido | `kiro-portal.json` painéis id 6, 14 |
| 5.1 respostas por status | Painel presente | Atendido | `kiro-portal.json` painel id 13 |
| 5.1 links ativos | Painel presente | Atendido | `kiro-portal.json` painel id 4 |
| 5.1 links criados por tipo | Painel presente | Atendido | `kiro-portal.json` painel id 18 |
| 5.1 saúde da API | Painel presente | Atendido com divergência | `kiro-portal.json` painel id 7 — usa `up{app="api"}` em vez de `up{job=~".*kiro-api.*"}` |
| 5.2 | Alvo da API como `UP` | Não verificado | Depende de execução no cluster |
| 5.3 | Painel reflete N cliques no próximo ciclo | Não verificado | Depende de execução no cluster |
| 5 (desejável) | Painel "Link do dia" SQL | Atendido | `kiro-portal.json` painel id 20 (datasource Postgres) |
| 6.1 | Collector recebe e encaminha spans ao Tempo | Atendido | `k8s/observability/config/otel-collector.yaml`, `k8s/observability/otel-collector.yaml` |
| 6.2 | Prometheus faz scrape da API | Atendido | `k8s/observability/config/prometheus.yaml`, `k8s/api/deployment.yaml` (anotações) |
| 6.3 | Grafana com Prometheus e Tempo como datasources | Atendido | `k8s/observability/config/grafana-datasources.yaml` |
| 6.4 | Trace com spans de frontend, API e banco | Não verificado | Depende de execução no cluster |
| 6.5 | Collector configurado por manifests, sem credenciais fixas | Atendido | `k8s/observability/otel-collector.yaml` (ConfigMap `otel-collector-config`) |
| 7.1 | Dashboard versionado como JSON | Atendido | `k8s/observability/dashboards/kiro-portal.json` |
| 7.2 | Datasources por arquivos de provisionamento | Atendido | `k8s/observability/config/grafana-datasources.yaml`, `k8s/observability/config/grafana-dashboards.yaml` |
| 7.3 | Dashboard disponível sem configuração manual | Atendido | `k8s/observability/grafana.yaml` (volumes ConfigMap), `docker-compose.yml` |

---

## 11. Estratégia de verificação

1. `curl http://localhost:8080/metrics` deve listar `kiro_link_clicks_total`, `kiro_links_created_total`, `kiro_active_links`, `kiro_link_redirect_duration_seconds_bucket` e `http_server_request_duration_seconds_count`.
2. No Prometheus UI, `{__name__=~"http_server.*"}` deve mostrar as séries HTTP com os rótulos `http_request_method`, `http_route`, `http_response_status_code`.
3. Grafana → Explore → Traces: uma requisição de criação ou redirect deve mostrar o trace com spans de `kiro-browser` → `kiro-frontend` (nginx) → `kiro-api` → psycopg.
4. O alvo `kiro-pods` no Prometheus (`/targets`) deve aparecer como `UP` com `app="api"`.
5. Gerar N redirects e confirmar que `kiro_link_clicks_total` aumentou N no próximo ciclo de scrape.
