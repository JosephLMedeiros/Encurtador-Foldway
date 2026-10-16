# Especificação de Métricas e Observabilidade — Kiro Portal

Status: Rascunho (v2 — revisão de Abby/SRE sobre o rascunho gerado pelo Gemini; aguardando ciência do grupo)

Este documento é o contrato de telemetria entre API, frontend, infraestrutura e o dashboard. A API e o frontend emitem; o Prometheus, o Tempo e o Grafana consomem.

## 1. Convenções

- Os instrumentos OpenTelemetry usam nomes com ponto (`kiro.link.clicks`). Ao exportar para o Prometheus, os pontos viram `_`, Counters ganham `_total` e a unidade `s` vira `_seconds`. As tabelas abaixo mostram os dois nomes. **Confirmar os nomes finais em `/metrics` assim que a API existir.**
- Métricas de negócio usam o prefixo `kiro_`.
- **Regra de cardinalidade:** atributos de métricas só podem ter valores de um conjunto pequeno e fixo. É **proibido** usar como atributo de métrica: `short_code`, `custom_code`, URL original, IP, user agent. Esses valores podem aparecer em **spans** (traces), nunca em métricas.
- `http.route` deve conter o **template da rota** (`/{shortCode}`), nunca o caminho real (`/abc123`).

## 2. Métricas

| Nome OTel | Nome no Prometheus | Tipo | Atributos | Origem |
|---|---|---|---|---|
| `http.server.request.duration` | `http_server_request_duration_seconds` | Histogram (s) | `http.request.method`, `http.route`, `http.response.status_code` | Automática (instrumentação HTTP). Substitui o `http_requests_total` do rascunho: o total de requisições é o `_count` deste histograma. |
| `kiro.link.redirect.duration` | `kiro_link_redirect_duration_seconds` | Histogram (s) | `outcome`: `found` \| `not_found` \| `expired` | Manual. Mede a busca no banco + decisão de redirect. |
| `kiro.link.clicks` | `kiro_link_clicks_total` | Counter | nenhum | Manual. +1 a cada redirect bem-sucedido (302). |
| `kiro.links.created` | `kiro_links_created_total` | Counter | `kind`: `random` \| `vanity` | Manual. +1 a cada link criado (201). |
| `kiro.active_links` | `kiro_active_links` | Gauge (observável) | nenhum | Manual. Callback que executa `SELECT count(*) FROM active_links;` a cada coleta. |
| `kiro.feature.used` | `kiro_feature_used_total` | Counter | `feature`: valor fixo cadastrado em `api/app/telemetry.py` (`FEATURES`) | Manual. +1 a cada uso de uma feature do portal (`stats`, `ranking`, e as features exclusivas que vierem). |

Desejável (se a instrumentação do driver do banco oferecer): `db.client.operation.duration` (Histogram, s), com `db.operation.name`.

**Buckets de `kiro_link_redirect_duration_seconds`:** `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0]`. Os buckets padrão do OpenTelemetry são pensados para milissegundos e deixariam tudo no primeiro bucket quando a unidade é segundos, então precisam ser configurados explicitamente (View) no SDK.

**Libs mais antigas:** algumas instrumentações HTTP ainda emitem os nomes legados (`http.server.duration`, em ms). Defina `OTEL_SEMCONV_STABILITY_OPT_IN=http` para obter os nomes estáveis acima.

### Definição de "link ativo"

Um link está ativo quando nunca expira ou ainda não expirou:

```sql
expires_at IS NULL OR expires_at > now()
```

Essa regra fica em um único lugar: a view `active_links` do `schema.sql`. A API (gauge e decisão de redirecionar) e qualquer painel SQL devem usá-la.

### Erros

Não há métrica separada de erros. Taxa de erro de **servidor** = respostas `5xx` / total, calculada a partir do histograma HTTP. Respostas `4xx` (400, 404, 409) são erros do cliente e aparecem separadas no dashboard.

## 3. Traces distribuídos

- **Propagação:** W3C Trace Context (`traceparent`, `tracestate`). `OTEL_PROPAGATORS=tracecontext,baggage`.
- **Cadeia esperada em uma requisição:** span do navegador (fetch) → span de servidor da API → span de cliente do banco. O PostgreSQL **não** propaga o `traceparent`: o span do banco é criado pela instrumentação do driver dentro da API (`db.system.name=postgresql`).
- **Nomes de serviço (`service.name`):** `kiro-frontend`, `kiro-api`.
- **Nomes dos spans de servidor:** `POST /api/links`, `GET /{shortCode}`, `GET /api/links`.
- **Atributos de span permitidos:** `kiro.link.short_code` (alta cardinalidade é aceitável em traces).
- **Amostragem:** `OTEL_TRACES_SAMPLER=parentbased_always_on` (100%; o volume do hackathon permite).
- **Exportação:** OTLP para o OTel Collector, que encaminha ao backend de traces. Configuração via variáveis de ambiente (ConfigMap), nunca fixa no código:

