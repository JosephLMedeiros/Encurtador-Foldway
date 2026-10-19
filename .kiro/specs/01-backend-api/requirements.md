Status: Reconciliado com a implementação em 18/10/2026 (escrito após a implementação)

# Requirements Document — Backend API

## Introduction

Este documento especifica os requisitos da API do encurtador de links, o componente responsável por criar códigos curtos, redirecionar usuários, persistir dados e expor métricas e traces de observabilidade.

A API está no diretório `api/` do repositório e implementa os endpoints definidos em `openapi.yaml`, o schema em `api/app/schema.sql` e o contrato de telemetria em `docs/otel-metrics-spec.md`.

> **Nota:** o documento original assumia Node.js LTS com Express ou Fastify e mencionava D-03 e D-05 como pendentes. Ambas as decisões foram confirmadas (D-03: Python 3.12 + FastAPI + psycopg 3; D-05: PostgreSQL 16). Ver seção "Decisões resolvidas".

---

## Glossary

- **API**: o serviço backend implementado em Python 3.12 com FastAPI que implementa os endpoints definidos em `openapi.yaml`. (Nota: o documento original dizia Node.js/Fastify — ver seção "Decisões resolvidas".)
- **Link**: o par formado por um código curto e a URL original correspondente, armazenado na tabela `links` (`api/app/schema.sql`).
- **Código curto (short_code)**: identificador alfanumérico único que representa um link. Pode ser gerado aleatoriamente ou fornecido pelo usuário (vanity).
- **Código vanity (custom_code)**: código curto definido explicitamente pelo usuário na criação do link.
- **URL original**: a URL de destino completa para a qual o link curto redireciona.
- **Link ativo**: link cujo campo `expires_at` é nulo ou é posterior ao momento atual, conforme a view `active_links` do schema (`api/app/schema.sql`).
- **Link expirado**: link cujo campo `expires_at` é anterior ou igual ao momento atual.
- **Repositório**: camada de acesso a dados que encapsula as consultas ao banco de dados. Implementado em `api/app/repository.py`.
- **Pool de conexões**: conjunto gerenciado de conexões ao PostgreSQL reutilizadas entre requisições. Implementado via `psycopg-pool` (`api/app/db.py`).
- **Módulo de telemetria**: módulo em `api/app/telemetry.py` que inicializa os instrumentos OpenTelemetry (métricas e traces) e os expõe para uso pelo restante da aplicação. (Nota: o original dizia `api/src/telemetry/`.)
- **Cache**: não implementado. Ver divergência no Requisito 2.
- **Probe de liveness**: endpoint `GET /healthz` que indica se o processo da API está vivo.
- **Probe de readiness**: endpoint `GET /readyz` que indica se a API está pronta para receber tráfego.
- **click_event**: registro de um acesso a um link, armazenado na tabela `click_events` (`api/app/schema.sql`).
- **QR Code**: gerado no navegador (D-17). Não existe endpoint `GET /qr/{shortCode}` na API. Ver divergência no Requisito 4, critério 4.8.

---

## Requirements

### Requisito 1 — Persistência e pool de conexões

**User Story:** Como desenvolvedor da equipe, quero que a API gerencie as conexões com o PostgreSQL por meio de um pool, para que as conexões sejam reutilizadas entre requisições e o banco não seja sobrecarregado.

#### Critérios de aceitação

1. THE API SHALL gerenciar as conexões ao PostgreSQL por meio de um pool de conexões configurável pelas variáveis de ambiente `DATABASE_URL` (connection string completa) ou pelas variáveis individuais `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` e `DB_PASSWORD`; o tamanho mínimo do pool é definido por `DB_POOL_MIN` (padrão 1) e o máximo por `DB_POOL_MAX` (padrão 10, máximo permitido 100).
2. THE API SHALL encapsular todas as consultas ao banco em um repositório de links e em um repositório de eventos de clique, sem consultas SQL dispersas nas camadas de rota ou de serviço.

   > **Atendido com divergência (1.2):** todo o SQL está em `api/app/repository.py` (`LinkRepository`). Não há um repositório separado de eventos de clique: o registro de cliques (`click_events`) é feito dentro do método `register_click` do mesmo `LinkRepository`, em um único CTE atômico.

