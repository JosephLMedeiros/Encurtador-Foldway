Status: Aprovado em 2026-10-18 por Diêgo

# Tarefas — Observabilidade

A parte de contrato (`docs/otel-metrics-spec.md`) e os requisitos vieram primeiro, na branch `feat/observabilidade-abby`. A implementação foi feita junto com a API em Python e os manifests, e depois ganhou o tracing do navegador quando o frontend real entrou.

## 1. Contrato

- [x] 1.1 Definir a stack (D-09) e escrever o contrato de telemetria: métricas, atributos, regra de cardinalidade, nomes dos spans e consultas do dashboard.
- [x] 1.2 Revisar o rascunho inicial do contrato (troca do `http_requests_total` pelo histograma HTTP, buckets em segundos, view `active_links`).

## 2. Instrumentação da API

- [x] 2.1 Módulo `api/app/telemetry.py` com tracer, meter e a rota `/metrics`.
- [x] 2.2 Métricas de negócio (`kiro.links.created`, `kiro.link.clicks`, `kiro.link.redirect.duration`, `kiro.active_links`).
- [x] 2.3 `kiro.feature.used` com conjunto fechado de features.
- [x] 2.4 Atributo `kiro.link.short_code` nos spans.
- [x] 2.5 Tirar probes, boot e spans internos do ASGI dos traces.
- [x] 2.6 Testes do contrato em `api/tests/test_telemetry.py`.

Verificação: testes passando e `/metrics` conferido contra o contrato.

## 3. Stack de observabilidade

- [x] 3.1 Collector com OTLP gRPC e HTTP, `memory_limiter`, `batch` e saída para o Tempo.
- [x] 3.2 Tempo com retenção de 24h e `metrics_generator` mandando span metrics para o Prometheus.
- [x] 3.3 Prometheus com descoberta por pod no Kubernetes e alvo fixo no compose.
- [x] 3.4 Grafana com fontes de dados (Prometheus, Tempo e Postgres) e provider de dashboards provisionados.
- [x] 3.5 Manifests em `k8s/observability/` e ConfigMaps gerados pelo kustomize a partir dos mesmos arquivos do compose.
- [x] 3.6 Variáveis `OTEL_*` no ConfigMap da API e anotações de scrape no Deployment.

Verificação: compose com todos os serviços no ar; alvo da API `UP`; no kind, as 2 réplicas aparecendo como alvos separados.

## 4. Dashboard

- [x] 4.1 Painéis exigidos: cliques, latência p50/p95/p99, erros 5xx, status, requisições por rota, links ativos, links criados e pods no ar.
- [x] 4.2 Painéis extras: resultado dos redirects, uso de features, latência HTTP por rota, spans por componente e traces recentes.
- [x] 4.3 "Link do dia" com SQL direto no Postgres.
- [x] 4.4 Eixo da taxa de erros 5xx fixo em 0 a 100%.
- [x] 4.5 Filtro `http_route!=""` nos painéis por rota, para sumir a série "Value".

Verificação: painéis consultados pela API do Grafana durante a carga de `gerar-trafego.sh`; números do "Link do dia" batendo com as métricas.

## 5. Traces de ponta a ponta

- [x] 5.1 nginx com `ngx_otel_module`, continuando o `traceparent` e exportando `kiro-frontend`.
- [x] 5.2 `trace_id` no log de acesso do nginx.
- [x] 5.3 `frontend/src/api/tracing.js` gerando os spans `kiro-browser` e enviando por `/otlp` (D-14).
- [x] 5.4 Painel de spans por componente no lugar do service graph, que não ligava nginx e API.

Verificação: trace com `kiro-browser` → `kiro-frontend` → `kiro-api` → Postgres no mesmo Trace ID; trace aberto a partir de uma linha de log.

## 6. Ajuste de latência

- [x] 6.1 Investigar pelo trace o p95 alto do redirect. A causa era o fsync do commit; a correção (`synchronous_commit off` só no clique) está na spec 01.

Verificação: p95 do redirect por volta de 10 ms com carga.

## Pendências

- [ ] Confirmar se um 5xx marca o span da API como erro.
- [ ] Ver por que `db.client.operation.duration` não aparece no `/metrics`.
- [ ] Avaliar um alerta ou painel que pegue erros gerados pelo nginx.
- [ ] Aprovação formal do contrato `docs/otel-metrics-spec.md`.
