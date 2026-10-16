# Implementation Plan: Backend API

## Overview

Este plano decompõe o design da API em tarefas incrementais de código, seguindo a ordem de dependências definida no `design.md`: infraestrutura base → telemetria → persistência → cache → serviços → rotas → Docker. Cada tarefa é verificável de forma independente e referencia os requisitos correspondentes.

Tarefas marcadas com `*` são opcionais (testes automatizados) e podem ser adiadas para uma iteração posterior sem bloquear o funcionamento da aplicação.

---

## Tasks

- [ ] 1. Fase 1 — Setup do projeto
  - [ ] 1.1 Inicializar o projeto Node.js com TypeScript
    - Criar o diretório `api/` na raiz do repositório
    - Executar `npm init -y` e instalar TypeScript como dependência de desenvolvimento
    - Criar `tsconfig.json` com `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`, `outDir: dist`, `rootDir: src`, `strict: true`
    - Adicionar scripts ao `package.json`: `build` (`tsc`), `dev` (`ts-node src/server.ts`), `test` (`vitest --run`)
    - _Requisitos: 11.1_
    - **Verificação:** `npm run build` conclui sem erros em um arquivo `src/index.ts` vazio.

  - [ ] 1.2 Instalar dependências de produção
    - Instalar: `fastify@^5.0.0`, `pg@^8.13.0`, `lru-cache@^11.0.0`, `nanoid@^5.0.0`, `zod@^3.23.0`
    - Instalar pacotes OpenTelemetry: `@opentelemetry/sdk-node@^0.202.0`, `@opentelemetry/api@^1.9.0`, `@opentelemetry/auto-instrumentations-node@^0.52.0`, `@opentelemetry/exporter-trace-otlp-proto@^0.202.0`, `@opentelemetry/exporter-metrics-otlp-proto@^0.202.0`
    - Instalar: `prom-client@^15.1.3`
    - Instalar tipos e ferramentas de dev: `@types/node`, `@types/pg`, `typescript`, `vitest`, `fast-check`, `supertest`, `@types/supertest`
    - _Requisitos: 11.1_
    - **Verificação:** `npm ls` lista todos os pacotes sem erros de dependência.

  - [ ] 1.3 Criar a estrutura de diretórios do projeto
    - Criar os diretórios: `src/telemetry/`, `src/db/`, `src/cache/`, `src/services/`, `src/routes/`, `src/utils/`, `tests/unit/cache/`, `tests/unit/services/`, `tests/unit/utils/`, `tests/integration/routes/`
    - Criar arquivos `.gitkeep` nos diretórios de teste para preservar a estrutura no Git
    - _Requisitos: 11.1_
    - **Verificação:** `ls -R src/` e `ls -R tests/` exibem a hierarquia completa esperada.

  - [ ] 1.4 Criar `src/config.ts` com leitura e validação de variáveis de ambiente
    - Definir schema zod com todos os campos da tabela de variáveis do `design.md`: `DATABASE_URL`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_POOL_MIN`, `DB_POOL_MAX`, `BASE_URL`, `PORT`, `SHORT_CODE_LENGTH`, `SHORT_CODE_ALPHABET`, `CACHE_MAX_SIZE`, `CACHE_DEFAULT_TTL_SECONDS`, `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_PROPAGATORS`, `OTEL_TRACES_SAMPLER`
    - O módulo deve encerrar o processo com `process.exit(1)` e mensagem descritiva se uma variável obrigatória estiver ausente ou inválida
    - Exportar objeto `config` tipado
    - _Requisitos: 1.1, 10.5_
    - **Verificação:** executar o módulo sem variáveis obrigatórias deve imprimir mensagem de erro e encerrar com código não-zero. Com variáveis válidas, o objeto `config` deve estar disponível.

- [ ] 2. Fase 2 — Módulo de telemetria
  - [ ] 2.1 Criar `src/telemetry/sdk.ts` com a configuração do NodeSDK
    - Importar `NodeSDK` de `@opentelemetry/sdk-node`
    - Importar `getNodeAutoInstrumentations` de `@opentelemetry/auto-instrumentations-node`
    - Importar `OTLPTraceExporter` de `@opentelemetry/exporter-trace-otlp-proto`
    - Importar `OTLPMetricExporter` e `PeriodicExportingMetricReader` de `@opentelemetry/exporter-metrics-otlp-proto` e `@opentelemetry/sdk-metrics`
    - Exportar a função `createSdk(): NodeSDK` conforme o design
    - O endpoint OTLP deve ser lido exclusivamente de `OTEL_EXPORTER_OTLP_ENDPOINT` — sem valor fixo no código
    - _Requisitos: 10.1, 10.2, 10.5, 10.6_
    - **Verificação:** `npm run build` compila sem erros de tipo no módulo.

  - [ ] 2.2 Criar `src/telemetry/instruments.ts` com os instrumentos manuais
    - Importar `metrics` de `@opentelemetry/api`
    - Criar Counter `kiro.link.clicks` (sem atributos)
    - Criar Counter `kiro.links.created` com atributo `kind: 'random' | 'vanity'`
    - Criar Histogram `kiro.link.redirect.duration` com `unit: 's'` e buckets explícitos `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0]`
    - Criar Gauge observável `kiro.active_links` com callback que executa `SELECT count(*) FROM active_links` (injetar a função de query como parâmetro para testabilidade)
    - _Requisitos: 9.2, 9.6, 9.7, 10.9_
    - **Verificação:** `npm run build` compila sem erros. Os nomes dos instrumentos conferem com `otel-metrics-spec.md`.

  - [ ] 2.3 Criar `src/telemetry/index.ts` com `initTelemetry()` e interface pública
    - Exportar `initTelemetry()` que chama `createSdk().start()`
    - Exportar as funções da interface pública: `recordRedirectDuration(durationSeconds, outcome)`, `incrementLinkClicks()`, `incrementLinksCreated(kind)`
    - Garantir que nenhuma exportação deste módulo expõe tipos do SDK OTel diretamente (`NodeSDK`, `Counter`, `Histogram`, etc.)
    - _Requisitos: 10.1, 10.2, 10.9_
    - **Verificação:** nenhum arquivo fora de `src/telemetry/` deve importar de `@opentelemetry/api` ou `@opentelemetry/sdk-node`. Verificar com `grep -r "@opentelemetry" src/ --include="*.ts" | grep -v "src/telemetry/"` — resultado deve ser vazio.

  - [ ]* 2.4 Escrever smoke test para o módulo de telemetria
    - Verificar que `initTelemetry()` pode ser chamado sem lançar exceções quando as variáveis de ambiente estão presentes
    - Verificar que as funções da interface pública existem e são callable
    - _Requisitos: 10.1, 10.2_

- [ ] 3. Fase 3 — Persistência
  - [ ] 3.1 Criar `src/db/pool.ts` com o pool de conexões PostgreSQL
    - Instanciar `pg.Pool` lendo `DATABASE_URL` (se presente) ou as variáveis individuais `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` de `config`
    - Configurar `min` e `max` do pool a partir de `DB_POOL_MIN` e `DB_POOL_MAX`
    - Exportar a função `checkDbConnectivity()` que executa `SELECT 1` com timeout de 5 segundos; em caso de falha, lança erro
    - Exportar o pool para uso pelos repositórios
    - _Requisitos: 1.1, 1.3, 1.4_
    - **Verificação:** com banco disponível, `checkDbConnectivity()` resolve sem erros. Com banco indisponível, rejeita com erro descritivo.

  - [ ] 3.2 Criar `src/db/linksRepository.ts` com as queries de links
    - Implementar `findByShortCode(shortCode)`: usa view `active_links`, retorna `LinkRow | null`
    - Implementar `findByShortCodeDirect(shortCode)`: usa tabela `links` diretamente, retorna `LinkRow | null`
    - Implementar `listPaginated(limit, offset)`: usa `COUNT(*) OVER()` para retornar `{ rows: LinkRow[], total: number }`
    - Implementar `insertLink(shortCode, originalUrl, expiresAt)`: retorna `LinkRow`
    - Implementar `incrementClicks(shortCode)`: UPDATE atômico, lança erro se nenhuma linha for afetada
    - Implementar `existsByShortCode(shortCode)`: usado pelo gerador de código curto para verificar colisões
    - Exportar interface `LinkRow` conforme o design
    - _Requisitos: 1.2, 1.6, 3.1, 4.1, 5.4, 6.1, 6.3_
    - **Verificação:** as funções compilam sem erros de tipo e as queries SQL conferem com as definidas no `design.md`.

  - [ ] 3.3 Criar `src/db/clicksRepository.ts` com inserção de eventos de clique
    - Implementar `insertClickEvent(linkId, clickedAt, userAgent, ipAddress)`: INSERT em `click_events`
    - Exportar interface `ClickEventInsert` conforme o design
    - _Requisitos: 5.5_
    - **Verificação:** o módulo compila sem erros de tipo.

- [ ] 4. Fase 4 — Cache
  - [ ] 4.1 Criar `src/cache/redirectCache.ts` com a lógica Cache-Aside
    - Instanciar `LRUCache` com `max` de `CACHE_MAX_SIZE` e `ttl` de `CACHE_DEFAULT_TTL_SECONDS * 1000`
    - Implementar e exportar `computeTtl(expiresAt: Date | null, defaultTtlSeconds: number): number` conforme o design: `max(1, expires_at - now)` em segundos
    - Implementar `get(shortCode)`: retorna `CacheValue | undefined`
    - Implementar `set(shortCode, value, ttlMs?)`: armazena com TTL calculado
    - Exportar tipo `CacheValue` conforme o design
    - Garantir que links expirados **não** são armazenados no cache
    - Garantir que marcadores de ausência (`{type: 'not_found'}`) são armazenados com TTL fixo de 60 000 ms
    - _Requisitos: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
    - **Verificação:** `npm run build` compila sem erros.

  - [ ]* 4.2 Escrever testes de propriedade para `redirectCache.ts` (Properties 1–4)
    - **Property 1 — Cache hit evita consulta ao repositório:** para qualquer `shortCode` e `originalUrl` válidos previamente inseridos no cache, chamadas subsequentes devem retornar o valor sem invocar nenhuma função de I/O
    - **Validates: Requisito 2.2**
    - **Property 2 — Cache miss popula o cache:** para qualquer `shortCode` não presente no cache, após a primeira chamada que popula, a segunda chamada não deve invocar o repositório
    - **Validates: Requisito 2.3**
    - **Property 3 — TTL respeita expiração do link:** para qualquer `expiresAt` futuro com delta em segundos, `computeTtl(expiresAt, 300)` deve retornar `max(1, delta)`
    - **Validates: Requisito 2.4**
    - **Property 4 — Marcador de ausência para código inexistente:** após `set(code, {type:'not_found'})`, `get(code)` deve retornar `{type:'not_found'}` sem consultar repositório
    - **Validates: Requisito 2.5**

- [ ] 5. Fase 5 — Utilitários e serviços
  - [ ] 5.1 Criar `src/utils/shortCode.ts` com geração de código curto
    - Importar `customAlphabet` de `nanoid`
    - Implementar `generateShortCode(checkExists: (code: string) => Promise<boolean>): Promise<string>`
    - Usar `SHORT_CODE_LENGTH` e `SHORT_CODE_ALPHABET` de `config`
    - Realizar até 5 tentativas; se todas colidirem, lançar `CodeGenerationError`
    - Exportar a classe de erro `CodeGenerationError`
    - _Requisitos: 4.5_
    - **Verificação:** `npm run build` compila sem erros. Com `checkExists` sempre retornando `false`, gera código no formato correto na primeira tentativa.

  - [ ]* 5.2 Escrever testes de propriedade para `shortCode.ts` (Property 12)
    - **Property 12 — Código gerado respeita alfabeto e comprimento:** para qualquer chamada com `checkExists` retornando `false`, o `short_code` retornado deve ter exatamente `SHORT_CODE_LENGTH` caracteres pertencentes ao `SHORT_CODE_ALPHABET`
    - **Validates: Requisito 4.5**

  - [ ] 5.3 Criar `src/services/shortenService.ts`
    - Implementar `createLink({ originalUrl, customCode?, expiresAt? })`:
      - Validar `originalUrl` como URI absoluta `http`/`https` com zod; lançar `ValidationError` com código `invalid_url` se inválida
      - Se `customCode` fornecido: validar formato `[a-zA-Z0-9_-]`, comprimento 3–50; lançar `ValidationError` com código `invalid_custom_code` se inválido
      - Validar `expiresAt` como ISO 8601 estritamente futuro se fornecido; lançar `ValidationError` com código `invalid_expires_at` se inválido
      - Se `customCode` fornecido: tentar INSERT; capturar violação UNIQUE e lançar `ConflictError`
      - Se `customCode` ausente: chamar `generateShortCode(linksRepository.existsByShortCode)`
      - Chamar `telemetry.incrementLinksCreated(kind)` após inserção bem-sucedida
      - Retornar `LinkRow`
    - _Requisitos: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_
    - **Verificação:** `npm run build` compila. Testes manuais com `curl` após a aplicação estar de pé (Fase 6).

  - [ ]* 5.4 Escrever testes de propriedade para `shortenService.ts` (Properties 10–11, 13)
    - **Property 10 — URL inválida resulta em ValidationError:** para qualquer string que não seja URI absoluta `http`/`https`, `createLink` deve lançar `ValidationError` com código `invalid_url`
    - **Validates: Requisito 4.2**
    - **Property 11 — `custom_code` com formato inválido resulta em ValidationError:** para qualquer string com caracteres fora de `[a-zA-Z0-9_-]` ou comprimento fora de [3, 50], `createLink` deve lançar `ValidationError` com código `invalid_custom_code`
    - **Validates: Requisito 4.3**
    - **Property 13 — `qr_code_url` é sempre BASE_URL + "/qr/" + short_code:** para qualquer link criado com sucesso, o campo `qr_code_url` deve ser `config.baseUrl + "/qr/" + short_code`
    - **Validates: Requisito 4.8**

  - [ ] 5.5 Criar `src/services/redirectService.ts`
    - Implementar `redirect(shortCode)`:
      - Consultar `redirectCache.get(shortCode)`
      - HIT `found` → retornar `originalUrl` sem consultar banco
      - HIT `not_found` → lançar `NotFoundError`
      - HIT `expired` → lançar `GoneError`
      - MISS → consultar `linksRepository.findByShortCode(shortCode)` (via `active_links`)
        - Nulo → armazenar `{type:'not_found'}` com TTL 60s → lançar `NotFoundError`
        - Expirado (linha existe em `links` mas não em `active_links`) → lançar `GoneError` sem armazenar no cache
        - Ativo → calcular TTL com `computeTtl`, armazenar no cache, retornar `originalUrl`
      - Chamar `linksRepository.incrementClicks(shortCode)` atomicamente; em falha lançar `UpstreamError`
      - Disparar `clicksRepository.insertClickEvent(...)` de forma assíncrona (`void promise`); logar erro sem relançar
      - Chamar `telemetry.incrementLinkClicks()` após redirect bem-sucedido
    - Exportar classes `NotFoundError`, `GoneError`, `UpstreamError`
    - _Requisitos: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.9_
    - **Verificação:** `npm run build` compila sem erros.

  - [ ]* 5.6 Escrever testes de propriedade para `redirectService.ts` (Properties 14–16)
    - **Property 14 — Redirect retorna URL correta para link ativo:** para qualquer link ativo no repositório mock, `redirect(shortCode)` deve retornar a `originalUrl` correspondente
    - **Validates: Requisito 5.1**
    - **Property 15 — Redirect lança NotFoundError para código inexistente:** para qualquer `shortCode` não presente no repositório mock, `redirect` deve lançar `NotFoundError`
    - **Validates: Requisito 5.2**
    - **Property 16 — Clicks incrementa em 1 a cada redirect bem-sucedido:** para qualquer link ativo, após N chamadas bem-sucedidas, `incrementClicks` deve ter sido chamado exatamente N vezes
    - **Validates: Requisito 5.4**

  - [ ] 5.7 Criar `src/services/listService.ts`
    - Implementar `list({ limit, offset })`:
      - Chamar `linksRepository.listPaginated(limit, offset)`
      - Construir `short_url` como `config.baseUrl + "/" + short_code` para cada item
      - Retornar `{ total: number, items: ListItem[] }`
    - _Requisitos: 3.1, 3.5_
    - **Verificação:** `npm run build` compila sem erros.

  - [ ]* 5.8 Escrever testes de propriedade para `listService.ts` (Properties 5–9)
    - **Property 5 — Paginação retorna subconjunto correto:** para qualquer N links e parâmetros `limit` (1–200) e `offset` (0–N) válidos, `list` deve retornar `total = N` e `items.length = min(limit, max(0, N - offset))`
    - **Validates: Requisitos 3.1, 3.2**
    - **Property 8 — `short_url` é sempre BASE_URL + "/" + short_code:** para qualquer item retornado, `short_url` deve ser igual a `config.baseUrl + "/" + item.short_code`
    - **Validates: Requisito 3.5**
    - **Property 9 — Itens em ordem decrescente de `created_at`:** para qualquer lista com `created_at` distintos, os `items` devem estar em ordem estritamente decrescente
    - **Validates: Requisito 3.6**

  - [ ] 5.9 Criar `src/services/statsService.ts`
    - Implementar `getStats(shortCode)`:
      - Chamar `linksRepository.findByShortCodeDirect(shortCode)` (tabela `links`, inclui expirados)
      - Se nulo → lançar `NotFoundError`
      - Retornar `LinkRow`
    - _Requisitos: 6.1, 6.2, 6.3_
    - **Verificação:** `npm run build` compila sem erros.

  - [ ]* 5.10 Escrever testes de propriedade para `statsService.ts` (Property 17)
    - **Property 17 — Stats retorna campos corretos para qualquer link existente:** para qualquer link existente (ativo ou expirado) no repositório mock, `getStats` deve retornar HTTP 200 com `short_code`, `original_url`, `clicks`, `created_at` e `expires_at` iguais aos valores armazenados
    - **Validates: Requisito 6.1**

- [ ] 6. Checkpoint — Verificar que a compilação está limpa
  - Executar `npm run build` na raiz de `api/`; garantir zero erros TypeScript.
  - Executar `grep -r "@opentelemetry" src/ --include="*.ts" | grep -v "src/telemetry/"` — resultado deve ser vazio (nenhum módulo externo ao telemetry importa o SDK).
  - Perguntar ao usuário se há dúvidas antes de avançar para as rotas.

- [ ] 7. Fase 6 — Rotas e composição da aplicação
  - [ ] 7.1 Criar `src/routes/health.ts`
    - Registrar `GET /healthz`: retornar `200 {"status":"ok"}` sem consultar dependências externas; resposta em menos de 100 ms
    - Registrar `GET /readyz`: executar `pool.query('SELECT 1')` com timeout de 2 000 ms; retornar `200 {"status":"ok","db":"ok"}` ou `503 {"status":"error","db":"unavailable"}`; cancelar query pendente ao atingir timeout
    - Registrar `GET /metrics`: retornar o output do `prom-client` com `Content-Type: text/plain; version=0.0.4`
    - _Requisitos: 7.1, 7.2, 8.1, 8.2, 8.3, 9.1_
    - **Verificação:** `curl http://localhost:3000/healthz` → `{"status":"ok"}`. `curl http://localhost:3000/readyz` → `{"status":"ok","db":"ok"}` (com banco disponível). `curl http://localhost:3000/metrics` → texto Prometheus com as métricas da seção 9.

  - [ ] 7.2 Criar `src/routes/links.ts` para `GET /api/links` e `POST /api/links`
    - `GET /api/links`:
      - Validar `limit` (inteiro, padrão 50, máx 200) e `offset` (inteiro não-negativo, padrão 0) via JSON Schema do Fastify
      - Retornar `400` com mensagem descritiva se `limit > 200` ou se algum parâmetro não for inteiro não-negativo
      - Chamar `listService.list({ limit, offset })`
      - Retornar `200 { total, items }` com `items` contendo `short_url` construído
    - `POST /api/links`:
      - Definir JSON Schema do body com `original_url` obrigatório, `custom_code` e `expires_at` opcionais
      - Chamar `shortenService.createLink(body)`
      - Em sucesso: retornar `201` com `short_code`, `short_url`, `qr_code_url`, `created_at`, `expires_at`
      - Mapear `ValidationError` → `400`, `ConflictError` → `409`, `CodeGenerationError` → `503`
    - _Requisitos: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_
    - **Verificação:** `curl -X POST http://localhost:3000/api/links -H "Content-Type: application/json" -d '{"original_url":"https://example.com"}' ` → `201` com `short_code`, `short_url` e `qr_code_url`. `curl "http://localhost:3000/api/links?limit=201"` → `400`.

  - [ ] 7.3 Criar `src/routes/redirect.ts` para `GET /{shortCode}`
    - Validar `shortCode` do path: comprimento 3–50, caracteres `[a-zA-Z0-9_-]`; retornar `400` se inválido
    - Adicionar atributo `kiro.link.short_code` ao span OTel atual via `trace.getActiveSpan()?.setAttribute(...)`
    - Iniciar timer com `Date.now()`
    - Chamar `redirectService.redirect(shortCode)`
    - Em sucesso: registrar duração com `outcome='found'` e retornar `302` com `Location: originalUrl`
    - Mapear `NotFoundError` → duração com `outcome='not_found'` → `404 {"error":"not_found"}`
    - Mapear `GoneError` → duração com `outcome='expired'` → `410 {"error":"gone","message":"link has expired"}`
    - Mapear `UpstreamError` → `502 {"error":"upstream_error"}`
    - _Requisitos: 5.1, 5.2, 5.3, 5.6, 5.7, 5.8, 5.9_
    - **Verificação:** `curl -L http://localhost:3000/<short_code>` → redireciona para a URL original. `curl -v http://localhost:3000/naoexiste` → `404`.

  - [ ] 7.4 Criar `src/routes/stats.ts` para `GET /api/links/:shortCode/stats`
    - Validar `shortCode` do path: comprimento 3–50, caracteres `[a-zA-Z0-9_-]`; retornar `400` se inválido
    - Chamar `statsService.getStats(shortCode)`
    - Em sucesso: retornar `200` com `short_code`, `original_url`, `clicks`, `created_at`, `expires_at`
    - Mapear `NotFoundError` → `404 {"error":"not_found"}`
    - _Requisitos: 6.1, 6.2, 6.3, 6.4_
    - **Verificação:** `curl http://localhost:3000/api/links/<short_code>/stats` → `200` com os campos esperados. `curl http://localhost:3000/api/links/naoexiste/stats` → `404`.

  - [ ] 7.5 Criar `src/app.ts` com a composição da aplicação Fastify
    - Criar a função `buildApp()` que instancia o Fastify com logger ativo
    - Registrar plugins necessários (cors se aplicável)
    - Registrar error handler global: erros não mapeados → `500 {"error":"internal_server_error"}` com log do stack trace (sem vazar detalhes internos para o cliente)
    - Montar rotas: `/healthz` e `/readyz` e `/metrics` (health.ts), `/api/links` (links.ts), `/:shortCode` (redirect.ts), `/api/links/:shortCode/stats` (stats.ts)
    - Exportar `buildApp()`
    - _Requisitos: 1.5, 7.1, 8.1_
    - **Verificação:** `npm run build` compila sem erros.

  - [ ] 7.6 Criar `src/server.ts` com o entry point da aplicação
    - Primeiro statement: importar e chamar `initTelemetry()` antes de qualquer outro import
    - Importar `buildApp` e `checkDbConnectivity`
    - Chamar `checkDbConnectivity()` com timeout de 5 s; em falha logar erro e chamar `process.exit(1)`
    - Chamar `buildApp()` e `app.listen({ port: config.port, host: '0.0.0.0' })`
    - Logar endereço de escuta após abertura bem-sucedida
    - _Requisitos: 1.3, 1.4, 10.2_
    - **Verificação:** `node dist/server.js` (com variáveis válidas e banco disponível) exibe mensagem de escuta e responde ao `GET /healthz`.

