Status: Aprovado em 2026-10-18 por Diêgo

# Design — Observabilidade

## 1. Visão geral

```
navegador (kiro-browser) ──traceparent──► nginx (kiro-frontend) ──traceparent──► API (kiro-api) ──► Postgres
     │ OTLP/JSON via /otlp                  │ OTLP gRPC                            │ OTLP HTTP   (span do psycopg)
     └───────────────────────────────► OTel Collector ◄──────────────────────────┘
                                             │
                                             ▼
                                           Tempo ──remote write (span metrics, service graph)──► Prometheus
                                                                                                    ▲
                                                                  scrape /metrics de cada pod da API ┘
                                             Grafana: Prometheus + Tempo + Postgres
```

| Componente | Imagem | Papel |
|---|---|---|
| OTel Collector | `otel/opentelemetry-collector:0.120.0` | Recebe spans e manda para o Tempo |
| Tempo | `grafana/tempo:2.6.1` | Guarda traces e gera span metrics |
| Prometheus | `prom/prometheus:v2.55.1` | Coleta a API e recebe o remote write do Tempo |
| Grafana | `grafana/grafana:11.3.0` | Dashboard e exploração de traces |

Tudo roda no Docker Compose e no Kubernetes com os mesmos arquivos de `k8s/observability/config/`.

## 2. Instrumentação da API

Tudo fica em `api/app/telemetry.py`, chamado uma vez pelo `create_app`. O resto do código só chama funções como `link_clicked()` ou `feature_used("qrcode")`. Assim, se a gente precisar trocar o SDK, mexe num arquivo só.

### Métricas

O `MeterProvider` usa o `PrometheusMetricReader`, e a rota `GET /metrics` devolve o `generate_latest` do `prometheus_client`. Escolhemos expor direto em vez de mandar métricas pelo Collector: é um salto a menos e o Prometheus enxerga cada pod como um alvo.

| Instrumento | Tipo | Atributos | Onde é emitido |
|---|---|---|---|
| `kiro.links.created` | Counter | `kind` | criação do link |
| `kiro.link.clicks` | Counter | — | redirect 302 |
| `kiro.link.redirect.duration` | Histogram (s) | `outcome` | todo redirect com código válido |
| `kiro.feature.used` | Counter | `feature` | stats, ranking e redirect com `?via=qr` |
| `kiro.active_links` | Gauge observável | — | callback a cada coleta |

O gauge chama `repo.count_active()`, que faz `SELECT count(*) FROM active_links` com timeout de 2s e com a instrumentação suspensa, para não gerar um trace a cada scrape.

O histograma do redirect usa buckets explícitos via `ExplicitBucketHistogramAggregation`. A métrica HTTP automática vem do `FastAPIInstrumentor`. Para ela sair com o nome estável `http.server.request.duration`, em segundos, o módulo define `OTEL_SEMCONV_STABILITY_OPT_IN=http` antes de importar as instrumentações.

### Traces

- O `TracerProvider` usa `BatchSpanProcessor` com `OTLPSpanExporter` (HTTP, porta 4318 do Collector). Ele só liga se `OTEL_EXPORTER_OTLP_ENDPOINT` estiver definida.
- O `FastAPIInstrumentor` cria o span de servidor com o template da rota e continua o `traceparent` recebido.
- O `PsycopgInstrumentor` cria os spans do banco como filhos.
- Ficam de fora `/healthz`, `/readyz`, `/metrics` e os spans internos do ASGI (`receive` e `send`). Sem isso, cada trace vinha com vários spans soltos que não diziam nada.
- `tag_short_code` coloca `kiro.link.short_code` no span atual.

No Kubernetes as variáveis `OTEL_*` vêm do ConfigMap `api-config`; no compose, do bloco `environment` do serviço `api`.

## 3. Traces no frontend

### Navegador

`frontend/src/api/tracing.js` tem uma função `tracedFetch` usada pelo `api.js` em todas as chamadas. Para cada uma ela:

1. gera `traceId` e `spanId` com `crypto.getRandomValues`;
2. manda o `traceparent` junto com a requisição;
3. no fim, monta o span em OTLP/JSON (`service.name = kiro-browser`, tipo CLIENT, status de erro se falhar) e envia para `/otlp/v1/traces` com `keepalive`.

Se o envio falhar, nada acontece na página. Em `npm run dev` não existe Collector, então o envio falha em silêncio mesmo.

Optamos por isso em vez do SDK web oficial (D-14) porque o resultado no Tempo é o mesmo e o bundle não cresce.

### nginx

A imagem do frontend usa `nginx:1.27-alpine-otel`, que já traz o `ngx_otel_module`. O `nginx.conf`:

- continua o `traceparent` do navegador (`otel_trace_context propagate`) e cria o span `kiro-frontend`, exportado por gRPC para `otel-collector:4317`;
- desliga o tracing nas rotas que não interessam (`/healthz`, `/otlp/`, `/assets/` e o SPA);
- encaminha `/otlp/` para a porta 4318 do Collector, na mesma origem, sem CORS;
- grava `trace=$otel_trace_id` no log de acesso.

O resultado é um trace com quatro elos: `kiro-browser` → `kiro-frontend` → `kiro-api` → psycopg.