3. WHEN a aplicação é inicializada, THE API SHALL verificar a conectividade com o PostgreSQL executando `SELECT 1` com timeout de 5 segundos antes de abrir o servidor HTTP para receber requisições.

   > **Atendido com divergência (1.3):** a função `wait_for_database` em `api/app/db.py` executa `SELECT 1` com timeout de 5s por tentativa, mas repete em loop até um timeout total configurável por `DB_STARTUP_TIMEOUT_SECONDS` (padrão 60s — `api/app/config.py`). A lógica difere do critério original (que previa 5s total), mas o comportamento é mais robusto para ambientes Kubernetes.

4. IF a conexão com o banco falhar durante a inicialização, THEN THE API SHALL registrar o erro no log e encerrar o processo com código de saída não-zero.

   > **Atendido com divergência (1.4):** `wait_for_database` levanta `RuntimeError` ao esgotar o timeout (`api/app/db.py`). A saída com código não-zero ocorre porque o FastAPI/uvicorn não tem `try/except` ao redor do lifespan: a exceção propaga e encerra o processo. O mecanismo é diferente de um `sys.exit(1)` explícito, mas o resultado (encerramento com código de erro) é o mesmo.

5. IF o banco de dados se tornar inacessível durante o atendimento de uma requisição, THEN THE API SHALL retornar HTTP 503 e registrar o erro no log, sem encerrar o processo.
6. THE API SHALL executar todas as consultas de leitura de links ativos e de redirecionamento exclusivamente por meio da view `active_links`, nunca diretamente na tabela `links`.

---

### Requisito 2 — Cache de redirecionamento (Cache-Aside)

**User Story:** Como usuário que acessa um link curto, quero que o redirecionamento seja respondido com baixa latência mesmo sob alta carga, para que minha navegação não seja interrompida.

#### Critérios de aceitação

1. THE API SHALL implementar uma camada de cache Cache-Aside em memória para armazenar os resultados de consultas de redirecionamento, com tamanho máximo configurável pela variável de ambiente `CACHE_MAX_SIZE` (padrão 1000 entradas) e TTL padrão configurável pela variável `CACHE_DEFAULT_TTL_SECONDS` (padrão 300 segundos).

   > **Divergência (2.1–2.7): cache não implementado.** A API não possui camada de cache em memória. O redirect vai diretamente ao banco via `repository.register_click` a cada requisição (`api/app/main.py`). As variáveis `CACHE_MAX_SIZE` e `CACHE_DEFAULT_TTL_SECONDS` não existem em `api/app/config.py`. A latência do redirect é mitigada por `synchronous_commit off` na transação de clique (ver README, seção "Decisões técnicas"). Motivo: não registrado no código; a decisão de omitir o cache não consta no SSOT.

2. WHEN o redirecionamento de um código curto é requisitado e o resultado está no cache, THE API SHALL retornar o resultado sem consultar o banco de dados.
3. WHEN o redirecionamento de um código curto é requisitado e o resultado não está no cache, THE API SHALL consultar o banco via view `active_links`, armazenar o resultado no cache e retornar a resposta.
4. IF um link possui `expires_at` definido, THEN THE API SHALL calcular o TTL da entrada no cache como `max(1, expires_at - agora)` em segundos, de forma que a entrada expire no máximo no mesmo instante que o link e nunca com TTL menor que 1 segundo.
5. WHEN um código curto consultado não existe na tabela `links`, THE API SHALL armazenar no cache um marcador de ausência exclusivo para esse código com TTL fixo de 60 segundos.
6. WHEN um código curto consultado existe na tabela `links` mas está expirado (não retornado pela view `active_links`), THE API SHALL tratar o resultado como expirado sem armazenar marcador de ausência, permitindo que o banco seja consultado novamente caso o contexto de expiração mude.
7. IF o banco de dados estiver inacessível durante um cache miss, THEN THE API SHALL retornar HTTP 503 sem popular o cache.

---

### Requisito 3 — Listagem de links (`GET /api/links`)

**User Story:** Como usuário do frontend, quero listar todos os links criados com paginação, para que eu possa visualizar e navegar pelo histórico de links.

#### Critérios de aceitação