- [ ] 8. Fase 7 — Testes automatizados
  - [ ]* 8.1 Escrever testes de propriedade para validação de parâmetros de paginação (Properties 6–7)
    - **Property 6 — `limit` inválido resulta em HTTP 400:** para qualquer inteiro > 200, `GET /api/links?limit=<valor>` deve retornar `400`
    - **Validates: Requisito 3.3**
    - **Property 7 — Parâmetros não-inteiros ou negativos resultam em HTTP 400:** para qualquer valor de `limit` ou `offset` que não seja inteiro não-negativo, `GET /api/links` deve retornar `400`
    - **Validates: Requisito 3.4**

  - [ ]* 8.2 Escrever testes de integração para `POST /api/links` com banco real
    - Utilizar Testcontainers para subir PostgreSQL e aplicar `db-schema.sql`
    - Testar: criação com `original_url` válida → `201` com todos os campos
    - Testar: criação com `custom_code` → `201` com o código fornecido
    - Testar: criação com `expires_at` → `201` com `expires_at` na resposta
    - Testar: `original_url` inválida → `400`
    - Testar: `custom_code` com formato inválido → `400`
    - Testar: `custom_code` já em uso → `409`
    - _Requisitos: 4.1–4.8_

  - [ ]* 8.3 Escrever testes de integração para `GET /{shortCode}` com banco real
    - Testar: link ativo → `302` com `Location` correto
    - Testar: `shortCode` inexistente → `404`
    - Testar: link expirado → `410`
    - Verificar que `clicks` é incrementado após redirect bem-sucedido
    - _Requisitos: 5.1–5.9_

  - [ ]* 8.4 Escrever testes de integração para `GET /api/links` com banco real
    - Testar: paginação com `limit` e `offset` → `total` correto e `items` com tamanho correto
    - Testar: `limit > 200` → `400`
    - Testar: `items` em ordem decrescente de `created_at`
    - _Requisitos: 3.1–3.6_

  - [ ]* 8.5 Escrever testes de integração para probes e métricas
    - Testar `GET /healthz` → `200 {"status":"ok"}`
    - Testar `GET /readyz` com banco disponível → `200 {"status":"ok","db":"ok"}`
    - Testar `GET /readyz` com banco indisponível → `503 {"status":"error","db":"unavailable"}`
    - Testar `GET /metrics` → `200` com `Content-Type: text/plain` e presença das métricas `kiro_link_clicks_total`, `kiro_links_created_total`, `kiro_link_redirect_duration_seconds`, `kiro_active_links`
    - _Requisitos: 7.1, 7.2, 8.1–8.3, 9.1–9.7_

  - [ ]* 8.6 Escrever testes de integração para `GET /api/links/:shortCode/stats`
    - Testar: link ativo → `200` com todos os campos
    - Testar: link expirado → `200` com `expires_at` preenchido (inclui expirados)
    - Testar: `shortCode` inexistente → `404`
    - _Requisitos: 6.1–6.4_

