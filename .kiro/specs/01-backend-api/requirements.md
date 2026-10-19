Status: Aprovado em 2026-10-18 por Diêgo

# Requisitos — Backend API

## Introdução

Esta spec trata da API do encurtador: criar links curtos, listar, redirecionar, guardar os dados no PostgreSQL e expor métricas e traces para a observabilidade.

A API mora em `api/`. O contrato HTTP está no `openapi.yaml`, o schema em `api/app/schema.sql` e o contrato de telemetria em `docs/otel-metrics-spec.md`. Quando houver diferença entre esta spec e esses arquivos, a gente corrige o que estiver errado antes de seguir.

A primeira versão desta spec foi escrita pensando em Node.js com Fastify. Em 2026-10-16 o grupo trocou para Python (D-03) e a spec foi reescrita para refletir o que de fato construímos. A versão antiga continua no histórico do Git.

## Glossário

- **API:** o serviço em Python 3.12 com FastAPI que implementa o `openapi.yaml`.
- **Link:** um código curto e a URL original para onde ele aponta, guardados na tabela `links`.
- **Código curto (`short_code`):** identificador do link. Pode ser gerado pela API ou escolhido por quem cria o link.
- **Código personalizado (`custom_code`):** código escolhido pelo usuário na criação.
- **Link ativo:** link sem `expires_at` ou com `expires_at` no futuro. A regra fica só na view `active_links`.
- **Link expirado:** link com `expires_at` no passado. Ele continua no banco, mas não redireciona mais.
- **Evento de clique:** uma linha em `click_events` gravada a cada redirect bem-sucedido.
- **Repositório:** a classe `LinkRepository`, que concentra todo o SQL da aplicação.
- **Módulo de telemetria:** `api/app/telemetry.py`, o único arquivo que conversa com o SDK do OpenTelemetry.

## Requisitos

### Requisito 1 — Banco de dados e pool de conexões

**História:** como desenvolvedor, quero que a API reutilize conexões com o Postgres e espere o banco subir, para não derrubar o banco nem a própria API no primeiro boot do cluster.

Critérios de aceitação:

1. A API DEVE usar um pool de conexões configurado por `DATABASE_URL` ou, se ela não existir, por `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` e `DB_PASSWORD`. O tamanho vem de `DB_POOL_MIN` (padrão 1) e `DB_POOL_MAX` (padrão 10, limitado a 100).
2. Todo o SQL DEVE ficar no repositório. Rotas não escrevem SQL.
3. QUANDO a API iniciar, ela DEVE tentar `SELECT 1` no banco até conseguir ou até estourar `DB_STARTUP_TIMEOUT_SECONDS` (padrão 60s). Cada tentativa tem timeout de 5s.
4. SE o banco não responder dentro desse prazo, ENTÃO a API DEVE registrar o erro e encerrar o processo com código diferente de zero, para o Kubernetes reiniciar o pod.
5. QUANDO a API iniciar, ela DEVE aplicar o `schema.sql` de forma idempotente, protegida por um advisory lock, para que duas réplicas não migrem ao mesmo tempo.
6. SE o banco cair durante uma requisição, ENTÃO a API DEVE responder 503 com `error: "database_unavailable"` e continuar no ar.
7. O redirect DEVE consultar os links pela view `active_links`, nunca direto na tabela `links`.

### Requisito 2 — Criar link (`POST /api/links`)

**História:** como usuário do frontend, quero encurtar uma URL, com a opção de escolher o código e uma data de expiração.

Critérios de aceitação:

1. QUANDO receber uma `original_url` válida, a API DEVE gravar o link e responder 201 com `short_code`, `short_url`, `original_url`, `clicks`, `created_at` e `expires_at`.
2. A `original_url` DEVE ser absoluta, com esquema `http` ou `https`, host preenchido e no máximo 2048 caracteres. SE não for, ENTÃO a resposta é 400 com `error: "invalid_url"`.
3. SE `custom_code` vier no corpo, ENTÃO ele DEVE ter de 3 a 50 caracteres `[A-Za-z0-9_-]`. Fora disso, 400 com `error: "invalid_custom_code"`.
4. SE `custom_code` for um caminho da própria aplicação (`api`, `r`, `healthz`, `readyz`, `metrics`, `docs`, `redoc`, `openapi.json`, sem diferenciar maiúsculas), ENTÃO a resposta é 400 com `error: "reserved_custom_code"`.
5. SE `custom_code` já estiver em uso, ENTÃO a resposta é 409 com `error: "code_in_use"` e nada é gravado.
6. QUANDO `custom_code` não vier, a API DEVE gerar um código aleatório com `SHORT_CODE_LENGTH` caracteres (padrão 7) do alfabeto `SHORT_CODE_ALPHABET` (padrão `a-z0-9`), tentando até 5 vezes em caso de colisão. SE todas colidirem, ENTÃO a resposta é 503 com `error: "code_generation_failed"`.
7. SE `expires_at` vier e não estiver no futuro, ENTÃO a resposta é 400 com `error: "invalid_expires_at"`. Datas sem fuso são tratadas como UTC.
8. QUANDO o link for criado, a API DEVE somar 1 em `kiro.links.created` com `kind="vanity"` (código personalizado) ou `kind="random"`.

