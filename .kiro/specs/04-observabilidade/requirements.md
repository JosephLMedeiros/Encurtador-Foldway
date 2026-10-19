Status: Aprovado em 2026-10-18 por Diêgo

# Requisitos — Observabilidade

## Introdução

Esta spec cobre os requisitos R-08 (traces distribuídos com OpenTelemetry) e R-09 (dashboards no Grafana com cliques, latência, erros e saúde) do SSOT.

O contrato de telemetria, com nomes de métricas, atributos permitidos e consultas, está em `docs/otel-metrics-spec.md`. Esta spec diz o que precisa existir; o contrato diz exatamente com que nome.

A stack foi definida na D-09: OpenTelemetry Collector, Tempo para traces, Prometheus para métricas e Grafana para os dashboards. O Jaeger foi descartado porque o Grafana já mostra traces e métricas no mesmo lugar.

Notação dos critérios: `QUANDO <evento>, <componente> DEVE <resposta>`; `SE <condição>, ENTÃO <componente> DEVE <resposta>`; `<componente> DEVE <comportamento>` para regras que valem sempre.

## Glossário

- **OTel Collector:** recebe os spans da API, do nginx e do navegador e encaminha ao Tempo. Métricas não passam por ele: o Prometheus coleta direto da API.
- **Span / trace:** um span é uma operação; um trace é o conjunto de spans de uma mesma requisição, ligados pelo mesmo `trace-id`.
- **W3C Trace Context:** o cabeçalho `traceparent` que leva o trace de um componente para o outro.
- **Template de rota:** o padrão da URL (`/r/{short_code}`), em vez do caminho real (`/r/abc123`).
- **Link ativo:** link sem expiração ou que ainda não expirou, conforme a view `active_links`.
- **`service.name`:** quem emitiu o span. Usamos três: `kiro-browser` (JavaScript no navegador), `kiro-frontend` (nginx) e `kiro-api`.

## Requisitos

### Requisito 1 — Endpoints de métricas e saúde

**História:** como operador, quero que a API exponha métricas e probes para o Prometheus coletar e o Kubernetes saber o estado dos pods.

1. A API DEVE expor `GET /metrics` no formato texto do Prometheus, na mesma porta da aplicação.
2. A API DEVE expor `GET /healthz`, que responde 200 enquanto o processo estiver de pé, com ou sem banco.
3. QUANDO o banco estiver acessível, `GET /readyz` DEVE responder 200.
4. SE o banco não estiver acessível, ENTÃO `GET /readyz` DEVE responder 503.
5. Esses três endpoints NÃO DEVEM exigir autenticação nem gerar spans.

Os detalhes das probes também estão na spec `01-backend-api`, que é a referência para elas.

### Requisito 2 — Métricas HTTP automáticas

**História:** como SRE, quero taxa de requisições, latência e erros por rota sem instrumentar cada rota à mão.

1. A API DEVE emitir `http.server.request.duration` como histograma em segundos, com `http.request.method`, `http.route` e `http.response.status_code`.
2. `http.route` DEVE ter o template da rota, nunca o caminho real.
3. No Prometheus, a série DEVE aparecer como `http_server_request_duration_seconds_count` com os rótulos `http_request_method`, `http_route` e `http_response_status_code`.
4. Nenhuma métrica DEVE usar valores de alta cardinalidade como rótulo: código curto, URL, IP ou user agent.

### Requisito 3 — Métricas de negócio

**História:** como equipe, queremos ver no dashboard quantos cliques, quantos links criados e quantos links ativos o portal tem.

1. QUANDO um redirect der 302, a API DEVE somar 1 em `kiro.link.clicks`, sem atributos.
2. QUANDO um link for criado (201), a API DEVE somar 1 em `kiro.links.created` com `kind` igual a `random` ou `vanity`.
3. A API DEVE emitir o gauge observável `kiro.active_links`, contando a view `active_links` a cada coleta.
4. A API DEVE emitir o histograma `kiro.link.redirect.duration` em segundos, do início da consulta até a decisão, com `outcome` igual a `found`, `not_found` ou `expired`.
5. Esse histograma DEVE usar os buckets `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0]`.
6. QUANDO uma feature exclusiva for usada, a API DEVE somar 1 em `kiro.feature.used` com `feature` igual a `stats`, `ranking` ou `qrcode`. Qualquer outro valor é recusado no código.

Desejável: SE a instrumentação do driver oferecer, ENTÃO a API DEVE emitir `db.client.operation.duration`.