- [ ] 9. Checkpoint — Verificar testes e build
  - Executar `npm run test` → todos os testes não-opcionais devem passar.
  - Executar `npm run build` → zero erros TypeScript.
  - Executar os testes de integração não-opcionais se o ambiente permitir (`npx vitest --run tests/integration/`).
  - Perguntar ao usuário se há dúvidas antes de avançar para o Docker.

- [ ] 10. Fase 8 — Docker e ambiente local
  - [ ] 10.1 Criar `api/Dockerfile` multi-stage
    - Etapa `builder`: `FROM node:22-alpine AS builder`, instalar dependências com `npm ci`, compilar com `npm run build`
    - Etapa `production`: `FROM node:22-alpine AS production`, criar grupo e usuário sem privilégios (`appgroup`/`appuser`), instalar somente dependências de produção (`npm ci --omit=dev`), copiar `dist/` do builder, transferir propriedade para `appuser`, definir `USER appuser`, expor porta `3000`, definir `CMD ["node", "dist/server.js"]`
    - _Requisitos: 11.1, 11.5_
    - **Verificação:** `docker build -t kiro-api:dev .` → build bem-sucedido. `docker run --rm kiro-api:dev whoami` → exibe `appuser` (não `root`).

  - [ ] 10.2 Criar `api/docker-compose.yml` com a stack local de desenvolvimento
    - Serviço `postgres`: `postgres:16-alpine`, variáveis de ambiente com valores placeholder, volume montando `../db-schema.sql` em `/docker-entrypoint-initdb.d/01-schema.sql:ro`, healthcheck `pg_isready`
    - Serviço `api`: build do `Dockerfile` com `target: production`, variáveis de ambiente com valores placeholder (sem credenciais reais), `depends_on` com condição `service_healthy` no postgres, healthcheck `wget -qO- http://localhost:3000/healthz`
    - _Requisitos: 11.2, 11.3, 11.4_
    - **Verificação:** `docker compose up` → em até 60 s, `curl http://localhost:3000/healthz` retorna `200` e `curl http://localhost:3000/readyz` retorna `200`.