### Requisito 3 — Listar links (`GET /api/links`)

**História:** como usuário do frontend, quero ver os links já criados, do mais novo para o mais antigo.

Critérios de aceitação:

1. A API DEVE responder 200 com `{ total, items }`, em que `total` é o número de links na tabela e cada item tem os mesmos campos da criação.
2. A API DEVE aceitar `limit` (padrão 50, máximo 200) e `offset` (padrão 0).
3. SE `limit` passar de 200 ou se `limit`/`offset` forem negativos ou não inteiros, ENTÃO a resposta é 400.
4. Os itens DEVEM vir ordenados por `created_at` decrescente, com `id` decrescente como desempate.
5. O campo `short_url` DEVE ser `{BASE_URL}/r/{short_code}`.

### Requisito 4 — Redirecionar (`GET /r/{short_code}`)

**História:** como visitante, quero abrir um link curto e cair rápido no destino, ou ver uma mensagem clara quando o link não existe ou expirou.

Critérios de aceitação:

1. QUANDO o código for de um link ativo, a API DEVE responder 302 com `Location` igual à `original_url` e `Cache-Control: no-store` (para o navegador não pular a contagem nos próximos acessos).
2. A API DEVE aceitar também `GET /{short_code}`, com o mesmo comportamento, por compatibilidade com a primeira versão do contrato. Essa rota não aparece no OpenAPI.
3. SE o código tiver formato inválido ou não existir, ENTÃO a resposta é 404 com `error: "not_found"`.
4. SE o link existir mas estiver expirado, ENTÃO a resposta é 410 com `error: "expired"`.
5. QUANDO o redirect acontecer, a API DEVE somar 1 em `clicks` e gravar um evento em `click_events` com `user_agent` e `referer`, na mesma operação no banco, para o contador e o log nunca divergirem.
6. A API NÃO DEVE gravar o IP do visitante (LGPD). A coluna `ip_address` existe no schema, mas fica vazia.
7. A API DEVE medir o tempo da consulta e da decisão no histograma `kiro.link.redirect.duration`, com `outcome` igual a `found`, `not_found` ou `expired`.
8. QUANDO o redirect for bem-sucedido, a API DEVE somar 1 em `kiro.link.clicks`.
9. QUANDO o redirect tiver `?via=qr`, a API DEVE somar 1 em `kiro.feature.used{feature="qrcode"}`. É assim que medimos os acessos vindos do QR Code (D-17).
10. A API DEVE colocar o atributo `kiro.link.short_code` no span da requisição.

### Requisito 5 — Estatísticas de um link (`GET /api/links/{short_code}/stats`)

**História:** como usuário, quero ver quantos cliques um link teve e como eles se distribuíram nas últimas 24 horas.

Critérios de aceitação:

1. QUANDO o código existir, a API DEVE responder 200 com os campos do link e `last_24h`, uma lista de `{ hour, clicks }`.
2. A consulta DEVE ir na tabela `links`, não na view, para que links expirados também tenham estatísticas.
3. SE o código não existir, ENTÃO a resposta é 404. SE o formato for inválido, ENTÃO a resposta é 400.
4. Cada consulta bem-sucedida DEVE somar 1 em `kiro.feature.used{feature="stats"}`.

### Requisito 6 — Ranking (`GET /api/ranking`)

**História:** como equipe, queremos saber quais links foram mais clicados num período, para mostrar o "link do dia".

Critérios de aceitação:

1. A API DEVE responder 200 com `{ hours, items }`, cada item com `position`, `short_code`, `short_url`, `original_url` e `clicks` contados em `click_events` dentro da janela.
2. A API DEVE aceitar `hours` (padrão 24, de 1 a 720) e `limit` (padrão 10, de 1 a 50). Fora disso, 400 com `error: "invalid_ranking"`.
3. Cada consulta DEVE somar 1 em `kiro.feature.used{feature="ranking"}`.

### Requisito 7 — Probes (`GET /healthz` e `GET /readyz`)

**História:** como operador do cluster, quero saber se o processo está vivo e se ele já pode receber tráfego.

Critérios de aceitação:

