# Contrato de métricas e traces — Foldway

Status: Em revisão (v3)

Este é o contrato de telemetria entre a API, o frontend, a infraestrutura e o dashboard. A API, o nginx e o navegador emitem; o Prometheus, o Tempo e o Grafana consomem. Se for mudar um nome aqui, mude junto o teste `api/tests/test_telemetry.py` e o dashboard `k8s/observability/dashboards/kiro-portal.json`.

Histórico: a v1 foi um rascunho gerado com o Gemini. Na v2 a Abby revisou (histograma HTTP no lugar do `http_requests_total`, buckets em segundos, view `active_links`). A v3 alinha o contrato ao que foi implementado: rota `/r/{short_code}`, o serviço `kiro-browser`, a métrica de features e as consultas que o dashboard usa.

## 1. Convenções

- Os instrumentos do OpenTelemetry usam ponto (`kiro.link.clicks`). No Prometheus os pontos viram `_`, Counters ganham `_total` e a unidade `s` vira `_seconds`. As tabelas mostram os dois nomes. Os nomes abaixo foram conferidos no `/metrics` da API.
- Métricas de negócio começam com `kiro_`.
- **Cardinalidade:** rótulo de métrica só pode ter valores de um conjunto pequeno e fixo. É proibido usar como rótulo o `short_code`, o `custom_code`, a URL original, o IP ou o user agent. Esses valores podem ir para spans, nunca para métricas.
- `http.route` tem o template da rota (`/r/{short_code}`), nunca o caminho real (`/r/abc123`).

## 2. Métricas

| Nome OTel | Nome no Prometheus | Tipo | Atributos | Origem |
|---|---|---|---|---|
| `http.server.request.duration` | `http_server_request_duration_seconds` | Histogram (s) | `http.request.method`, `http.route`, `http.response.status_code` | Automática (instrumentação do FastAPI). O total de requisições é o `_count` deste histograma |
| `kiro.link.redirect.duration` | `kiro_link_redirect_duration_seconds` | Histogram (s) | `outcome`: `found`, `not_found`, `expired` | Manual. Mede a consulta no banco e a decisão do redirect |
| `kiro.link.clicks` | `kiro_link_clicks_total` | Counter | — | Manual. +1 a cada redirect 302 |
| `kiro.links.created` | `kiro_links_created_total` | Counter | `kind`: `random`, `vanity` | Manual. +1 a cada link criado (201) |
| `kiro.active_links` | `kiro_active_links` | Gauge observável | — | Manual. Callback com `SELECT count(*) FROM active_links` a cada coleta |
| `kiro.feature.used` | `kiro_feature_used_total` | Counter | `feature`: `stats`, `ranking`, `qrcode` | Manual. +1 a cada uso de uma feature. `qrcode` é o redirect com `?via=qr`. Os valores aceitos ficam em `FEATURES`, em `api/app/telemetry.py` |

Desejável: `db.client.operation.duration` (Histogram, s) com `db.operation.name`, vindo da instrumentação do psycopg. Até agora ela não apareceu no `/metrics`.

**Buckets do redirect:** `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0]`. Os buckets padrão do SDK são pensados para milissegundos e jogariam tudo no primeiro bucket quando a unidade é segundo, por isso são configurados à mão.

**Nome estável da métrica HTTP:** a API define `OTEL_SEMCONV_STABILITY_OPT_IN=http` antes de carregar as instrumentações. Sem isso sai o nome antigo, `http.server.duration`, em milissegundos.

### Link ativo

```sql
expires_at IS NULL OR expires_at > now()
```

A regra fica num lugar só: a view `active_links` do `api/app/schema.sql`. O gauge, o redirect e qualquer painel SQL usam a view.

### Erros

Não existe métrica separada de erro. A taxa de erro de servidor é 5xx sobre o total, tirada do histograma HTTP. 4xx (400, 404, 409, 410) é erro do cliente e aparece separado em "Respostas por status".

## 3. Traces

- **Propagação:** W3C Trace Context (`traceparent`, `tracestate`), com `OTEL_PROPAGATORS=tracecontext,baggage`.
- **Caminho de uma requisição feita pelo site:**

  ```
  kiro-browser (span CLIENT do fetch)
    → kiro-frontend (span do nginx)
      → kiro-api (span SERVER da rota)
        → span CLIENT do Postgres (criado pelo psycopg dentro da API)
  ```

  O Postgres não propaga `traceparent`; o span do banco nasce dentro da API.
- **Nomes de serviço:** `kiro-browser` (navegador), `kiro-frontend` (nginx) e `kiro-api`.
- **Nomes dos spans de servidor da API:** método mais template da rota. Exemplos: `POST /api/links`, `GET /api/links`, `GET /r/{short_code}`.
- **Atributo de span:** `kiro.link.short_code`, nos spans de criação, redirect e stats.
- **Amostragem:** `parentbased_always_on` (100%; o volume do hackathon permite).
- **Fora dos traces:** `/healthz`, `/readyz`, `/metrics`, os spans internos do ASGI e, no nginx, `/healthz`, `/otlp/`, `/assets/` e as páginas do SPA.

