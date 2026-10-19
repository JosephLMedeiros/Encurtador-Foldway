Status: Reconciliado com a implementação em 18/10/2026 (escrito após a implementação)

# Requirements Document

## Introduction

Esta especificação define os requisitos de observabilidade do encurtador de links, cobrindo os requisitos obrigatórios do hackathon R-08 (OpenTelemetry com traces distribuídos) e R-09 (dashboards Grafana com métricas de cliques, latência, erros e saúde).

O contrato de telemetria em `docs/otel-metrics-spec.md` é a referência para métricas, nomes de instrumentos, atributos permitidos e consultas PromQL. Ver seção "Decisões resolvidas" (A-7) para o estado de aprovação desse contrato.

**Notação dos critérios de aceitação:** `QUANDO <evento>, <componente> DEVE <resposta>`; `SE <condição indesejada>, ENTÃO <componente> DEVE <resposta>`; `<componente> DEVE <comportamento>` para regras que valem sempre.

**Decisões confirmadas relevantes:**
- **D-03:** a API é desenvolvida em Python 3.12 com FastAPI e psycopg 3. (Substituiu a decisão anterior de Node.js — ver seção "Decisões resolvidas".)
- **D-09:** a stack de observabilidade é composta por OpenTelemetry Collector (OTLP), Grafana Tempo (traces), Prometheus (métricas) e Grafana (dashboards). A alternativa Jaeger foi descartada.

## Glossary

- **API:** componente Python/FastAPI responsável pelo encurtamento de URLs, redirecionamento e exposição dos endpoints de saúde e de métricas. (Nota: o documento original dizia Node.js; a implementação é Python — ver seção "Decisões resolvidas", D-03.)
- **Frontend:** interface web em React 19 + Vite responsável pela criação e listagem de links.
- **OTel Collector:** serviço OpenTelemetry Collector que recebe traces via OTLP, enviados pela API e pelo Frontend, e os encaminha ao Tempo. As métricas não passam por ele: o Prometheus as coleta diretamente da API.
- **Prometheus:** backend de armazenamento e consulta de métricas, que coleta periodicamente (scrape) o endpoint de métricas da API.
- **Tempo:** backend de armazenamento e consulta de traces distribuídos.
- **Grafana:** plataforma de dashboards que consome dados do Prometheus, do Tempo e do PostgreSQL.
- **Span:** unidade de trabalho rastreada pelo OpenTelemetry, representando uma operação dentro de uma requisição.
- **Trace:** conjunto de spans correlacionados que representam o caminho completo de uma requisição.
- **W3C Trace Context:** padrão de propagação de contexto de trace via cabeçalhos HTTP `traceparent` e `tracestate`.
- **Instrumento OTel:** tipo de medição do OpenTelemetry: Counter (contagem acumulada), Histogram (distribuição de valores) ou Gauge observável (valor corrente medido por callback).
- **Template de rota:** padrão parametrizado da URL, como `/r/{short_code}`, em oposição ao caminho real, como `/r/abc123`.
- **Link ativo:** link cujo campo `expires_at` é nulo ou ainda não chegou. Definição canônica: `expires_at IS NULL OR expires_at > now()`.
- **View `active_links`:** view do banco de dados que filtra os links ativos conforme a definição acima. Implementada em `api/app/schema.sql`.
- **SEMCONV:** convenções semânticas do OpenTelemetry para nomes de atributos e instrumentos.
- **`http.route`:** atributo SEMCONV que identifica o template da rota HTTP, nunca o caminho real.
- **`service.name`:** atributo de recurso OTel que identifica o serviço emissor. Valores definidos: `kiro-api` (API), `kiro-frontend` (nginx), `kiro-browser` (spans do navegador JavaScript). (Nota: o documento original listava apenas `kiro-api` e `kiro-frontend`; `kiro-browser` foi adicionado para refletir a implementação — ver divergência em 4.11.)
- **ConfigMap:** recurso Kubernetes usado para fornecer variáveis de ambiente de configuração aos contêineres sem embutir valores no código. As variáveis OTel da API estão em `k8s/api/configmap.yaml`.

## Requirements

### Requisito 1 — Endpoints de métricas e de saúde da API