1. WHEN uma requisição `GET /api/links` é recebida, THE API SHALL retornar HTTP 200 com um objeto JSON contendo o campo `total` (inteiro representando o número total de links na tabela `links`) e o campo `items` (array de objetos, possivelmente vazio, com os campos `short_code`, `short_url`, `original_url`, `clicks`, `created_at` e `expires_at` para cada link, onde `expires_at` é `null` quando nenhuma expiração estiver definida).
2. THE API SHALL aceitar os parâmetros de query `limit` (inteiro, padrão 50, máximo 200) e `offset` (inteiro, padrão 0) para paginação.
3. IF o valor de `limit` fornecido exceder 200, THEN THE API SHALL retornar HTTP 400 com uma mensagem de erro indicando o limite máximo permitido.
4. IF o valor de `limit` ou de `offset` fornecido não for um inteiro não-negativo, THEN THE API SHALL retornar HTTP 400 com uma mensagem de erro indicando qual parâmetro é inválido.
5. THE API SHALL construir o campo `short_url` de cada link concatenando o base URL configurado pela variável de ambiente `BASE_URL` com o `short_code`.

   > **Atendido com divergência (3.5):** `short_url` é construído como `{BASE_URL}/r/{short_code}` (`api/app/main.py`, função `short_url`), não `{BASE_URL}/{short_code}` como o critério original previa. A rota canônica mudou para `/r/{short_code}` (D-06).

6. THE API SHALL retornar os links dentro do campo `items` ordenados por `created_at` descendente.

   > **Atendido com divergência (3.6):** a query em `api/app/repository.py` (`list_page`) ordena por `created_at DESC, id DESC`, o que resolve empates por `created_at` igual pelo `id` decrescente.

---

### Requisito 4 — Criação de link curto (`POST /api/links`)

**User Story:** Como usuário do frontend, quero criar links curtos a partir de URLs longas, com a opção de definir um código personalizado e uma data de expiração, para que eu possa compartilhar e controlar os links criados.

#### Critérios de aceitação

1. WHEN uma requisição `POST /api/links` é recebida com `original_url` válida, THE API SHALL criar um registro na tabela `links` e retornar HTTP 201 com os campos `short_code`, `short_url`, `original_url`, `clicks`, `created_at` e `expires_at`.

   > **Atendido com divergência (4.1):** a resposta 201 retorna `short_code`, `short_url`, `original_url`, `clicks`, `created_at` e `expires_at`. O campo `qr_code_url` **não é retornado** (ver critério 4.8).

2. THE API SHALL validar que `original_url` é uma URI absoluta com esquema `http` ou `https`; IF a validação falhar, THEN THE API SHALL retornar HTTP 400 com uma mensagem de erro descritiva.
3. WHERE `custom_code` é fornecido no corpo da requisição, THE API SHALL validar que o valor contém apenas caracteres alfanuméricos, hífens e underscores, com comprimento entre 3 e 50 caracteres; IF a validação falhar, THEN THE API SHALL retornar HTTP 400 com uma mensagem de erro descritiva.

   > **Extensão (4.3):** a API também rejeita códigos reservados (`api`, `r`, `healthz`, `readyz`, `metrics`, `docs`, `redoc`, `openapi.json`) com HTTP 400 e `error: "reserved_custom_code"` (`api/app/shortcode.py`, `RESERVED_CODES`).

4. WHERE `custom_code` é fornecido e já existe na tabela `links`, THE API SHALL retornar HTTP 409 com um corpo JSON contendo uma mensagem de erro indicando que o código já está em uso, sem criar um novo registro.
5. WHERE `custom_code` não é fornecido, THE API SHALL gerar um código curto aleatório com comprimento configurável pela variável `SHORT_CODE_LENGTH` (padrão 7) e alfabeto configurável por `SHORT_CODE_ALPHABET` (padrão: letras minúsculas + dígitos), realizando até 5 tentativas de geração para garantir unicidade; IF todas as tentativas colidirem, THEN THE API SHALL retornar HTTP 503 sem persistir nenhum registro.
6. WHERE `expires_at` é fornecido no corpo da requisição, THE API SHALL validar que o valor é uma data-hora ISO 8601 estritamente posterior ao instante de recebimento da requisição; IF a validação falhar, THEN THE API SHALL retornar HTTP 400 com uma mensagem de erro descritiva.
7. WHEN um link é criado com sucesso, THE API SHALL incrementar o contador `kiro.links.created` com o atributo `kind` igual a `vanity` se `custom_code` foi fornecido, ou `random` caso contrário.
8. WHEN um link é criado com sucesso, THE API SHALL construir e retornar o campo `qr_code_url` no formato `{BASE_URL}/qr/{short_code}`.

   > **Divergência (4.8): `qr_code_url` não é retornado pela API.** O QR Code é gerado no navegador pelo frontend (D-17, SSOT.md), a partir da URL curta (`/r/{short_code}`). Não existe o endpoint `GET /qr/{shortCode}` nem o campo `qr_code_url` na resposta. O `openapi.yaml` (versão 1.2.0) documenta essa decisão: "qr_code_url adiado para a etapa de features". O acesso pelo QR é rastreado via `?via=qr` na rota de redirect (`api/app/main.py`).