### Configuração da API

Sempre por variável de ambiente (ConfigMap `api-config` no Kubernetes, `environment` no compose):

| Variável | Valor |
|---|---|
| `OTEL_SERVICE_NAME` | `kiro-api` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://otel-collector:4318` |
| `OTEL_PROPAGATORS` | `tracecontext,baggage` |
| `OTEL_TRACES_SAMPLER` | `parentbased_always_on` |

## 4. Quem emite o quê

**API** (`api/app/telemetry.py`)
- Expõe `GET /metrics` no formato do Prometheus, além de `GET /healthz` e `GET /readyz` (detalhes no `openapi.yaml`).
- Exporta spans por OTLP/HTTP para o Collector.
- O resto do código só chama as funções do módulo (`link_created`, `link_clicked`, `redirect_finished`, `feature_used`, `tag_short_code`).

**nginx do frontend** (`frontend/nginx.conf`)
- Continua o `traceparent` do navegador, cria o span `kiro-frontend` e exporta por OTLP/gRPC para `otel-collector:4317`.
- Faz proxy de `/api` e `/r` para a API na mesma origem, sem CORS.
- Encaminha `/otlp/` para a porta 4318 do Collector, para os spans do navegador chegarem.
- Grava `trace=<trace_id>` no log de acesso.

**Navegador** (`frontend/src/api/tracing.js`)
- Gera `traceparent` em toda chamada à API e manda o span `kiro-browser` em OTLP/JSON para `/otlp/v1/traces`. Não usa o SDK web do OpenTelemetry (D-14): o resultado no Tempo é o mesmo, sem peso no bundle.

**Infraestrutura** (`k8s/`)
- Variáveis `OTEL_*` no ConfigMap da API e anotações `prometheus.io/scrape`, `port` e `path` no Deployment.
- Collector, Tempo, Prometheus e Grafana em `k8s/observability/`, aplicados pelo ArgoCD.

## 5. Dashboard e consultas

O Prometheus descobre cada pod da API como um alvo do job `kiro-pods`, com o label `app="api"`. No compose o alvo é fixo, mas com o mesmo job e labels, então as consultas valem nos dois.

| Painel | Consulta |
|---|---|
| Cliques / s | `sum(rate(kiro_link_clicks_total[1m]))` |
| Cliques na última hora | `round(sum(increase(kiro_link_clicks_total[1h])))` |
| Latência p50 / p95 / p99 do redirect | `histogram_quantile(0.95, sum by (le) (rate(kiro_link_redirect_duration_seconds_bucket[5m])))` (trocando 0.95 por 0.5 e 0.99) |
| Taxa de erros 5xx | `sum(rate(http_server_request_duration_seconds_count{http_response_status_code=~"5.."}[5m])) / sum(rate(http_server_request_duration_seconds_count[5m]))` |
| Respostas por status | `sum by (http_response_status_code) (rate(http_server_request_duration_seconds_count[1m]))` |
| Requisições/s por rota | `sum by (http_route) (rate(http_server_request_duration_seconds_count{http_route!=""}[1m]))` |
| Latência HTTP p95 por rota | `histogram_quantile(0.95, sum by (le, http_route) (rate(http_server_request_duration_seconds_bucket{http_route!=""}[5m])))` |
| Resultado dos redirects | `sum by (outcome) (rate(kiro_link_redirect_duration_seconds_count[1m]))` |
| Links ativos | `max(kiro_active_links)` |
| Links criados (aleatório x personalizado) | `sum by (kind) (increase(kiro_links_created_total[5m]))` |
| Uso de features | `sum by (feature) (rate(kiro_feature_used_total[5m]))` |
| Pods da API no ar | `sum(up{app="api"})` |
| Spans/s por componente | `sum by (service) (rate(traces_spanmetrics_calls_total{span_kind="SPAN_KIND_SERVER"}[1m]))`, mais `kiro-browser` e os spans do banco |

O filtro `http_route!=""` existe porque requisições 404 sem rota reconhecida geram uma série sem esse rótulo. Ela continua contada em "Respostas por status".

O "Link do dia" não sai do Prometheus (seria alta cardinalidade). Ele vem do Postgres, por SQL sobre `click_events`, usando a fonte de dados Postgres do Grafana. A lista de traces recentes vem do Tempo, com TraceQL `{ resource.service.name =~ "kiro-.*" }`.

## 6. Como verificar

1. `curl localhost:8080/metrics` lista as métricas da seção 2.
2. No Prometheus (`/targets`), cada pod da API aparece `UP` no job `kiro-pods`.
3. Com `scripts/gerar-trafego.sh` rodando, as consultas da seção 5 sobem.
4. No Grafana (Explore → Tempo), criar um link pelo site gera um trace com `kiro-browser`, `kiro-frontend`, `kiro-api` e o span do Postgres.
5. O `trace=` de uma linha do log do nginx abre o mesmo trace no Tempo.

## 7. Pendências

- Aprovação deste contrato pelo grupo.
- Descobrir por que `db.client.operation.duration` não aparece.
- Confirmar que um 5xx marca o span da API como erro.