**História de usuário:** como operador de infraestrutura, quero que a API exponha um endpoint de métricas e probes de saúde, para que o Prometheus possa coletar métricas e o Kubernetes possa verificar o estado dos pods.

#### Critérios de aceitação

1. A API DEVE expor um endpoint de métricas no formato de exposição de texto do Prometheus, acessível ao Prometheus. A porta e a rota ficam para o design.
2. A API DEVE expor o endpoint `GET /healthz`, que retorna HTTP 200 enquanto o processo está em execução, independentemente do estado do banco de dados.
3. QUANDO o banco de dados estiver acessível, a API DEVE retornar HTTP 200 em `GET /readyz`.
4. SE o banco de dados não estiver acessível, ENTÃO a API DEVE retornar HTTP 503 em `GET /readyz`.
5. A API DEVE responder ao endpoint de métricas e aos endpoints `GET /healthz` e `GET /readyz` sem exigir autenticação.

### Requisito 2 — Métricas HTTP automáticas

**História de usuário:** como engenheiro de SRE, quero que a API emita métricas de duração das requisições HTTP de forma automática, para calcular taxa de requisições, latência e taxa de erros sem instrumentação manual em cada rota.

#### Critérios de aceitação

1. A API DEVE emitir o instrumento `http.server.request.duration` como Histogram em segundos, com os atributos `http.request.method`, `http.route` e `http.response.status_code`.
2. A API DEVE usar como valor do atributo `http.route` o template da rota (por exemplo, `/r/{short_code}`), nunca o caminho real da requisição (por exemplo, `/r/abc123`).

   > **Divergência (2.2):** a rota canônica do redirect é `/r/{short_code}` (`api/app/main.py`). A rota `/{short_code}` também é aceita por compatibilidade, mas não está no schema OpenAPI. O documento original exemplificava `/{shortCode}`, que era o template esperado antes da decisão D-06.

3. Os nomes e rótulos finais das séries HTTP expostas DEVEM corresponder ao contrato de telemetria. SE houver divergência, ENTÃO ela DEVE ser registrada e o contrato atualizado antes da construção dos painéis.

   > **Nota (A-5 resolvida):** nomes confirmados em execução: série `http_server_request_duration_seconds_count` com rótulos `http_request_method`, `http_route` e `http_response_status_code`.

4. QUANDO o Prometheus coletar as métricas da API, a API DEVE expor a série `http_server_request_duration_seconds_count` com os rótulos `http_request_method`, `http_route` e `http_response_status_code`.
5. A API NÃO DEVE usar como atributo de métrica valores de alta cardinalidade, incluindo `short_code`, `custom_code`, URL original, endereço IP ou `user-agent`.

### Requisito 3 — Métricas de negócio

**História de usuário:** como engenheiro de produto, quero métricas que reflitam o comportamento do negócio (cliques, criações e links disponíveis), para que os dashboards mostrem a utilização real do serviço.

#### Critérios de aceitação

1. QUANDO ocorrer um redirect bem-sucedido (resposta HTTP 302), a API DEVE incrementar em 1 o Counter `kiro.link.clicks`, sem atributos adicionais.
2. QUANDO um link for criado com sucesso (resposta HTTP 201), a API DEVE incrementar em 1 o Counter `kiro.links.created`, com o atributo `kind` igual a `random` para códigos gerados automaticamente ou `vanity` para códigos personalizados.
3. A API DEVE emitir o Gauge observável `kiro.active_links` com o resultado de uma contagem sobre a view `active_links` do banco de dados, executada a cada ciclo de coleta.
4. A API DEVE emitir o Histogram `kiro.link.redirect.duration` em segundos, medindo o tempo entre o recebimento da requisição de redirect e a decisão de resposta (incluindo a consulta ao banco), com o atributo `outcome` igual a `found`, `not_found` ou `expired`.
5. A API DEVE expor o Histogram `kiro.link.redirect.duration` com os limites de bucket `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0]`.
6. QUANDO o Prometheus coletar as métricas da API, a API DEVE expor as séries `kiro_link_clicks_total`, `kiro_links_created_total`, `kiro_active_links` e `kiro_link_redirect_duration_seconds_bucket`.

#### Requisito desejável (não obrigatório)

