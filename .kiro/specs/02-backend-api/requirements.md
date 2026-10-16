# Requirements Document

## Introduction

Este documento especifica os requisitos da API do encurtador de links, o componente responsável por criar códigos curtos, redirecionar usuários, persistir dados e expor métricas e traces de observabilidade.

A API residirá no diretório `api/` do repositório e deverá implementar todos os endpoints definidos em `openapi.yaml`, respeitando o schema definido em `db-schema.sql` e o contrato de telemetria definido em `otel-metrics-spec.md`.

As decisões D-03 (tecnologia da API) e D-05 (banco de dados) ainda estão Pendentes no SSOT. Para efeito desta especificação, os requisitos assumem Node.js LTS com Express ou Fastify e PostgreSQL, conforme solicitação explícita do responsável pelo backend. Essa escolha deve ser confirmada pela equipe antes da implementação.

---

## Glossary

- **API**: o serviço backend que implementa os endpoints definidos em `openapi.yaml`.
- **Link**: o par formado por um código curto e a URL original correspondente, armazenado na tabela `links`.
- **Código curto (short_code)**: identificador alfanumérico único que representa um link. Pode ser gerado aleatoriamente ou fornecido pelo usuário (vanity).
- **Código vanity (custom_code)**: código curto definido explicitamente pelo usuário na criação do link.
- **URL original**: a URL de destino completa para a qual o link curto redireciona.
- **Link ativo**: link cujo campo `expires_at` é nulo ou é posterior ao momento atual, conforme a view `active_links` do schema.
- **Link expirado**: link cujo campo `expires_at` é anterior ou igual ao momento atual.
- **Repositório**: camada de acesso a dados que encapsula as consultas ao banco de dados.
- **Pool de conexões**: conjunto gerenciado de conexões ao PostgreSQL reutilizadas entre requisições.
- **Cache**: armazenamento em memória usado para evitar consultas repetidas ao banco no fluxo de redirecionamento.
- **Cache-Aside**: estratégia em que a API consulta o cache antes do banco e popula o cache com o resultado caso ele esteja ausente.
- **Módulo de telemetria (Telemetry_Module)**: módulo localizado em `api/src/telemetry/` que inicializa os instrumentos OpenTelemetry (métricas e traces) e os expõe para uso pelo restante da aplicação.
- **Probe de liveness**: endpoint `GET /healthz` que indica se o processo da API está vivo.
- **Probe de readiness**: endpoint `GET /readyz` que indica se a API está pronta para receber tráfego.
- **click_event**: registro de um acesso a um link, armazenado na tabela `click_events`.
- **QR Code**: imagem codificada gerada a partir da URL curta, retornada na criação do link como `qr_code_url`.

---

## Requirements

### Requisito 1 — Persistência e pool de conexões

**User Story:** Como desenvolvedor da equipe, quero que a API gerencie as conexões com o PostgreSQL por meio de um pool, para que as conexões sejam reutilizadas entre requisições e o banco não seja sobrecarregado.

#### Critérios de aceitação

1. THE API SHALL gerenciar as conexões ao PostgreSQL por meio de um pool de conexões configurável pelas variáveis de ambiente `DATABASE_URL` (connection string completa) ou pelas variáveis individuais `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` e `DB_PASSWORD`; o tamanho mínimo do pool é definido por `DB_POOL_MIN` (padrão 1) e o máximo por `DB_POOL_MAX` (padrão 10, máximo permitido 100).
2. THE API SHALL encapsular todas as consultas ao banco em um repositório de links e em um repositório de eventos de clique, sem consultas SQL dispersas nas camadas de rota ou de serviço.
3. WHEN a aplicação é inicializada, THE API SHALL verificar a conectividade com o PostgreSQL executando `SELECT 1` com timeout de 5 segundos antes de abrir o servidor HTTP para receber requisições.
4. IF a conexão com o banco falhar durante a inicialização, THEN THE API SHALL registrar o erro no log e encerrar o processo com código de saída não-zero.
5. IF o banco de dados se tornar inacessível durante o atendimento de uma requisição, THEN THE API SHALL retornar HTTP 503 e registrar o erro no log, sem encerrar o processo.
6. THE API SHALL executar todas as consultas de leitura de links ativos e de redirecionamento exclusivamente por meio da view `active_links`, nunca diretamente na tabela `links`.

---

### Requisito 2 — Cache de redirecionamento (Cache-Aside)

