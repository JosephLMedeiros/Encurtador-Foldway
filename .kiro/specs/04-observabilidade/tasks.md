Status: Reconciliado com a implementação em 18/10/2026 (escrito após a implementação)

> Tarefas concluídas reconstruídas a partir da implementação; não refletem o histórico real do desenvolvimento.

# Tasks — 04 Observabilidade

---

## Concluídas

### T-01 — Módulo central de telemetria da API
**Arquivo:** `api/app/telemetry.py`

Implementado o módulo que inicializa o `TracerProvider` (OTLP/HTTP), o `MeterProvider` (PrometheusMetricReader) e expõe a interface usada pelo código de negócio (`link_created`, `link_clicked`, `redirect_finished`, `feature_used`, `tag_short_code`, `untraced`, `set_active_links_source`). Chamado uma única vez em `api/app/main.py`.

- [x] `TracerProvider` com `BatchSpanProcessor` + `OTLPSpanExporter`
- [x] `MeterProvider` com `PrometheusMetricReader`
- [x] `OTEL_SEMCONV_STABILITY_OPT_IN=http` forçado antes dos imports de instrumentação
- [x] `FastAPIInstrumentor` instrumentando o app com `excluded_urls` para probes e `/metrics`
- [x] `PsycopgInstrumentor` para spans automáticos do banco

---

### T-02 — Endpoint `GET /metrics`
**Arquivo:** `api/app/telemetry.py` (função `setup`)

A rota `GET /metrics` é registrada em `setup()` usando `prometheus_client.generate_latest(REGISTRY)`. Excluída do schema OpenAPI e das métricas HTTP.

- [x] Endpoint exposto na mesma porta da API (8080)
- [x] Formato de exposição de texto do Prometheus
- [x] Sem autenticação

---

### T-03 — Probes `GET /healthz` e `GET /readyz`
**Arquivo:** `api/app/main.py`

- [x] `/healthz` retorna 200 sem verificar o banco
- [x] `/readyz` retorna 200 quando o banco responde; 503 caso contrário
- [x] Ambas excluídas de spans e métricas HTTP (`EXCLUDED_URLS`)

---

### T-04 — Métricas de negócio: contadores e histograma de redirect
**Arquivo:** `api/app/telemetry.py` (`_setup_providers`), `api/app/main.py` (pontos de emissão)

- [x] `kiro.links.created` (Counter, atributo `kind`)
- [x] `kiro.link.clicks` (Counter, sem atributos)
- [x] `kiro.link.redirect.duration` (Histogram, atributo `outcome`, buckets explícitos `[0.005…1.0]`)
- [x] `kiro.feature.used` (Counter, atributo `feature`, conjunto fixo em `FEATURES`)
- [x] Emissão em `create_link`, `redirect`, `link_stats`, `ranking` em `main.py`

---

### T-05 — Gauge observável `kiro.active_links`
**Arquivos:** `api/app/telemetry.py` (`_observe_active_links`), `api/app/repository.py` (`count_active`), `api/app/schema.sql` (view `active_links`), `api/app/main.py` (`set_active_links_source`)

- [x] Callback registrado no `MeterProvider`
- [x] Executa `SELECT count(*) FROM active_links` via `repo.count_active()`
- [x] Execução dentro de `suppress_instrumentation()` (sem traces de coleta)

---

### T-06 — Atributo de span `kiro.link.short_code`
**Arquivo:** `api/app/telemetry.py` (`tag_short_code`), `api/app/main.py`

- [x] `tag_short_code` chama `trace.get_current_span().set_attribute(...)`
- [x] Chamado em `create_link`, `redirect` e `link_stats`

---

### T-07 — Tracing no frontend: `tracedFetch` com propagação W3C
**Arquivo:** `frontend/src/api/tracing.js`

- [x] Gera `traceId` e `spanId` com `crypto.getRandomValues`
- [x] Injeta cabeçalho `traceparent` em cada chamada `fetch`
- [x] Serializa e envia span em OTLP/JSON para `/otlp/v1/traces` com `keepalive: true`
- [x] `service.name = 'kiro-browser'` (divergência intencional — ver D-14 no SSOT e design.md seção 7)

---

### T-08 — Nginx como elo do trace (módulo `ngx_otel_module`)
**Arquivos:** `frontend/Dockerfile` (imagem `nginx:1.27-alpine-otel`), `frontend/nginx.conf`

- [x] `load_module modules/ngx_otel_module.so`
- [x] `otel_service_name kiro-frontend`
- [x] `otel_exporter { endpoint otel-collector:4317; }`
- [x] `otel_trace_context propagate` (continua o `traceparent` do navegador)
- [x] Rota `/otlp/` encaminha spans do navegador ao Collector (porta 4318)

---