---

### Requisito 5 — Redirecionamento (`GET /{shortCode}`)

**User Story:** Como usuário que acessa um link curto, quero ser redirecionado para a URL original de forma rápida e correta, com tratamento adequado para links inexistentes ou expirados.

#### Critérios de aceitação

1. WHEN uma requisição `GET /{shortCode}` é recebida com um `shortCode` de comprimento entre 3 e 50 caracteres contendo apenas caracteres alfanuméricos, hífens e underscores, e o código corresponde a um link ativo, THE API SHALL retornar HTTP 302 com o header `Location` apontando para a `original_url` do link.

   > **Atendido com divergência (5.1):** a rota canônica é `GET /r/{short_code}` (`api/app/main.py`). `GET /{short_code}` é aceita por compatibilidade (registrada como `redirect_root`, `include_in_schema=False`). Ambas estão cobertas por testes (`test_api.py`, `test_redirect_counts_click_and_records_event`).

2. WHEN uma requisição `GET /{shortCode}` é recebida e o código não existe na tabela `links`, THE API SHALL retornar HTTP 404 com um corpo JSON contendo uma mensagem de erro indicando que o código não foi encontrado.
3. WHEN uma requisição `GET /{shortCode}` é recebida e o link existe mas está expirado, THE API SHALL retornar HTTP 410 com um corpo JSON contendo uma mensagem de erro indicando que o link expirou.
4. WHEN um redirect 302 é emitido, THE API SHALL incrementar a coluna `clicks` na tabela `links` para o link correspondente de forma atômica.

   > **Atendido com divergência (5.4):** o incremento de `clicks` e a inserção de `click_event` são feitos num único CTE atômico em `repository.register_click` (`api/app/repository.py`), não em dois passos separados.

5. WHEN um redirect 302 é emitido, THE API SHALL disparar a inserção de um `click_event` na tabela `click_events` de forma assíncrona e não-bloqueante, incluindo `link_id`, `clicked_at`, `user_agent` (do header `User-Agent`) e `ip_address` (do IP remoto da conexão); IF a inserção assíncrona falhar, THEN THE API SHALL registrar o erro no log sem afetar a resposta HTTP ao usuário.

   > **Atendido com divergência (5.5):** a inserção do `click_event` ocorre sincronamente dentro do CTE em `register_click` (`api/app/repository.py`), não de forma assíncrona. Os campos gravados são `link_id`, `clicked_at` (default), `user_agent` e `referer`. O campo `ip_address` **existe na tabela** (`api/app/schema.sql`) mas **não é gravado** pela API (comentário no schema: "a API não grava IP (LGPD)").

6. WHEN uma requisição `GET /{shortCode}` é recebida, THE API SHALL registrar a duração da operação (do início da busca até a decisão de resposta) no histograma `kiro.link.redirect.duration` com o atributo `outcome` igual a `found`, `not_found` ou `expired`, conforme o resultado.
7. WHEN um redirect 302 é emitido, THE API SHALL incrementar o contador `kiro.link.clicks` sem atributos adicionais.
8. THE API SHALL incluir o atributo de span `kiro.link.short_code` no span do servidor correspondente à requisição de redirecionamento.
9. IF o incremento de `clicks` na tabela `links` falhar por erro de banco de dados, THEN THE API SHALL retornar HTTP 502 e registrar o erro no log.

   > **Divergência (5.9):** o CTE em `register_click` não retorna erro específico para falha no incremento de `clicks`. Falhas de banco de dados propagam como `psycopg.OperationalError` e são tratadas pelo handler global como 503 (`api/app/main.py`, `on_db_unavailable`), não 502. Motivo: a estratégia do CTE atômico torna a falha no incremento indistinguível de falha geral de banco.

---

### Requisito 6 — Estatísticas de link (`GET /api/links/{shortCode}/stats`)

**User Story:** Como usuário do frontend, quero consultar as estatísticas de um link específico, para que eu possa acompanhar o número de acessos e as informações associadas.

#### Critérios de aceitação