**User Story:** Como usuário que acessa um link curto, quero que o redirecionamento seja respondido com baixa latência mesmo sob alta carga, para que minha navegação não seja interrompida.

#### Critérios de aceitação

1. THE API SHALL implementar uma camada de cache Cache-Aside em memória para armazenar os resultados de consultas de redirecionamento, com tamanho máximo configurável pela variável de ambiente `CACHE_MAX_SIZE` (padrão 1000 entradas) e TTL padrão configurável pela variável `CACHE_DEFAULT_TTL_SECONDS` (padrão 300 segundos).
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
6. THE API SHALL retornar os links dentro do campo `items` ordenados por `created_at` descendente.

---

### Requisito 4 — Criação de link curto (`POST /api/links`)

**User Story:** Como usuário do frontend, quero criar links curtos a partir de URLs longas, com a opção de definir um código personalizado e uma data de expiração, para que eu possa compartilhar e controlar os links criados.

#### Critérios de aceitação

1. WHEN uma requisição `POST /api/links` é recebida com `original_url` válida, THE API SHALL criar um registro na tabela `links` e retornar HTTP 201 com os campos `short_code`, `short_url` (no formato `{BASE_URL}/{short_code}`), `qr_code_url`, `created_at` e `expires_at`.
2. THE API SHALL validar que `original_url` é uma URI absoluta com esquema `http` ou `https`; IF a validação falhar, THEN THE API SHALL retornar HTTP 400 com uma mensagem de erro descritiva.
3. WHERE `custom_code` é fornecido no corpo da requisição, THE API SHALL validar que o valor contém apenas caracteres alfanuméricos, hífens e underscores, com comprimento entre 3 e 50 caracteres; IF a validação falhar, THEN THE API SHALL retornar HTTP 400 com uma mensagem de erro descritiva.
4. WHERE `custom_code` é fornecido e já existe na tabela `links`, THE API SHALL retornar HTTP 409 com um corpo JSON contendo uma mensagem de erro indicando que o código já está em uso, sem criar um novo registro.
5. WHERE `custom_code` não é fornecido, THE API SHALL gerar um código curto aleatório com comprimento configurável pela variável `SHORT_CODE_LENGTH` (padrão 7) e alfabeto configurável por `SHORT_CODE_ALPHABET` (padrão: letras minúsculas + dígitos), realizando até 5 tentativas de geração para garantir unicidade; IF todas as tentativas colidirem, THEN THE API SHALL retornar HTTP 503 sem persistir nenhum registro.
6. WHERE `expires_at` é fornecido no corpo da requisição, THE API SHALL validar que o valor é uma data-hora ISO 8601 estritamente posterior ao instante de recebimento da requisição; IF a validação falhar, THEN THE API SHALL retornar HTTP 400 com uma mensagem de erro descritiva.
7. WHEN um link é criado com sucesso, THE API SHALL incrementar o contador `kiro.links.created` com o atributo `kind` igual a `vanity` se `custom_code` foi fornecido, ou `random` caso contrário.
8. WHEN um link é criado com sucesso, THE API SHALL construir e retornar o campo `qr_code_url` no formato `{BASE_URL}/qr/{short_code}`.

---

### Requisito 5 — Redirecionamento (`GET /{shortCode}`)

**User Story:** Como usuário que acessa um link curto, quero ser redirecionado para a URL original de forma rápida e correta, com tratamento adequado para links inexistentes ou expirados.

#### Critérios de aceitação