- SE o driver do banco de dados oferecer instrumentação automática compatível com OpenTelemetry, ENTÃO a API DEVE emitir o Histogram `db.client.operation.duration` em segundos, com o atributo `db.operation.name`.

  > **Não confirmado:** `PsycopgInstrumentor` foi instrumentado (`api/app/telemetry.py`), mas a emissão do histograma `db.client.operation.duration` não foi confirmada em execução. Ver design.md, L-7.

### Requisito 4 — Traces distribuídos

**História de usuário:** como engenheiro de SRE, quero que as requisições gerem traces que atravessem o frontend, a API e o banco de dados, para diagnosticar latências e erros no caminho completo de uma requisição.

#### Critérios de aceitação

1. A API DEVE criar um span de servidor para cada requisição recebida, com os nomes `POST /api/links`, `GET /{shortCode}` e `GET /api/links`, conforme a rota atendida.

   > **Divergência (4.1):** a rota do redirect é `/r/{short_code}` (`api/app/main.py`); `/{short_code}` é aceita por compatibilidade. O span gerado pela instrumentação do FastAPI usará o template registrado na rota, que é `/r/{short_code}`.

2. A API DEVE criar spans de cliente do banco de dados como filhos do span de servidor correspondente, usando a instrumentação automática do driver do banco.
3. A API DEVE atribuir o nome de serviço `kiro-api` ao recurso OTel, configurado pela variável de ambiente `OTEL_SERVICE_NAME`.
4. A API DEVE exportar spans via OTLP para o endereço configurado na variável de ambiente `OTEL_EXPORTER_OTLP_ENDPOINT`, sem endereço fixo no código.
5. A API DEVE usar os propagadores `tracecontext,baggage`, configurados pela variável de ambiente `OTEL_PROPAGATORS`.
6. A API DEVE usar o sampler `parentbased_always_on`, configurado pela variável de ambiente `OTEL_TRACES_SAMPLER`.
7. A API DEVE ler as variáveis de ambiente OTel de um ConfigMap do Kubernetes, sem valores fixos no código ou nas imagens de contêiner.
8. QUANDO o atributo `kiro.link.short_code` for relevante para a operação, a API DEVE adicioná-lo ao span correspondente.
9. QUANDO o Frontend enviar uma requisição com o cabeçalho `traceparent`, a API DEVE continuar o trace recebido, em vez de iniciar um trace independente.
10. O Frontend DEVE instrumentar as chamadas `fetch` à API com o SDK OpenTelemetry para web, propagando os cabeçalhos `traceparent` e `tracestate`.

    > **Divergência (4.10):** o frontend usa um tracer manual sem dependências de SDK (`frontend/src/api/tracing.js`), não o SDK OTel para web. A propagação W3C `traceparent` está implementada. A escolha foi registrada como D-14 no SSOT.

11. O Frontend DEVE atribuir o nome de serviço `kiro-frontend` ao recurso OTel.

    > **Divergência (4.11):** há dois emissores de spans do lado do frontend. O nginx (`frontend/nginx.conf`) usa `otel_service_name kiro-frontend` via `ngx_otel_module`. O código JavaScript (`frontend/src/api/tracing.js`) usa `service.name = 'kiro-browser'`. Ambos são intencionais (ver D-14 no SSOT e design.md, seção "Divergências de projeto"). O Glossário lista os dois valores.

12. O Frontend DEVE exportar spans ao OTel Collector via OTLP.

#### Requisito desejável (não obrigatório)

- QUANDO a API responder com status 5xx, ela DEVE marcar o span de servidor correspondente com status de erro.

  > **Não verificado:** requisito desejável, não testado por falta de tempo antes da entrega. Ver design.md, L-6.

### Requisito 5 — Dashboard Grafana

**História de usuário:** como engenheiro de SRE ou membro da equipe, quero um dashboard no Grafana com painéis que cubram os requisitos do hackathon, para visualizar o funcionamento da aplicação durante a demonstração e no dia a dia.

#### Critérios de aceitação