1. WHEN uma requisição `GET /api/links/{shortCode}/stats` é recebida e o código existe na tabela `links`, THE API SHALL retornar HTTP 200 com um objeto JSON contendo os campos `short_code`, `original_url`, `clicks`, `created_at` e `expires_at` (null se não definido).

   > **Extensão (6.1):** a resposta inclui também `short_url` e `last_24h` (série de cliques por hora das últimas 24 horas). Ver seção "Extensões além do spec".

2. WHEN uma requisição `GET /api/links/{shortCode}/stats` é recebida e o código não existe na tabela `links`, THE API SHALL retornar HTTP 404 com um corpo JSON contendo uma mensagem de erro indicando que o código não foi encontrado.
3. THE API SHALL consultar a tabela `links` diretamente (não a view `active_links`) para o endpoint de stats, de forma que links expirados também retornem suas estatísticas.
4. IF o valor de `shortCode` no caminho da requisição não satisfizer o formato definido (comprimento entre 3 e 50 caracteres, apenas alfanuméricos, hífens e underscores), THEN THE API SHALL retornar HTTP 400 com uma mensagem de erro descritiva.

---

### Requisito 7 — Probe de liveness (`GET /healthz`)

**User Story:** Como operador do cluster Kubernetes, quero um endpoint de liveness que responda imediatamente, para que o kubelet possa detectar se o processo da API está travado ou morto.

#### Critérios de aceitação

1. WHEN uma requisição `GET /healthz` é recebida, THE API SHALL retornar HTTP 200 com um corpo JSON `{"status": "ok"}` sem realizar nenhuma verificação de dependências externas (banco de dados, cache ou outros serviços).
2. THE API SHALL responder ao `GET /healthz` em menos de 100 ms independentemente do estado do banco de dados ou de qualquer outra dependência externa.

   > **Não verificado (7.2):** o critério de latência (< 100 ms) não foi medido por testes automatizados. O endpoint é trivial (retorna dict imediato) e não consulta o banco, o que satisfaz a intenção.

---

### Requisito 8 — Probe de readiness (`GET /readyz`)

**User Story:** Como operador do cluster Kubernetes, quero um endpoint de readiness que verifique a conectividade com o banco de dados, para que o kubelet não encaminhe tráfego para um pod que ainda não está pronto para servir requisições.

#### Critérios de aceitação

1. WHEN uma requisição `GET /readyz` é recebida e o banco de dados responde ao `SELECT 1` dentro de 2 segundos, THE API SHALL retornar HTTP 200 com um corpo JSON `{"status": "ok", "db": "ok"}`.
2. IF o banco de dados não responder ao `SELECT 1` dentro de 2 segundos ou retornar erro, THEN THE API SHALL retornar HTTP 503 com um corpo JSON `{"status": "error", "db": "unavailable"}`.
3. WHEN o timeout de 2 segundos for atingido na verificação do banco, THE API SHALL cancelar a query pendente e retornar HTTP 503 imediatamente.

   > **Não verificado (8.3):** o cancelamento explícito da query pendente ao atingir o timeout não foi verificado. O `repo.ping(timeout=2)` usa `pool.connection(timeout=2)` (`api/app/repository.py`), que aguarda uma conexão livre por 2s. Se o banco não responder, `PoolTimeout` é levantado e tratado pelo handler global como 503. O comportamento de cancelamento da query (vs. timeout na aquisição de conexão) não foi confirmado em execução.

---

### Requisito 9 — Exposição de métricas Prometheus (`GET /metrics`)

**User Story:** Como SRE responsável pela observabilidade, quero que a API exponha as métricas no formato Prometheus, para que o Prometheus possa coletar os dados e alimentar os dashboards do Grafana.

#### Critérios de aceitação

1. WHEN uma requisição `GET /metrics` é recebida, THE API SHALL retornar HTTP 200 com as métricas no formato texto do Prometheus (`Content-Type: text/plain; version=0.0.4`).
2. THE API SHALL expor as seguintes métricas manuais: `kiro_link_redirect_duration_seconds` (Histogram), `kiro_link_clicks_total` (Counter), `kiro_links_created_total` (Counter) e `kiro_active_links` (Gauge observável).
3. THE API SHALL expor a métrica automática `http_server_request_duration_seconds` (Histogram) com os atributos `http_request_method`, `http_route` e `http_response_status_code`.
4. THE API SHALL usar o template da rota como valor de `http_route` (por exemplo, `/r/{short_code}`), nunca o valor real do caminho (por exemplo, `/r/abc123`).

   > **Atendido com divergência (9.4):** o template é `/r/{short_code}`, não `/{shortCode}` como o critério original exemplificava. Confirmado pelo teste `test_telemetry.py` (`assert 'http_route="/r/{short_code}"' in text`).