1. `GET /healthz` DEVE responder 200 com `{"status": "ok"}` sem consultar o banco nem qualquer outra dependência.
2. `GET /readyz` DEVE responder 200 com `{"status": "ok", "db": "ok"}` quando o banco responder ao `SELECT 1` em até 2s.
3. SE o banco não responder ou der erro, ENTÃO `GET /readyz` DEVE responder 503 com `{"status": "error", "db": "unavailable"}`.
4. As probes NÃO DEVEM gerar spans nem entrar nas métricas HTTP. Elas são chamadas a cada poucos segundos e só poluiriam os traces.

### Requisito 8 — Métricas (`GET /metrics`)

**História:** como SRE, quero que o Prometheus colete as métricas da API sem passar pelo Collector.

Critérios de aceitação:

1. `GET /metrics` DEVE responder no formato texto do Prometheus, sem autenticação.
2. A API DEVE expor `kiro_link_redirect_duration_seconds`, `kiro_link_clicks_total`, `kiro_links_created_total`, `kiro_feature_used_total` e `kiro_active_links`, além do histograma automático `http_server_request_duration_seconds`.
3. O rótulo `http_route` DEVE ter o template da rota (`/r/{short_code}`), nunca o caminho real.
4. Nenhuma métrica DEVE usar como rótulo o código curto, a URL, o IP ou o user agent.
5. `kiro_active_links` DEVE ser um gauge observável que conta a view `active_links` a cada coleta.
6. O histograma do redirect DEVE usar os buckets `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0]` segundos.

### Requisito 9 — Traces

**História:** como SRE, quero que um trace comece no navegador e chegue até a consulta no banco.

Critérios de aceitação:

1. Toda a configuração do OpenTelemetry DEVE ficar em `api/app/telemetry.py`. O resto do código chama funções simples desse módulo e não importa o SDK.
2. A telemetria DEVE ser ligada antes de a API começar a atender.
3. A API DEVE continuar o trace recebido no cabeçalho `traceparent` (W3C Trace Context) e criar spans do banco como filhos do span da requisição.
4. `service.name`, endpoint do Collector, propagadores e sampler DEVEM vir das variáveis `OTEL_SERVICE_NAME` (padrão `kiro-api`), `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_PROPAGATORS` e `OTEL_TRACES_SAMPLER`.
5. SE `OTEL_EXPORTER_OTLP_ENDPOINT` não estiver definida, ENTÃO a API DEVE funcionar normalmente, só sem exportar spans (é o caso dos testes).
6. Os spans de servidor DEVEM ter o nome do método mais o template da rota, por exemplo `GET /r/{short_code}`.

### Requisito 10 — Empacotamento e ambiente local

**História:** como desenvolvedor, quero subir API e banco com um comando e rodar os testes sem instalar Postgres na máquina.

Critérios de aceitação:

1. A API DEVE ter um `api/Dockerfile` multi-stage, com a imagem final sem ferramentas de build e rodando com usuário sem root (UID 10001).
2. O `docker-compose.yml` na raiz DEVE subir banco e API (e a stack de observabilidade). O schema é aplicado pela própria API, sem script de init no Postgres.
3. QUANDO o `docker compose up` terminar, `/healthz` e `/readyz` DEVEM responder 200 em até 60 segundos.
4. Nenhum arquivo versionado DEVE ter senha real. O compose usa valores de exemplo.
5. O compose DEVE ter um profile `test` que sobe um banco descartável e roda o pytest em Python 3.12, a mesma versão da imagem.

## Fora do escopo

Coisas que estavam na primeira versão e o grupo decidiu não fazer:

- **Cache de redirect em memória.** Com duas réplicas, cada uma teria seu cache e a invalidação ficaria complicada para o prazo. O que resolveu a latência foi o `synchronous_commit off` no clique (ver design).
- **Campo `qr_code_url` e endpoint `/qr/{code}`.** O QR Code é gerado no navegador (D-17), então a API não precisa saber dele. Ela só conta os acessos com `?via=qr`.
- **Resposta 502 quando o incremento de cliques falha.** Clique e evento são gravados numa única instrução; se ela falhar, é falha de banco e a resposta é 503, como nas outras rotas.
- **Gravação do IP no clique.** Decidimos não guardar por causa da LGPD.

## Decisões relacionadas

- D-03 (Python, FastAPI e psycopg 3) e D-05 (PostgreSQL 16): confirmadas.
- D-06 (formato do código e rota `/r/{code}`) e D-11 (contrato usado pelo frontend): propostas, aguardando aprovação.
- D-17 (QR Code): proposta.

O estado atualizado de cada uma fica na tabela do `SSOT.md`.