1. O Grafana DEVE disponibilizar um dashboard com os seguintes painéis, todos alimentados pelo Prometheus:
   - **Requisições por segundo por rota:** `sum by (http_route) (rate(http_server_request_duration_seconds_count[1m]))`.
   - **Cliques por minuto:** `sum(increase(kiro_link_clicks_total[1m]))`.

     > **Divergência (5.1 — cliques):** o dashboard (`k8s/observability/dashboards/kiro-portal.json`) implementa dois painéis de cliques: "Cliques / s" (stat, `rate([1m])`) e "Cliques na última hora" (stat, `increase([1h])`), além de "Cliques por segundo" (timeseries). O painel de "cliques por minuto" do contrato foi substituído por cliques por segundo e cliques na última hora. Motivo não registrado.

   - **Latência p50, p95 e p99 do redirect:** `histogram_quantile` sobre `kiro_link_redirect_duration_seconds_bucket`.
   - **Taxa de erros de servidor (5xx):** proporção de respostas com `http_response_status_code` correspondendo a `5..` sobre o total, derivada do histograma HTTP.
   - **Respostas por código de status:** respostas agrupadas por `http_response_status_code`.
   - **Links ativos:** valor corrente de `kiro_active_links`.
   - **Links criados por tipo:** distribuição entre `kind="random"` e `kind="vanity"` de `kiro_links_created_total`.
   - **Saúde da API:** estado do alvo no Prometheus.

     > **Divergência (5.1 — saúde):** a query do critério original era `up{job=~".*kiro-api.*"}`. O dashboard usa `sum(up{app="api"})` porque a configuração Kubernetes (`k8s/observability/config/prometheus.yaml`) usa `kubernetes_sd` com job `kiro-pods` e rótulo `app` derivado do label do pod. O título do painel é "Pods da API no ar". Motivo: o job `kiro-pods` agrupa todos os pods do namespace; o rótulo `app="api"` identifica os pods da API.

2. QUANDO o Prometheus coletar as métricas da API com sucesso, o alvo da API DEVE aparecer com estado `UP`.
3. QUANDO N redirects bem-sucedidos forem realizados, o painel de cliques DEVE refletir, após o próximo ciclo de coleta, um aumento de N em `kiro_link_clicks_total` (consulta `increase`).

#### Painel desejável (não obrigatório)

- SE uma fonte de dados SQL estiver configurada no Grafana apontando para o banco de dados, ENTÃO o Grafana DEVE exibir um painel de ranking dos links mais acessados ("link do dia"), com base na tabela `click_events`. Esse painel não pode ser feito pelo Prometheus, porque exigiria o `short_code` como atributo de métrica (alta cardinalidade).

  > **Implementado:** o painel "Link do dia (24h, direto do Postgres)" está presente em `k8s/observability/dashboards/kiro-portal.json` (painel id 20), usando o datasource `postgres` com query SQL sobre `click_events`.

### Requisito 6 — Coleta e roteamento de telemetria

**História de usuário:** como engenheiro de infraestrutura, quero que a stack de observabilidade colete, armazene e disponibilize os sinais de telemetria da aplicação, para que os dashboards e a exploração de traces funcionem.

#### Critérios de aceitação

1. O OTel Collector DEVE receber spans via OTLP, enviados pela API e pelo Frontend, e encaminhá-los ao Tempo.
2. O Prometheus DEVE coletar periodicamente o endpoint de métricas da API e armazenar as séries de tempo resultantes.
3. O Grafana DEVE estar configurado com o Prometheus como fonte de dados de métricas e o Tempo como fonte de dados de traces.
4. QUANDO uma requisição de criação de link ou de redirect for realizada, o Tempo DEVE conter um trace com spans do Frontend, da API e do banco de dados, correlacionados pelo mesmo `trace-id`.
5. O OTel Collector DEVE ser configurado exclusivamente por manifests Kubernetes (ConfigMap ou recurso equivalente), sem credenciais ou endereços fixos nas imagens.

### Requisito 7 — Dashboard e configuração como código

**História de usuário:** como membro da equipe, quero que o dashboard e as fontes de dados do Grafana estejam versionados no repositório, para que a observabilidade seja reproduzível, passe pelo GitOps e não se perca ao reiniciar o Grafana.

#### Critérios de aceitação

1. O dashboard do Requisito 5 DEVE estar versionado no repositório como arquivo (JSON).
2. As fontes de dados do Grafana (Prometheus e Tempo) DEVEM estar definidas por arquivos de provisionamento versionados no repositório.
3. QUANDO o Grafana for iniciado ou reiniciado, o dashboard e as fontes de dados DEVEM estar disponíveis sem nenhuma configuração manual.