### T-09 — OTel Collector: configuração e manifest Kubernetes
**Arquivos:** `k8s/observability/config/otel-collector.yaml` (config), `k8s/observability/otel-collector.yaml` (manifest)

- [x] Receiver OTLP gRPC (4317) e HTTP (4318)
- [x] `memory_limiter` + `batch`
- [x] Pipeline `traces` → Tempo (OTLP gRPC 4317, insecure)
- [x] Deployment + Service Kubernetes
- [x] Config montada via ConfigMap `otel-collector-config`
- [x] Liveness/readiness probe no endpoint `/` na porta 13133

---

### T-10 — Tempo: configuração e manifest Kubernetes
**Arquivos:** `k8s/observability/config/tempo.yaml`, `k8s/observability/tempo.yaml`

- [x] Modo monolítico, storage local
- [x] Receiver OTLP gRPC na 4317
- [x] Retenção de 24h
- [x] `metrics_generator` com `service-graphs`, `span-metrics`, `local-blocks`
- [x] Remote write para Prometheus com exemplares
- [x] Deployment + Service Kubernetes (portas 3200 e 4317)

---

### T-11 — Prometheus: configuração e manifest Kubernetes
**Arquivos:** `k8s/observability/config/prometheus.yaml` (k8s), `k8s/observability/config/prometheus.compose.yaml` (compose), `k8s/observability/prometheus.yaml`

- [x] Descoberta via `kubernetes_sd` (role `pod`, namespace `encurtador`) com anotações `prometheus.io/*`
- [x] `--web.enable-remote-write-receiver` e `--enable-feature=exemplar-storage`
- [x] ServiceAccount + Role + RoleBinding para listar pods
- [x] Deployment + Service Kubernetes
- [x] Configuração compose com scrape estático em `api:8080`

---

### T-12 — Grafana: datasources, dashboard provider e manifest Kubernetes
**Arquivos:** `k8s/observability/config/grafana-datasources.yaml`, `k8s/observability/config/grafana-dashboards.yaml`, `k8s/observability/grafana.yaml`

- [x] Datasource Prometheus (`uid: prometheus`, padrão)
- [x] Datasource Tempo (`uid: tempo`, service map e node graph habilitados)
- [x] Datasource Postgres (`uid: postgres`, credenciais via Secret `db-credentials`)
- [x] Dashboard provider lendo JSONs de `/var/lib/grafana/dashboards`
- [x] Acesso anônimo (role Viewer) habilitado para demo
- [x] Deployment + Service Kubernetes; volumes via ConfigMaps e emptyDir

---

### T-13 — Dashboard `kiro-portal.json` versionado
**Arquivo:** `k8s/observability/dashboards/kiro-portal.json`

- [x] Dashboard JSON versionado no repositório (18 painéis de dados + rows de agrupamento)
- [x] Definido como home dashboard (`GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH`)
- [x] Carregado automaticamente ao iniciar o Grafana (sem configuração manual)
- [x] Painel "Link do dia" (id 20) via Postgres SQL — requisito desejável atendido
- [x] Painéis extras: "Uso de features", "Traces recentes", "Spans/s por componente", "Latência HTTP p95 por rota", "Resultado dos redirects"

---

### T-15 — ConfigMap de variáveis OTel para o Deployment da API
**Arquivo:** `k8s/api/configmap.yaml`

- [x] ConfigMap `api-config` define `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_PROPAGATORS` e `OTEL_TRACES_SAMPLER` (linhas 24–27)
- [x] Deployment da API referencia o ConfigMap via `envFrom.configMapRef` (`k8s/api/deployment.yaml`)

---

### T-16 — Anotações de scrape no Deployment da API
**Arquivo:** `k8s/api/deployment.yaml`

- [x] Anotações `prometheus.io/scrape: "true"`, `prometheus.io/port: "8080"` e `prometheus.io/path: "/metrics"` presentes (linhas 20–22)

---

## Verificações

### V-17 — Confirmar painéis do dashboard (verificação em execução)

Painéis lidos de `k8s/observability/dashboards/kiro-portal.json` e listados em design.md, seção 5.

**Resultado:** todos os painéis exigidos pelo Requisito 5 estão presentes. Painel "Link do dia" via SQL também confirmado (id 20). A query PromQL de "saúde da API" usa `up{app="api"}` em vez de `up{job=~".*kiro-api.*"}` — divergência registrada em requirements.md e design.md. A verificação de que os painéis mostram dados corretos em execução não foi realizada.

---

### V-18 — Span de erro 5xx marcado como erro

**Resultado: não verificado.** Requisito desejável, não testado por falta de tempo antes da entrega.

---

### V-19 — Emissão de `db.client.operation.duration`

**Resultado: não confirmado.** O comando `curl -s localhost:8080/metrics | grep db_client` não retornou nenhuma linha. O `PsycopgInstrumentor` gera spans do banco, mas a emissão do histograma não foi confirmada.