## 4. Infraestrutura

### Collector

Receivers OTLP gRPC (4317) e HTTP (4318), processors `memory_limiter` (200 MiB, pico de 50 MiB) e `batch`, e um único exporter para o Tempo. A extensão `health_check` na porta 13133 serve às probes do Kubernetes.

### Tempo

Modo monolítico, storage local e retenção de 24h. O `metrics_generator` liga `service-graphs`, `span-metrics` e `local-blocks` e faz remote write no Prometheus com exemplares. É de lá que sai o painel de spans por componente.

O mapa de serviços do Tempo não liga nginx e API, porque o nginx só emite spans do tipo SERVER. Por isso o dashboard usa "spans por componente" em vez do service graph.

### Prometheus

No Kubernetes, o job `kiro-pods` usa `kubernetes_sd` (role `pod`, namespace `encurtador`) e só fica com os pods anotados com `prometheus.io/scrape: "true"`. Caminho e porta vêm das anotações, e os labels `app` e `pod` são copiados do pod. Um ServiceAccount com Role e RoleBinding permite listar os pods.

No compose, `prometheus.compose.yaml` tem um alvo fixo em `api:8080` com o mesmo nome de job e o label `app="api"`, para as consultas do dashboard funcionarem nos dois lugares.

O Prometheus sobe com `--web.enable-remote-write-receiver` e `--enable-feature=exemplar-storage`, e guarda 2 dias de dados.

### Grafana

- Fontes de dados provisionadas: Prometheus (`uid: prometheus`, padrão), Tempo (`uid: tempo`, com service map e node graph) e Postgres (`uid: postgres`, lendo as credenciais do Secret `db-credentials`).
- Provider de dashboards lendo `/var/lib/grafana/dashboards`, pasta "Kiro Portal".
- O dashboard `kiro-portal.json` é a home.
- Acesso anônimo como Viewer, para a demo abrir sem login. O admin fica no Secret `grafana-admin`. Para clicar num Trace ID e abrir o trace é preciso entrar como admin.

## 5. Dashboard (`k8s/observability/dashboards/kiro-portal.json`)

| Painel | Tipo | Consulta |
|---|---|---|
| Cliques / s | stat | `rate(kiro_link_clicks_total[1m])` |
| Cliques na última hora | stat | `increase(kiro_link_clicks_total[1h])` |
| Links ativos | stat | `kiro_active_links` |
| Latência p95 do redirect | stat | `histogram_quantile(0.95, ...)` |
| Erros 5xx | stat | 5xx sobre o total, do histograma HTTP |
| Pods da API no ar | stat | `sum(up{app="api"})` |
| Cliques por segundo | série | taxa de `kiro_link_clicks_total` |
| Latência do redirect (p50, p95, p99) | série | `histogram_quantile` sobre os buckets |
| Requisições/s por rota | série | `http_server_request_duration_seconds_count{http_route!=""}` |
| Respostas por status | série | por `http_response_status_code` |
| Taxa de erros 5xx | série | eixo fixo de 0 a 100% |
| Latência HTTP p95 por rota | série | histograma HTTP com `http_route!=""` |
| Resultado dos redirects | série | `_count` por `outcome` |
| Links criados (aleatório x personalizado) | série | por `kind` |
| Uso de features | série | `kiro_feature_used_total` por `feature` |
| Link do dia (24h, direto do Postgres) | tabela | SQL sobre `click_events` |
| Spans/s por componente | série | span metrics do Tempo |
| Traces recentes | tabela | TraceQL `{ resource.service.name =~ "kiro-.*" }` |

Dois ajustes vieram do uso real. O filtro `http_route!=""` entrou porque requisições 404 sem rota reconhecida geravam uma série sem rótulo, que aparecia como "Value" na legenda. Essas requisições continuam contadas em "Respostas por status". Já a saúde da API usa `up{app="api"}`, porque com descoberta por pod o job é `kiro-pods` e quem identifica a API é o label `app`.

## 6. Verificação

1. `curl localhost:8080/metrics` lista `kiro_link_clicks_total`, `kiro_links_created_total`, `kiro_feature_used_total`, `kiro_active_links`, `kiro_link_redirect_duration_seconds_bucket` e `http_server_request_duration_seconds_count`.
2. No Prometheus, `/targets` mostra cada pod da API como `UP` com `app="api"`.
3. Rodando `scripts/gerar-trafego.sh`, os painéis de cliques e latência sobem.
4. Criando um link pelo site, o Explore do Tempo mostra o trace com `kiro-browser`, `kiro-frontend`, `kiro-api` e o span do Postgres.
5. Copiando o `trace=` de uma linha do log do nginx, o Tempo abre o trace correspondente.

Os resultados dessas verificações estão no `docs/validacao-sre.md`.

## 7. Limitações

- Tempo e Prometheus usam `emptyDir` no Kubernetes; traces e métricas somem se o pod reiniciar. Para a demo isso basta.
- `db.client.operation.duration` não apareceu no `/metrics`, embora os spans do banco apareçam.
- Não testamos se um 5xx marca o span da API como erro.
- O painel de erros 5xx mede a API. Um 504 gerado pelo próprio nginx não entra nele.