---

## Decisões resolvidas

As ambiguidades originais do documento foram resolvidas. A tabela abaixo registra cada decisão, o resultado e a evidência no repositório.

| # orig. | Decisão | Resultado | Evidência |
|---|---|---|---|
| A-1 / D-05 | Banco de dados | PostgreSQL 16. View `active_links` implementada. | `api/app/schema.sql`, `SSOT.md` (D-05 Confirmada) |
| A-2 / D-02 | Ambiente Kubernetes | Docker Compose para desenvolvimento local; Kubernetes local com kind para deploy; GitOps com ArgoCD. | `docker-compose.yml`, `argocd/application.yaml`, `k8s/`, `README.md` |
| A-3 / D-04 | Frontend | React 19 + Vite, JavaScript, React Router, CSS puro. | `frontend/package.json`, `SSOT.md` (D-04 Confirmada) |
| A-4 / D-03 | Tecnologia da API (e framework HTTP) | Python 3.12, FastAPI, psycopg 3. (Substituiu Node.js/Fastify.) O atributo `http.route` usa o template da rota via `FastAPIInstrumentor`. | `api/requirements.txt`, `api/app/main.py`, `SSOT.md` (D-03 Confirmada) |
| A-5 | Nomes finais das métricas e rótulos | Confirmados em execução: `http_server_request_duration_seconds_count` com rótulos `http_request_method`, `http_route`, `http_response_status_code`. | Critério 2.4, nota acima; `api/app/telemetry.py` |
| A-6 | Código HTTP 410 para links expirados | Implementado: 404 para link inexistente, 410 para link expirado. O atributo `outcome` distingue `not_found` de `expired`. | `api/app/main.py` (função `redirect`) |
| A-7 | Aprovação do contrato `docs/otel-metrics-spec.md` | **Não verificado.** O SSOT (D-09) confirma a stack (Collector, Tempo, Prometheus, Grafana), mas não menciona a aprovação do documento `otel-metrics-spec.md` como contrato formal. O arquivo tem status "Rascunho (v2)". | `SSOT.md` seção 8 (D-09), `docs/otel-metrics-spec.md` |
| A-8 | `/healthz` e `/readyz` já na spec 01? | A spec `01-backend-api/requirements.md` especifica `GET /healthz` e `GET /readyz` (Requisito 5 da spec 01). O Requisito 1 desta spec deve ser entendido como complementar à spec `01-backend-api`, que é a referência primária para os endpoints de saúde. | `.kiro/specs/01-backend-api/requirements.md` |
| A-9 | Responsável pelos manifests da observabilidade | Manifests da stack em `k8s/observability/`; manifests da API (incluindo ConfigMap com variáveis OTel) em `k8s/api/`. Ambos gerenciados pelo mesmo repositório via ArgoCD. | `k8s/observability/`, `k8s/api/configmap.yaml`, `argocd/application.yaml` |

---

## Extensões além do spec

Os itens abaixo foram implementados além do escopo definido nos requisitos originais.

- **`kiro.feature.used`** (Counter, atributo `feature`): métrica para rastrear o uso das features exclusivas `stats`, `ranking` e `qrcode`. Emitida em `api/app/main.py`; instrumentos em `api/app/telemetry.py`.
- **Datasource Postgres no Grafana:** além de Prometheus e Tempo, o Grafana está configurado com PostgreSQL como fonte de dados (`k8s/observability/config/grafana-datasources.yaml`), habilitando painéis SQL.
- **Painéis extras no dashboard** (`k8s/observability/dashboards/kiro-portal.json`): "Uso de features" (timeseries, `kiro_feature_used_total`), "Traces recentes" (tabela TraceQL no Tempo), "Spans/s por componente" (span metrics gerados pelo Tempo), "Latência HTTP p95 por rota" (histograma HTTP por rota) e "Resultado dos redirects" (timeseries por `outcome`).
- **Painel "Link do dia":** ranking SQL dos 10 links mais clicados nas últimas 24h, via datasource Postgres. Corresponde ao painel desejável do Requisito 5.