- [ ] 11. Checkpoint final — Verificação ponta a ponta
  - `docker compose up` em `api/`
  - `curl -X POST http://localhost:3000/api/links -H "Content-Type: application/json" -d '{"original_url":"https://kiro.example.com"}' ` → `201` com `short_code`, `short_url`, `qr_code_url`
  - `curl -v http://localhost:3000/<short_code>` → `302` com `Location: https://kiro.example.com`
  - `curl http://localhost:3000/api/links` → `200` com `total >= 1` e `items` com o link criado
  - `curl http://localhost:3000/api/links/<short_code>/stats` → `200` com `clicks: 1`
  - `curl http://localhost:3000/metrics` → texto Prometheus com todas as métricas definidas no `otel-metrics-spec.md`
  - Perguntar ao usuário se há dúvidas ou ajustes antes de considerar a implementação concluída.

---

## Notes

- Tarefas marcadas com `*` são opcionais e podem ser omitidas para entregas mais rápidas (MVP), mas são fortemente recomendadas para a confiabilidade do produto.
- As propriedades PBT (1–17) referenciadas neste plano estão definidas na seção "Correctness Properties" do `design.md`.
- Todas as tarefas de implementação referenciam requisitos específicos do `requirements.md` para rastreabilidade.
- As verificações com `curl` pressupõem a aplicação em execução local (via `docker compose up` ou `npm run dev` com banco disponível).
- Nenhuma credencial real deve ser versionada; os valores no `docker-compose.yml` são exclusivamente para desenvolvimento local.
- A decisão D-03 (Fastify) é uma proposta e deve ser confirmada pela equipe antes de iniciar a Fase 6. Se a equipe preferir Express, apenas os arquivos de rota e `app.ts` precisam ser adaptados — serviços, repositórios e telemetria não mudam.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3"] },
    { "id": 2, "tasks": ["1.4"] },
    { "id": 3, "tasks": ["2.1", "3.1"] },
    { "id": 4, "tasks": ["2.2", "3.2"] },
    { "id": 5, "tasks": ["2.3", "3.3", "4.1"] },
    { "id": 6, "tasks": ["2.4", "4.2", "5.1"] },
    { "id": 7, "tasks": ["5.2", "5.3"] },
    { "id": 8, "tasks": ["5.4", "5.5"] },
    { "id": 9, "tasks": ["5.6", "5.7", "5.9"] },
    { "id": 10, "tasks": ["5.8", "5.10", "7.1", "7.2", "7.3", "7.4"] },
    { "id": 11, "tasks": ["7.5"] },
    { "id": 12, "tasks": ["7.6"] },
    { "id": 13, "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5", "8.6"] },
    { "id": 14, "tasks": ["10.1"] },
    { "id": 15, "tasks": ["10.2"] }
  ]
}
```