5. THE API SHALL proibir o uso de `short_code`, URL original, IP ou `user_agent` como atributos ou labels de qualquer métrica.
6. THE Gauge `kiro_active_links` SHALL ser atualizado por meio de um callback observável que executa `SELECT count(*) FROM active_links` a cada coleta pelo Prometheus.
7. THE Histogram `kiro_link_redirect_duration_seconds` SHALL ser configurado com os buckets `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0]` em segundos.

---

### Requisito 10 — Módulo de telemetria e traces distribuídos

**User Story:** Como SRE responsável pela observabilidade, quero que a API inicialize a telemetria por meio de um módulo único e encapsulado, para que a configuração de traces e métricas seja centralizada e substituível sem alterar o código de negócio.

#### Critérios de aceitação

1. THE API SHALL concentrar a inicialização de todos os instrumentos OpenTelemetry (SDK, exporters, métricas e traces) em um módulo único.

   > **Atendido com divergência (10.1):** o módulo está em `api/app/telemetry.py`, não em `api/src/telemetry/` como o critério original previa.

2. THE Telemetry_Module SHALL ser inicializado antes de o servidor HTTP abrir para receber requisições; nenhuma requisição deve ser atendida sem que a instrumentação esteja ativa.
3. THE API SHALL propagar o contexto de trace usando o protocolo W3C Trace Context (`traceparent`, `tracestate`); as chamadas ao banco de dados devem gerar spans filhos do span pai da requisição em curso.
4. THE API SHALL configurar `service.name` como `kiro-api` por meio da variável de ambiente `OTEL_SERVICE_NAME`.
5. THE API SHALL exportar os dados de telemetria para o endpoint definido pela variável de ambiente `OTEL_EXPORTER_OTLP_ENDPOINT`, sem fixar o endereço no código.
6. THE API SHALL configurar o sampler de traces com o valor da variável de ambiente `OTEL_TRACES_SAMPLER` (padrão: `parentbased_always_on`).
7. WHEN um endpoint é atendido, THE API SHALL criar spans de servidor com os nomes `POST /api/links`, `GET /r/{short_code}` ou `GET /api/links`, conforme o endpoint atendido.

   > **Atendido com divergência (10.7):** o nome do span de redirect é `GET /r/{short_code}`, não `GET /{shortCode}` como o critério original previa. Confirmado pelo teste `test_telemetry.py` (`assert root.name == "GET /r/{short_code}"`).

8. WHEN o parâmetro `shortCode` é extraído com sucesso do caminho da requisição, THE API SHALL adicionar o atributo `kiro.link.short_code` ao span do servidor correspondente.
9. THE Telemetry_Module SHALL expor os contadores e histogramas definidos no Requisito 9 por meio de uma interface própria, de forma que nenhum módulo de serviço importe símbolos diretamente do SDK OpenTelemetry.

---

### Requisito 11 — Ambiente local de desenvolvimento

**User Story:** Como desenvolvedor da equipe, quero conseguir executar a API e o banco de dados localmente com um único comando, para que o ciclo de desenvolvimento e teste seja rápido e reproduzível.

#### Critérios de aceitação

1. THE API SHALL ser empacotada por um `Dockerfile` multi-stage localizado em `api/Dockerfile`, com uma etapa de build (instalação de dependências e compilação, se aplicável) e uma etapa final de produção com imagem base mínima.
2. THE Repository SHALL incluir um arquivo `docker-compose.yml` que inicie a API e um container PostgreSQL com inicialização automática do schema.

   > **Atendido com divergência (11.2):** o `docker-compose.yml` está na raiz do repositório (`docker-compose.yml`), não em `api/docker-compose.yml` como o critério original previa. O schema é aplicado pela própria API no startup (não por `docker-entrypoint-initdb.d`).