1. WHEN uma requisição `GET /{shortCode}` é recebida com um `shortCode` de comprimento entre 3 e 50 caracteres contendo apenas caracteres alfanuméricos, hífens e underscores, e o código corresponde a um link ativo, THE API SHALL retornar HTTP 302 com o header `Location` apontando para a `original_url` do link.
2. WHEN uma requisição `GET /{shortCode}` é recebida e o código não existe na tabela `links`, THE API SHALL retornar HTTP 404 com um corpo JSON contendo uma mensagem de erro indicando que o código não foi encontrado.
3. WHEN uma requisição `GET /{shortCode}` é recebida e o link existe mas está expirado, THE API SHALL retornar HTTP 410 com um corpo JSON contendo uma mensagem de erro indicando que o link expirou.
4. WHEN um redirect 302 é emitido, THE API SHALL incrementar a coluna `clicks` na tabela `links` para o link correspondente de forma atômica.
5. WHEN um redirect 302 é emitido, THE API SHALL disparar a inserção de um `click_event` na tabela `click_events` de forma assíncrona e não-bloqueante, incluindo `link_id`, `clicked_at`, `user_agent` (do header `User-Agent`) e `ip_address` (do IP remoto da conexão); IF a inserção assíncrona falhar, THEN THE API SHALL registrar o erro no log sem afetar a resposta HTTP ao usuário.
6. WHEN uma requisição `GET /{shortCode}` é recebida, THE API SHALL registrar a duração da operação (do início da busca até a decisão de resposta) no histograma `kiro.link.redirect.duration` com o atributo `outcome` igual a `found`, `not_found` ou `expired`, conforme o resultado.
7. WHEN um redirect 302 é emitido, THE API SHALL incrementar o contador `kiro.link.clicks` sem atributos adicionais.
8. THE API SHALL incluir o atributo de span `kiro.link.short_code` no span do servidor correspondente à requisição de redirecionamento.
9. IF o incremento de `clicks` na tabela `links` falhar por erro de banco de dados, THEN THE API SHALL retornar HTTP 502 e registrar o erro no log.

---

### Requisito 6 — Estatísticas de link (`GET /api/links/{shortCode}/stats`)

**User Story:** Como usuário do frontend, quero consultar as estatísticas de um link específico, para que eu possa acompanhar o número de acessos e as informações associadas.

#### Critérios de aceitação

1. WHEN uma requisição `GET /api/links/{shortCode}/stats` é recebida e o código existe na tabela `links`, THE API SHALL retornar HTTP 200 com um objeto JSON contendo os campos `short_code`, `original_url`, `clicks`, `created_at` e `expires_at` (null se não definido).
2. WHEN uma requisição `GET /api/links/{shortCode}/stats` é recebida e o código não existe na tabela `links`, THE API SHALL retornar HTTP 404 com um corpo JSON contendo uma mensagem de erro indicando que o código não foi encontrado.
3. THE API SHALL consultar a tabela `links` diretamente (não a view `active_links`) para o endpoint de stats, de forma que links expirados também retornem suas estatísticas.
4. IF o valor de `shortCode` no caminho da requisição não satisfizer o formato definido (comprimento entre 3 e 50 caracteres, apenas alfanuméricos, hífens e underscores), THEN THE API SHALL retornar HTTP 400 com uma mensagem de erro descritiva.

---

### Requisito 7 — Probe de liveness (`GET /healthz`)

**User Story:** Como operador do cluster Kubernetes, quero um endpoint de liveness que responda imediatamente, para que o kubelet possa detectar se o processo da API está travado ou morto.

#### Critérios de aceitação

1. WHEN uma requisição `GET /healthz` é recebida, THE API SHALL retornar HTTP 200 com um corpo JSON `{"status": "ok"}` sem realizar nenhuma verificação de dependências externas (banco de dados, cache ou outros serviços).
2. THE API SHALL responder ao `GET /healthz` em menos de 100 ms independentemente do estado do banco de dados ou de qualquer outra dependência externa.

---

### Requisito 8 — Probe de readiness (`GET /readyz`)

**User Story:** Como operador do cluster Kubernetes, quero um endpoint de readiness que verifique a conectividade com o banco de dados, para que o kubelet não encaminhe tráfego para um pod que ainda não está pronto para servir requisições.

#### Critérios de aceitação

1. WHEN uma requisição `GET /readyz` é recebida e o banco de dados responde ao `SELECT 1` dentro de 2 segundos, THE API SHALL retornar HTTP 200 com um corpo JSON `{"status": "ok", "db": "ok"}`.
2. IF o banco de dados não responder ao `SELECT 1` dentro de 2 segundos ou retornar erro, THEN THE API SHALL retornar HTTP 503 com um corpo JSON `{"status": "error", "db": "unavailable"}`.
3. WHEN o timeout de 2 segundos for atingido na verificação do banco, THE API SHALL cancelar a query pendente e retornar HTTP 503 imediatamente.

---

### Requisito 9 — Exposição de métricas Prometheus (`GET /metrics`)

**User Story:** Como SRE responsável pela observabilidade, quero que a API exponha as métricas no formato Prometheus, para que o Prometheus possa coletar os dados e alimentar os dashboards do Grafana.

#### Critérios de aceitação