### Requisito 4 — Traces distribuídos

**História:** como SRE, quero seguir uma requisição do clique no navegador até a consulta no banco, para achar onde está a lentidão ou o erro.

1. A API DEVE criar um span de servidor por requisição, com nome no formato `<método> <template da rota>`, por exemplo `POST /api/links` e `GET /r/{short_code}`.
2. A API DEVE criar spans do banco como filhos do span de servidor, usando a instrumentação do psycopg.
3. A API DEVE ler `service.name`, endpoint do Collector, propagadores e sampler de `OTEL_SERVICE_NAME` (`kiro-api`), `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_PROPAGATORS` (`tracecontext,baggage`) e `OTEL_TRACES_SAMPLER` (`parentbased_always_on`).
4. No Kubernetes, essas variáveis DEVEM vir do ConfigMap da API, nunca do código ou da imagem.
5. A API DEVE adicionar `kiro.link.short_code` aos spans de criação, redirect e stats. Em spans a alta cardinalidade não é problema.
6. QUANDO uma requisição chegar com `traceparent`, a API DEVE continuar esse trace.
7. O frontend DEVE enviar `traceparent` em toda chamada à API e gerar um span `kiro-browser` para cada uma, exportado ao Collector via OTLP.
8. O nginx do frontend DEVE continuar o trace do navegador, gerar seu span `kiro-frontend` e repassar o `traceparent` para a API.
9. O nginx DEVE gravar o `trace_id` no log de acesso, para que uma linha de log leve direto ao trace no Tempo.

Desejável: QUANDO a API responder 5xx, ela DEVE marcar o span com status de erro.

### Requisito 5 — Dashboard

**História:** como equipe, queremos um dashboard que cubra o que o hackathon pede e que funcione bem ao vivo na demo.

1. O Grafana DEVE ter um dashboard com, no mínimo:
   - cliques (taxa por segundo e total na última hora);
   - latência p50, p95 e p99 do redirect;
   - taxa de erros 5xx sobre o total;
   - respostas por código de status;
   - requisições por segundo por rota;
   - links ativos;
   - links criados por tipo (aleatório e personalizado);
   - quantos pods da API estão no ar.
2. QUANDO o Prometheus coletar a API, cada pod DEVE aparecer como alvo `UP`.
3. QUANDO forem feitos N redirects, o painel de cliques DEVE mostrar o aumento de N depois do próximo ciclo de coleta.
4. O dashboard DEVE ter um painel com o "link do dia" vindo direto do Postgres. Ele não pode sair do Prometheus, porque exigiria o código curto como rótulo.
5. O dashboard DEVE ter um painel de uso das features e uma lista dos traces recentes, para a demo pular da métrica para o trace.

### Requisito 6 — Coleta e roteamento

**História:** como responsável pela infra, quero que os sinais cheguem aos backends certos sem configuração manual.

1. O Collector DEVE receber spans via OTLP (gRPC e HTTP) e encaminhar ao Tempo.
2. O Prometheus DEVE coletar o `/metrics` de cada pod da API separadamente, descobrindo os pods pelas anotações `prometheus.io/*`.
3. O Grafana DEVE ter Prometheus, Tempo e Postgres como fontes de dados.
4. QUANDO alguém criar um link pelo site, o Tempo DEVE ter um trace com spans de `kiro-browser`, `kiro-frontend`, `kiro-api` e do banco, todos com o mesmo `trace-id`.
5. A config do Collector DEVE vir de um ConfigMap, sem endereços ou credenciais na imagem.

### Requisito 7 — Configuração como código

**História:** como equipe, queremos que o dashboard e as fontes de dados estejam no Git, para passarem pelo GitOps e não sumirem quando o Grafana reiniciar.

1. O dashboard DEVE estar versionado como JSON.
2. As fontes de dados e o provider de dashboards DEVEM estar em arquivos de provisionamento versionados.
3. QUANDO o Grafana subir, o dashboard e as fontes de dados DEVEM estar disponíveis sem nenhum clique.
4. O Docker Compose e o Kubernetes DEVEM usar os mesmos arquivos de configuração.

## Decisões relacionadas

- D-09 (stack de observabilidade): confirmada.
- D-14 (tracing do navegador sem SDK): proposta. O contrato original falava no SDK web do OpenTelemetry; fizemos um tracer de poucas linhas que gera o mesmo `traceparent` e o mesmo OTLP, sem aumentar o bundle.
- O contrato `docs/otel-metrics-spec.md` ainda não foi aprovado formalmente pelo grupo.