3. WHEN o `docker compose up` é executado e o PostgreSQL finaliza sua inicialização, THE Environment SHALL estar funcional com a API respondendo ao `GET /healthz` com HTTP 200 e ao `GET /readyz` com HTTP 200 dentro de 60 segundos.
4. THE `docker-compose.yml` SHALL definir variáveis de ambiente com valores placeholder para desenvolvimento local; credenciais reais não devem constar em nenhum arquivo versionado no repositório.
5. THE `Dockerfile` SHALL executar a aplicação com um usuário sem privilégios de root na etapa de produção.

   > **Atendido (11.5):** `api/Dockerfile` usa `USER 10001` (UID sem nome explícito), `runAsNonRoot: true` e `runAsUser: 10001` nos manifests Kubernetes (`k8s/api/deployment.yaml`).

---

## Decisões resolvidas

| # orig. | Decisão | Resultado | Evidência |
|---|---|---|---|
| D-03 (pendente no original) | Tecnologia da API | Python 3.12, FastAPI 0.143, psycopg 3.3. Substituiu Node.js/Fastify. | `api/requirements.txt`, `api/app/main.py`, SSOT.md (D-03 Confirmada) |
| D-05 (pendente no original) | Banco de dados | PostgreSQL 16, schema em `api/app/schema.sql` aplicado com `pg_advisory_lock`. | `api/app/schema.sql`, `api/app/db.py`, SSOT.md (D-05 Confirmada) |
| D-06 (proposta no original) | Formato do código curto | Aleatório: 7 caracteres `[a-z0-9]` (configurável). Personalizado: 3–50 `[A-Za-z0-9_-]`. Redirect canônico em `/r/{code}`. | `api/app/shortcode.py`, `api/app/config.py`, `api/app/main.py` |
| D-11 (proposta no original) | Contrato da API | `openapi.yaml` v1.2.0. Campos de resposta confirmados: `short_code`, `short_url` (`{BASE_URL}/r/{code}`), `original_url`, `clicks`, `created_at`, `expires_at`. Sem `qr_code_url`. | `openapi.yaml`, `api/app/main.py` |
| Cache (Req. 2) | Cache Cache-Aside | **Não implementado.** Latência do redirect mitigada por `synchronous_commit off` no CTE de clique. | `api/app/repository.py`, README.md |
| `ip_address` | Gravação do IP no clique | Campo existe no schema mas a API não grava (LGPD). | `api/app/schema.sql` (comentário), `api/app/repository.py` (`register_click`) |

---

## Extensões além do spec

Os itens abaixo foram implementados além do escopo definido nos requisitos originais.

- **`GET /api/ranking`**: ranking dos links mais clicados numa janela de tempo configurável (`hours`, padrão 24h, máx 720h; `limit`, padrão 10, máx 50). Implementado em `api/app/main.py` e `api/app/repository.py` (`ranking`). Contrato em `openapi.yaml`. Coberto por `test_api.py` (`test_ranking_orders_by_clicks_in_window`).
- **Série de cliques por hora em `GET /api/links/{code}/stats`**: o campo `last_24h` retorna uma lista de `{hour, clicks}` das últimas 24 horas. Implementado em `api/app/repository.py` (`clicks_by_hour`) e `api/app/main.py`. Coberto por `test_api.py` (`test_stats_has_hourly_series_and_referer_is_recorded`).
- **Campo `referer` em `click_events`**: a API grava o header `Referer` (se presente) a cada clique, além do `user_agent`. Adicionado via `ALTER TABLE` no `api/app/schema.sql`. Lido em `api/app/main.py` e gravado em `api/app/repository.py` (`register_click`). Coberto por `test_api.py` (`test_stats_has_hourly_series_and_referer_is_recorded`).
- **Métrica `kiro.feature.used`** (Counter, atributo `feature`): rastreia o uso das features `stats`, `ranking` e `qrcode`. Implementado em `api/app/telemetry.py` e `api/app/main.py`. Coberto por `test_telemetry.py`.
- **Parâmetro `?via=qr` no redirect**: quando presente com valor `qr`, o redirect incrementa `kiro_feature_used_total{feature="qrcode"}`. Implementado em `api/app/main.py`. Coberto por `test_telemetry.py` (`test_qrcode_access_metric`).
- **Códigos reservados**: `custom_code` não pode ser um caminho da própria API. Lista em `api/app/shortcode.py` (`RESERVED_CODES`). Coberto por `test_api.py` (`test_create_rejects_invalid_input`).
- **`Cache-Control: no-store` no redirect 302**: o redirect inclui o header `Cache-Control: no-store` (`api/app/main.py`, `RedirectResponse`).