| Variável | Valor |
|---|---|
| `OTEL_SERVICE_NAME` | `kiro-api` (ou `kiro-frontend`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | endereço do Collector (definido pela infraestrutura) |
| `OTEL_PROPAGATORS` | `tracecontext,baggage` |
| `OTEL_TRACES_SAMPLER` | `parentbased_always_on` |

## 4. Requisitos para os demais componentes

**API (Lucas)**
- Expor `GET /metrics` (formato Prometheus), `GET /healthz` (processo vivo) e `GET /readyz` (200 somente se o banco responder). Detalhes em `openapi-sugestoes.yaml`.
- Garantir que `http.route` seja o template da rota (a maioria dos frameworks expõe isso; confirmar).
- Códigos de status: URL inválida `400`, `custom_code` já em uso `409`, link inexistente `404`, link expirado `410` (sugestão).
- A Abby entrega um módulo único de telemetria (linguagem depende da decisão D-03), chamado uma vez na inicialização. O Lucas só precisa chamá-lo e incrementar os contadores nos pontos de criação e redirect.

**Frontend**
- Usar o SDK OpenTelemetry para web com instrumentação de `fetch`, propagando `traceparent` nas chamadas à API.
- Preferência: o nginx do frontend serve `/api` por proxy (mesma origem), o que dispensa CORS. Se a API ficar em outra origem, o CORS deve permitir os headers `traceparent` e `tracestate`.
- Os spans do navegador precisam chegar ao Collector: o mesmo nginx pode fazer proxy de `/otlp` para ele.

**Infraestrutura (Diogo)**
- Variáveis `OTEL_*` da seção 3 em ConfigMap.
- Implantar a stack de observabilidade (coleta de métricas, Collector, backend de traces, Grafana) via ArgoCD. Os values serão fornecidos por Abby, sujeitos à decisão D-09.

## 5. Painéis do dashboard e consultas

Os rótulos abaixo seguem a conversão OTel → Prometheus esperada (`http_route`, `http_response_status_code`). Confirmar no Prometheus com `{__name__=~"http_server.*"}`.

| Painel | Consulta PromQL |
|---|---|
| Requisições por segundo, por rota | `sum by (http_route) (rate(http_server_request_duration_seconds_count[1m]))` |
| Cliques por minuto | `sum(increase(kiro_link_clicks_total[1m]))` |
| Latência p50 / p95 / p99 do redirect | `histogram_quantile(0.95, sum by (le) (rate(kiro_link_redirect_duration_seconds_bucket[5m])))` (trocar 0.95 por 0.50 e 0.99) |
| Taxa de erros 5xx | `sum(rate(http_server_request_duration_seconds_count{http_response_status_code=~"5.."}[5m])) / sum(rate(http_server_request_duration_seconds_count[5m]))` |
| Respostas por status | `sum by (http_response_status_code) (rate(http_server_request_duration_seconds_count[5m]))` |
| Links ativos | `kiro_active_links` |
| Links criados (aleatório vs personalizado) | `sum by (kind) (increase(kiro_links_created_total[1h]))` |
| Saúde da API | `up{job=~".*kiro-api.*"}` |

Ranking por link ("link do dia") **não** sai do Prometheus (seria alta cardinalidade). Ele deve vir do Postgres (`click_events` / coluna `clicks`) por uma fonte de dados SQL no Grafana.

## 6. Como verificar

1. `curl <api>/metrics` lista as métricas da seção 2.
2. No Prometheus, o alvo da API aparece como `UP`.
3. Gerando tráfego (loop de cliques), as consultas da seção 5 retornam valores crescentes.
4. No Grafana (Explore → traces), uma requisição de criação ou clique mostra um trace com os spans de frontend, API e banco.

## 7. Pendências

- D-03 (linguagem da API): define a biblioteca do módulo de telemetria.
- D-09 (ferramentas de observabilidade): proposta de stack será apresentada no `design.md` da spec de observabilidade.
- Confirmar nomes finais das métricas e dos rótulos em `/metrics` após a primeira integração real.