1. WHEN uma requisição `GET /metrics` é recebida, THE API SHALL retornar HTTP 200 com as métricas no formato texto do Prometheus (`Content-Type: text/plain; version=0.0.4`).
2. THE API SHALL expor as seguintes métricas manuais: `kiro_link_redirect_duration_seconds` (Histogram), `kiro_link_clicks_total` (Counter), `kiro_links_created_total` (Counter) e `kiro_active_links` (Gauge observável).
3. THE API SHALL expor a métrica automática `http_server_request_duration_seconds` (Histogram) com os atributos `http_request_method`, `http_route` e `http_response_status_code`.
4. THE API SHALL usar o template da rota como valor de `http_route` (por exemplo, `/{shortCode}`), nunca o valor real do caminho (por exemplo, `/abc123`).
5. THE API SHALL proibir o uso de `short_code`, URL original, IP ou `user_agent` como atributos ou labels de qualquer métrica.
6. THE Gauge `kiro_active_links` SHALL ser atualizado por meio de um callback observável que executa `SELECT count(*) FROM active_links` a cada coleta pelo Prometheus.
7. THE Histogram `kiro_link_redirect_duration_seconds` SHALL ser configurado com os buckets `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0]` em segundos.

---

### Requisito 10 — Módulo de telemetria e traces distribuídos

**User Story:** Como SRE responsável pela observabilidade, quero que a API inicialize a telemetria por meio de um módulo único e encapsulado, para que a configuração de traces e métricas seja centralizada e substituível sem alterar o código de negócio.

#### Critérios de aceitação

1. THE API SHALL concentrar a inicialização de todos os instrumentos OpenTelemetry (SDK, exporters, métricas e traces) em um módulo único localizado em `api/src/telemetry/`.
2. THE Telemetry_Module SHALL ser inicializado antes de o servidor HTTP abrir para receber requisições; nenhuma requisição deve ser atendida sem que a instrumentação esteja ativa.
3. THE API SHALL propagar o contexto de trace usando o protocolo W3C Trace Context (`traceparent`, `tracestate`); as chamadas ao banco de dados devem gerar spans filhos do span pai da requisição em curso.
4. THE API SHALL configurar `service.name` como `kiro-api` por meio da variável de ambiente `OTEL_SERVICE_NAME`.
5. THE API SHALL exportar os dados de telemetria para o endpoint definido pela variável de ambiente `OTEL_EXPORTER_OTLP_ENDPOINT`, sem fixar o endereço no código.
6. THE API SHALL configurar o sampler de traces com o valor da variável de ambiente `OTEL_TRACES_SAMPLER` (padrão: `parentbased_always_on`).
7. WHEN um endpoint é atendido, THE API SHALL criar spans de servidor com os nomes `POST /api/links`, `GET /{shortCode}` ou `GET /api/links`, conforme o endpoint atendido.
8. WHEN o parâmetro `shortCode` é extraído com sucesso do caminho da requisição, THE API SHALL adicionar o atributo `kiro.link.short_code` ao span do servidor correspondente.
9. THE Telemetry_Module SHALL expor os contadores e histogramas definidos no Requisito 9 por meio de uma interface própria, de forma que nenhum módulo de serviço importe símbolos diretamente do SDK OpenTelemetry.

---

### Requisito 11 — Ambiente local de desenvolvimento

**User Story:** Como desenvolvedor da equipe, quero conseguir executar a API e o banco de dados localmente com um único comando, para que o ciclo de desenvolvimento e teste seja rápido e reproduzível.

#### Critérios de aceitação

1. THE API SHALL ser empacotada por um `Dockerfile` multi-stage localizado em `api/Dockerfile`, com uma etapa de build (instalação de dependências e compilação, se aplicável) e uma etapa final de produção com imagem base mínima.
2. THE Repository SHALL incluir um arquivo `api/docker-compose.yml` que inicie a API e um container PostgreSQL com inicialização automática do `db-schema.sql`.
3. WHEN o `docker-compose up` é executado e o PostgreSQL finaliza sua inicialização, THE Environment SHALL estar funcional com a API respondendo ao `GET /healthz` com HTTP 200 e ao `GET /readyz` com HTTP 200 dentro de 60 segundos.
4. THE `api/docker-compose.yml` SHALL definir variáveis de ambiente com valores placeholder para desenvolvimento local (por exemplo, `postgres` como senha); credenciais reais não devem constar em nenhum arquivo versionado no repositório.
5. THE `Dockerfile` SHALL executar a aplicação com um usuário sem privilégios de root na etapa de produção.
