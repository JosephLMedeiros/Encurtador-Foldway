# Design Document — Backend API

## Overview

A API do encurtador de links é o componente central da aplicação. Ela é responsável por criar códigos curtos, redirecionar usuários, persistir os dados no PostgreSQL, expor métricas para o Prometheus e propagar traces distribuídos via OpenTelemetry.

O serviço será implementado em **Node.js LTS** com **TypeScript**, utilizando **Fastify** como framework HTTP (justificativa na seção de Componentes). O código ficará no diretório `api/` do monorepo.

A arquitetura segue uma separação em camadas — rotas → serviços → repositórios → banco — com um módulo de telemetria desacoplado que é inicializado antes de qualquer outro componente.

### Decisões técnicas propostas

As decisões abaixo ainda estão **Pendentes** no SSOT e são tratadas como **propostas** neste documento. Nenhuma delas deve ser considerada definitiva sem confirmação da equipe.

| Decisão | Proposta | ID SSOT | Justificativa resumida |
|---|---|---|---|
| Linguagem e framework da API (D-03) | Node.js LTS + TypeScript + Fastify | D-03 | Performance superior ao Express em benchmarks; suporte nativo a async/await; plugin oficial de OpenTelemetry (`@opentelemetry/instrumentation-fastify`); tipagem estática reduz bugs de contrato. |
| Banco de dados (D-05) | PostgreSQL com driver `pg` + pool nativo | D-05 | Já definido pelos contratos `db-schema.sql` e `openapi.yaml`; driver maduro com suporte a pool configurável. |
| Formato do código curto (D-06) | 7 caracteres, alfabeto `[a-z0-9]`, nanoid | D-06 | Espaço de `36^7 ≈ 78 bilhões` de combinações; nanoid é URL-safe e criptograficamente seguro. |

---

## Architecture

A API segue uma arquitetura em camadas, sem dependências circulares:

```
┌─────────────────────────────────────────────────────────────────┐
│  server.ts  ← entry point                                       │
│  1. initTelemetry()    ← DEVE ser o primeiro import/chamada     │
│  2. buildApp()         ← cria instância Fastify + registra rotas│
│  3. app.listen()       ← abre o servidor HTTP                   │
└─────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  app.ts  ← composição da aplicação Fastify                      │
│  - Registra plugins (cors, helmet, etc.)                        │
│  - Monta rotas em /api/links, /{shortCode}, /healthz, etc.      │
└─────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  routes/  ← handlers HTTP (validação de schema, resposta HTTP)  │
│  - Delegam lógica para services/                                │
│  - Não acessam o banco diretamente                              │
└─────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  services/  ← lógica de negócio                                 │
│  - shortenService    (criação de links)                         │
│  - redirectService   (redirecionamento + cache)                 │
│  - statsService      (consulta de estatísticas)                 │
│  - listService       (listagem paginada)                        │
└─────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  db/  ← acesso a dados                                          │
│  - pool.ts            (pool de conexões pg)                     │
│  - linksRepository.ts (CRUD + view active_links)                │
│  - clicksRepository.ts (inserção assíncrona de click_events)    │
└─────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  PostgreSQL  ← banco de dados                                   │
│  - tabela links                                                 │
│  - tabela click_events                                          │
│  - view active_links                                            │
└─────────────────────────────────────────────────────────────────┘

Módulo transversal (não tem dependência de nenhuma camada acima):
┌─────────────────────────────────────────────────────────────────┐
│  telemetry/  ← OpenTelemetry SDK                                │
│  - Inicializa SDK antes do servidor HTTP                        │
│  - Expõe interface própria (Counter, Histogram, Gauge)          │
│  - Nenhum módulo importa o SDK OTel diretamente                 │
└─────────────────────────────────────────────────────────────────┘

Módulo transversal:
┌─────────────────────────────────────────────────────────────────┐
│  cache/  ← Cache-Aside em memória                               │
│  - Wrapper sobre lru-cache (node-lru-cache)                     │
│  - Utilizado por redirectService                                │
└─────────────────────────────────────────────────────────────────┘
```

### Justificativa do framework: Fastify vs Express

| Critério | Fastify | Express |
|---|---|---|
| Performance (req/s) | ~65 000 req/s (v4) | ~35 000 req/s |
| TypeScript nativo | Sim (tipos oficiais) | Parcial (@types/express) |
| Validação de schema | JSON Schema nativo (ajv) | Manual ou middleware |
| Instrumentação OTel | Plugin oficial disponível | Plugin disponível |
| Maturidade | Alta (v5 LTS) | Muito alta |
| Ecossistema | Crescente | Muito amplo |

A escolha pelo Fastify se deve principalmente ao suporte nativo a JSON Schema para validação de entrada (reduz código de validação manual), melhor performance e tipagem TypeScript de primeira classe. Qualquer um dos dois atende os requisitos do hackathon; se a equipe preferir Express por familiaridade, o impacto é mínimo — apenas os trechos de plugin e schema precisariam ser adaptados.

**Esta escolha está sujeita à decisão D-03.**

---

## Components and Interfaces

### Estrutura de diretórios

```
api/
├── src/
│   ├── telemetry/
│   │   ├── index.ts          # initTelemetry() + exporta interface de instrumentos
│   │   ├── sdk.ts            # configuração do NodeSDK OTel
│   │   └── instruments.ts    # Counter, Histogram, Gauge observável
│   ├── db/
│   │   ├── pool.ts           # pg.Pool configurado por variáveis de ambiente
│   │   ├── linksRepository.ts
│   │   └── clicksRepository.ts
│   ├── cache/
│   │   └── redirectCache.ts  # wrapper lru-cache com lógica de TTL
│   ├── services/
│   │   ├── shortenService.ts
│   │   ├── redirectService.ts
│   │   ├── statsService.ts
│   │   └── listService.ts
│   ├── routes/
│   │   ├── links.ts          # POST /api/links, GET /api/links
│   │   ├── redirect.ts       # GET /{shortCode}
│   │   ├── stats.ts          # GET /api/links/:shortCode/stats
│   │   └── health.ts         # GET /healthz, GET /readyz, GET /metrics
│   ├── utils/
│   │   └── shortCode.ts      # geração de código curto com retry
│   ├── config.ts             # leitura e validação de variáveis de ambiente (zod)
│   ├── app.ts                # buildApp(): instância Fastify + rotas
│   └── server.ts             # entry point: initTelemetry → buildApp → listen
├── tests/
│   ├── unit/
│   │   ├── cache/
│   │   ├── services/
│   │   └── utils/
│   └── integration/
│       └── routes/
├── Dockerfile
├── docker-compose.yml
├── package.json
└── tsconfig.json
```

### Interfaces TypeScript relevantes

```typescript
// src/db/linksRepository.ts
export interface LinkRow {
  id: number;
  short_code: string;
  original_url: string;
  clicks: number;
  created_at: Date;
  expires_at: Date | null;
}

// src/cache/redirectCache.ts
export type CacheValue =
  | { type: 'found';    original_url: string; expires_at: Date | null }
  | { type: 'not_found' }
  | { type: 'expired' };

// src/telemetry/instruments.ts — interface exposta (sem tipos do SDK)
export interface TelemetryInstruments {
  recordRedirectDuration(durationMs: number, outcome: 'found' | 'not_found' | 'expired'): void;
  incrementLinkClicks(): void;
  incrementLinksCreated(kind: 'random' | 'vanity'): void;
  // activeLinks Gauge é configurado via callback observável na inicialização
}
```

### Dependências de produção propostas

| Pacote | Versão | Finalidade |
|---|---|---|
| `fastify` | `^5.0.0` | Framework HTTP |
| `pg` | `^8.13.0` | Driver PostgreSQL |
| `lru-cache` | `^11.0.0` | Cache em memória |
| `nanoid` | `^5.0.0` | Geração de código curto |
| `zod` | `^3.23.0` | Validação de variáveis de ambiente |
| `@opentelemetry/sdk-node` | `^0.202.0` | SDK OTel Node.js |
| `@opentelemetry/auto-instrumentations-node` | `^0.52.0` | Instrumentação automática (HTTP, pg) |
| `@opentelemetry/exporter-trace-otlp-proto` | `^0.202.0` | Exportador OTLP gRPC |
| `@opentelemetry/exporter-metrics-otlp-proto` | `^0.202.0` | Exportador de métricas OTLP |
| `@opentelemetry/api` | `^1.9.0` | API pública OTel |
| `prom-client` | `^15.1.3` | Exposição de métricas no formato Prometheus (`GET /metrics`) |

> **Nota sobre `prom-client`:** o SDK OTel exporta métricas via OTLP. Para expor um endpoint `GET /metrics` no formato de texto do Prometheus (scrapável diretamente), a abordagem mais simples e compatível com o ecossistema é usar `prom-client` em paralelo com o OTel SDK, registrando os mesmos instrumentos nos dois sistemas. Uma alternativa é usar o exporter Prometheus do OTel (`@opentelemetry/exporter-metrics-otlp-prometheus`), que expõe um endpoint HTTP próprio. A decisão final deve ser tomada junto com a definição da stack de observabilidade (D-09).

---

## Data Models

### Tabela `links`

Mapeamento direto do `db-schema.sql`:

```typescript
// Objeto retornado pelo repositório
interface LinkRow {
  id: number;
  short_code: string;       // VARCHAR(50)
  original_url: string;     // TEXT
  clicks: number;           // INTEGER DEFAULT 0
  created_at: Date;         // TIMESTAMPTZ
  expires_at: Date | null;  // TIMESTAMPTZ NULL
}
```

### Tabela `click_events`

```typescript
interface ClickEventInsert {
  link_id: number;
  clicked_at: Date;       // DEFAULT CURRENT_TIMESTAMP
  user_agent: string | null;
  ip_address: string | null;
}
```

### Objeto de resposta da listagem (`GET /api/links`)

```typescript
interface ListLinksResponse {
  total: number;
  items: {
    short_code: string;
    short_url: string;      // construído: BASE_URL + "/" + short_code
    original_url: string;
    clicks: number;
    created_at: string;     // ISO 8601
    expires_at: string | null;
  }[];
}
```

### Queries SQL dos repositórios

**linksRepository.ts**

```sql
-- findByShortCode (para redirect — usa view active_links)
SELECT short_code, original_url, expires_at
FROM active_links
WHERE short_code = $1;

-- findByShortCodeDirect (para stats — usa tabela diretamente)
SELECT short_code, original_url, clicks, created_at, expires_at
FROM links
WHERE short_code = $1;

-- listPaginated (para GET /api/links)
SELECT
  short_code, original_url, clicks, created_at, expires_at,
  COUNT(*) OVER() AS total
FROM links
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- insertLink
INSERT INTO links (short_code, original_url, expires_at)
VALUES ($1, $2, $3)
RETURNING id, short_code, original_url, clicks, created_at, expires_at;

-- incrementClicks (atômico via UPDATE)
UPDATE links SET clicks = clicks + 1 WHERE short_code = $1;
```

> A separação entre `findByShortCode` (via `active_links`) e `findByShortCodeDirect` (via `links`) é obrigatória para satisfazer os Requisitos 2, 5 e 6: o redirect usa `active_links` (filtra expirados) e o stats usa `links` (inclui expirados).

**clicksRepository.ts**

```sql
-- insertClickEvent (disparado assincronamente após o redirect)
INSERT INTO click_events (link_id, clicked_at, user_agent, ip_address)
VALUES ($1, $2, $3, $4);
```

---

## Correctness Properties

*Uma propriedade é uma característica ou comportamento que deve ser verdadeiro em todas as execuções válidas do sistema — essencialmente, uma declaração formal sobre o que o sistema deve fazer. Propriedades servem como ponte entre especificações legíveis por humanos e garantias de corretude verificáveis por máquinas.*

As propriedades a seguir foram derivadas dos critérios de aceitação dos Requisitos 2, 3, 4 e 5, conforme análise de testabilidade realizada antes desta seção. Cada propriedade é adequada para testes baseados em propriedades (PBT) porque o comportamento varia com o input, é verificável com inputs gerados aleatoriamente e pode ser executado de forma eficiente (lógica em memória ou com mocks leves).

### Property 1: Cache hit evita consulta ao repositório

*Para qualquer código curto e URL original válidos previamente inseridos no cache, chamadas subsequentes ao `redirectService` não devem invocar o `linksRepository`.*

**Validates: Requirements 2.2**

### Property 2: Cache miss popula o cache

*Para qualquer código curto válido que não esteja no cache, após a primeira chamada ao `redirectService`, uma segunda chamada com o mesmo código não deve invocar o `linksRepository`.*

**Validates: Requirements 2.3**

### Property 3: TTL do cache respeita expiração do link

*Para qualquer timestamp de expiração futuro `expires_at` (em segundos a partir de agora = `delta`), o TTL calculado para a entrada de cache deve ser igual a `max(1, delta)`.*

**Validates: Requirements 2.4**

### Property 4: Marcador de ausência para código inexistente

*Para qualquer código curto que não exista no banco, após a primeira consulta, o cache deve retornar `{type: 'not_found'}` sem invocar o repositório novamente.*

**Validates: Requirements 2.5**

### Property 5: Paginação retorna subconjunto correto

*Para qualquer lista de N links no banco e quaisquer parâmetros `limit` (1–200) e `offset` (0–N) válidos, `GET /api/links` deve retornar `total = N` e `items.length = min(limit, max(0, N - offset))`.*

**Validates: Requirements 3.1, 3.2**

### Property 6: `limit` inválido resulta em HTTP 400

*Para qualquer valor inteiro estritamente maior que 200, `GET /api/links?limit=<valor>` deve retornar HTTP 400.*

**Validates: Requirements 3.3**

### Property 7: Parâmetros não-inteiros ou negativos resultam em HTTP 400

*Para qualquer valor de `limit` ou `offset` que não seja um inteiro não-negativo (incluindo strings, floats, negativos), `GET /api/links` deve retornar HTTP 400.*

**Validates: Requirements 3.4**

### Property 8: `short_url` é sempre BASE_URL + "/" + short_code

*Para qualquer link retornado por `GET /api/links`, o campo `short_url` deve ser igual à concatenação de `BASE_URL`, `"/"` e `short_code`.*

**Validates: Requirements 3.5**

### Property 9: Itens retornados em ordem decrescente de `created_at`

*Para qualquer lista de links com `created_at` distintos, os `items` retornados por `GET /api/links` devem estar em ordem estritamente decrescente de `created_at`.*

**Validates: Requirements 3.6**

### Property 10: URL inválida resulta em HTTP 400

*Para qualquer string que não seja uma URI absoluta com esquema `http` ou `https` (incluindo strings vazias, URIs relativas, esquemas `ftp://`, etc.), `POST /api/links` deve retornar HTTP 400.*

**Validates: Requirements 4.2**

### Property 11: `custom_code` com formato inválido resulta em HTTP 400

*Para qualquer string fornecida como `custom_code` que contenha caracteres fora de `[a-zA-Z0-9_-]`, ou com comprimento fora de [3, 50], `POST /api/links` deve retornar HTTP 400.*

**Validates: Requirements 4.3**

### Property 12: Código gerado automaticamente respeita o alfabeto e comprimento configurados

*Para qualquer URL válida sem `custom_code`, o `short_code` retornado deve ter exatamente `SHORT_CODE_LENGTH` caracteres e cada caractere deve pertencer ao `SHORT_CODE_ALPHABET`.*

**Validates: Requirements 4.5**

### Property 13: `qr_code_url` é sempre BASE_URL + "/qr/" + short_code

*Para qualquer link criado com sucesso, o campo `qr_code_url` retornado deve ser igual à concatenação de `BASE_URL`, `"/qr/"` e `short_code`.*

**Validates: Requirements 4.8**

### Property 14: Redirect retorna 302 com Location correto para link ativo

*Para qualquer link ativo, `GET /{shortCode}` deve retornar HTTP 302 com o header `Location` igual a `original_url` do link.*

**Validates: Requirements 5.1**

### Property 15: Redirect retorna 404 para código inexistente

*Para qualquer código curto que não exista no banco, `GET /{shortCode}` deve retornar HTTP 404.*

**Validates: Requirements 5.2**

### Property 16: Clicks incrementa em 1 a cada redirect bem-sucedido

*Para qualquer link ativo, após N chamadas bem-sucedidas a `GET /{shortCode}`, o valor de `clicks` deve ser exatamente N a mais que o valor inicial.*

**Validates: Requirements 5.4**

### Property 17: Stats retorna campos corretos para qualquer link existente

*Para qualquer link existente (ativo ou expirado), `GET /api/links/{shortCode}/stats` deve retornar HTTP 200 com os campos `short_code`, `original_url`, `clicks`, `created_at` e `expires_at` iguais aos valores armazenados no banco.*

**Validates: Requirements 6.1**

---

## Error Handling

### Tabela de casos de erro

| Situação | Comportamento esperado | HTTP | Log |
|---|---|---|---|
| Banco indisponível na inicialização | Processo encerra com `process.exit(1)` após logar o erro | — | `error` |
| Banco indisponível em mid-request (qualquer endpoint de dados) | Retorna `{"error": "service unavailable"}` | 503 | `error` |
| `original_url` inválida em `POST /api/links` | Retorna `{"error": "invalid_url", "message": "..."}` | 400 | — |
| `custom_code` com formato inválido | Retorna `{"error": "invalid_custom_code", "message": "..."}` | 400 | — |
| `custom_code` já em uso | Retorna `{"error": "conflict", "message": "code already in use"}` | 409 | — |
| `expires_at` inválido ou no passado | Retorna `{"error": "invalid_expires_at", "message": "..."}` | 400 | — |
| Colisão total na geração aleatória (5 tentativas) | Retorna `{"error": "code_generation_failed"}` | 503 | `warn` |
| `shortCode` inexistente no redirect | Retorna `{"error": "not_found"}` | 404 | — |
| Link expirado no redirect | Retorna `{"error": "gone", "message": "link has expired"}` | 410 | — |
| Falha no `UPDATE clicks` | Retorna `{"error": "upstream_error"}` | 502 | `error` |
| Falha assíncrona na inserção de `click_event` | Não afeta a resposta HTTP; registra erro no log | — | `error` |
| `GET /readyz`: SELECT 1 com timeout de 2s | Retorna `{"status":"error","db":"unavailable"}` | 503 | `warn` |
| `limit` > 200 | Retorna `{"error": "invalid_parameter", "message": "limit must be ≤ 200"}` | 400 | — |
| `limit`/`offset` não-inteiro | Retorna `{"error": "invalid_parameter", "message": "..."}` | 400 | — |

### Formato de erro padrão

```json
{
  "error": "<código_de_erro_machine_readable>",
  "message": "<descrição legível por humanos>"
}
```

### Estratégia de erros inesperados

Erros não mapeados devem ser capturados pelo error handler global do Fastify, retornar HTTP 500 com `{"error": "internal_server_error"}` e registrar o stack trace em `error` level. **Nenhum detalhe interno deve vazar para o cliente em produção.**

---

## Data Flows

### POST /api/links

```
Cliente → [routes/links.ts]
  1. Fastify valida o body contra o JSON Schema (original_url obrigatório)
  2. Chama shortenService.createLink(body)
     a. Valida original_url (URI absoluta http/https) via zod
     b. Valida custom_code (formato) se fornecido
     c. Valida expires_at (ISO 8601, futuro) se fornecido
     d. Se custom_code fornecido:
        - Tenta INSERT; se viola UNIQUE → lança ConflictError → 409
     e. Se custom_code não fornecido:
        - Gera código via shortCode.generate() (nanoid)
        - Tenta INSERT; se viola UNIQUE → nova tentativa (até 5)
        - Se 5 colisões → lança CodeGenerationError → 503
     f. Incrementa instruments.incrementLinksCreated(kind)
     g. Retorna LinkRow
  3. Route constrói resposta 201 com short_url, qr_code_url
```

### GET /{shortCode}

```
Cliente → [routes/redirect.ts]
  1. Extrai shortCode do path
  2. Adiciona kiro.link.short_code ao span OTel atual
  3. Inicia timer para kiro.link.redirect.duration
  4. Chama redirectService.redirect(shortCode)
     a. Consulta redirectCache.get(shortCode)
        - HIT do tipo 'found'     → retorna original_url (sem consultar banco)
        - HIT do tipo 'not_found' → lança NotFoundError → 404
        - HIT do tipo 'expired'   → lança GoneError → 410
        - MISS → consulta linksRepository.findByShortCode(shortCode)
          * Resultado nulo (não existe na tabela links) → 
            cache.set(shortCode, {type:'not_found'}, ttl=60s)
            lança NotFoundError → 404
          * Resultado existe mas expirado (não retornado por active_links) →
            lança GoneError → 410 (sem cache de ausência)
          * Resultado encontrado e ativo →
            calcula TTL = max(1, expires_at - now) ou DEFAULT_TTL
            cache.set(shortCode, {type:'found', original_url, expires_at}, ttl)
            retorna original_url
     b. Executa linksRepository.incrementClicks(shortCode) atomicamente
        - Se falhar → lança UpstreamError → 502
     c. Dispara clicksRepository.insertClickEvent(...) de forma assíncrona
        (não bloqueia a resposta; erros são logados)
     d. Incrementa instruments.incrementLinkClicks()
  5. Route registra duração com outcome=found no histograma
  6. Retorna 302 com Location: original_url
  [Em caso de erro]:
  - NotFoundError  → duração registrada com outcome=not_found → 404
  - GoneError      → duração registrada com outcome=expired → 410
  - UpstreamError  → 502
```

### GET /api/links

```
Cliente → [routes/links.ts]
  1. Valida parâmetros limit (padrão 50, máx 200) e offset (padrão 0)
  2. Se limit > 200 ou não-inteiro → 400
  3. Chama listService.list({ limit, offset })
     a. Executa query paginada com COUNT(*) OVER()
     b. Constrói short_url para cada item
     c. Retorna { total, items }
  4. Retorna 200 com { total, items }
```

### GET /api/links/{shortCode}/stats

```
Cliente → [routes/stats.ts]
  1. Valida shortCode (formato: 3-50 chars, [a-zA-Z0-9_-])
  2. Chama statsService.getStats(shortCode)
     a. Executa linksRepository.findByShortCodeDirect(shortCode)
        (tabela links, não view active_links — inclui expirados)
     b. Se não encontrado → lança NotFoundError → 404
     c. Retorna LinkRow
  3. Retorna 200 com os campos do link
```

### GET /readyz

```
Cliente → [routes/health.ts]
  1. Tenta pool.query('SELECT 1') com timeout de 2 segundos
  2. Se responder dentro do timeout → 200 {"status":"ok","db":"ok"}
  3. Se timeout ou erro → cancela query pendente → 503 {"status":"error","db":"unavailable"}
```

---

## Cache Cache-Aside

### Estrutura da entrada

```typescript
type CacheValue =
  | { type: 'found';    original_url: string; expires_at: Date | null }
  | { type: 'not_found' }
  | { type: 'expired' };     // reservado para uso futuro; no fluxo atual, expirados não são cacheados
```

### Cálculo de TTL

```typescript
function computeTtl(expiresAt: Date | null, defaultTtlSeconds: number): number {
  if (expiresAt === null) return defaultTtlSeconds;
  const secondsUntilExpiry = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  return Math.max(1, secondsUntilExpiry);
}
```

### Comportamento por caso

| Situação | Ação no cache | TTL |
|---|---|---|
| Link ativo sem `expires_at` | Armazena `{type:'found', ...}` | `CACHE_DEFAULT_TTL_SECONDS` (padrão 300s) |
| Link ativo com `expires_at` | Armazena `{type:'found', ...}` | `max(1, expires_at - now)` em segundos |
| Código inexistente na tabela | Armazena `{type:'not_found'}` | 60s fixo |
| Código expirado | **Não armazena** | — |
| Banco indisponível no miss | **Não armazena** | — |

### Configuração

```
CACHE_MAX_SIZE=1000          # número máximo de entradas (padrão 1000)
CACHE_DEFAULT_TTL_SECONDS=300 # TTL em segundos para links sem expiração (padrão 300)
```

### Implementação com `lru-cache`

```typescript
import { LRUCache } from 'lru-cache';

const cache = new LRUCache<string, CacheValue>({
  max: config.cacheMaxSize,
  ttl: config.cacheDefaultTtlSeconds * 1000,  // lru-cache usa ms
  allowStale: false,
});
```

---

## Telemetry Module

### Inicialização

O módulo `api/src/telemetry/index.ts` deve ser importado e sua função `initTelemetry()` chamada como **primeiro statement** em `server.ts`, antes de qualquer outro import que possa instanciar conexões HTTP ou de banco.

```typescript
// server.ts
import { initTelemetry } from './telemetry/index.js';
initTelemetry();                         // ← DEVE ser o primeiro statement executado
import { buildApp } from './app.js';
import { checkDbConnectivity } from './db/pool.js';
// ...
```

### Configuração do SDK

```typescript
// telemetry/sdk.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';

export function createSdk(): NodeSDK {
  return new NodeSDK({
    traceExporter: new OTLPTraceExporter(),   // endpoint via OTEL_EXPORTER_OTLP_ENDPOINT
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
    }),
    instrumentations: [getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        applyCustomAttributesOnSpan: () => {},
      },
    })],
  });
}
```

### Instrumentos manuais

```typescript
// telemetry/instruments.ts
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('kiro-api');

export const redirectDurationHistogram = meter.createHistogram('kiro.link.redirect.duration', {
  unit: 's',
  advice: { explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0] },
});

export const linkClicksCounter = meter.createCounter('kiro.link.clicks');

export const linksCreatedCounter = meter.createCounter('kiro.links.created');

// Gauge observável — callback executado a cada coleta pelo Prometheus/OTel
meter.createObservableGauge('kiro.active_links', {}, async (observableResult) => {
  const count = await queryActiveLinksCount();  // SELECT count(*) FROM active_links
  observableResult.observe(count);
});
```

### Interface pública (sem vazamento do SDK)

Nenhum módulo fora de `telemetry/` deve importar do `@opentelemetry/api` diretamente. A interface a ser consumida pelos serviços:

```typescript
// telemetry/index.ts — exportações públicas
export function recordRedirectDuration(durationSeconds: number, outcome: 'found' | 'not_found' | 'expired'): void {
  redirectDurationHistogram.record(durationSeconds, { outcome });
}

export function incrementLinkClicks(): void {
  linkClicksCounter.add(1);
}

export function incrementLinksCreated(kind: 'random' | 'vanity'): void {
  linksCreatedCounter.add(1, { kind });
}
```

### Garantia de `http.route` como template

O plugin de auto-instrumentação Fastify/HTTP do OTel captura automaticamente o template da rota (ex.: `/{shortCode}`) em vez do path real, pois o Fastify expõe `request.routeOptions.url`. Verificar em `GET /metrics` que o atributo `http_route` contém `/{shortCode}` e não `/abc123` após a primeira integração real.

---

## Short Code Generation

```typescript
// utils/shortCode.ts
import { customAlphabet } from 'nanoid';
import { config } from '../config.js';

export async function generateShortCode(
  checkExists: (code: string) => Promise<boolean>,
): Promise<string> {
  const generate = customAlphabet(config.shortCodeAlphabet, config.shortCodeLength);
  const MAX_ATTEMPTS = 5;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generate();
    const exists = await checkExists(code);
    if (!exists) return code;
  }

  throw new CodeGenerationError('Failed to generate unique short code after 5 attempts');
}
```

| Variável | Padrão | Descrição |
|---|---|---|
| `SHORT_CODE_LENGTH` | `7` | Comprimento do código gerado |
| `SHORT_CODE_ALPHABET` | `abcdefghijklmnopqrstuvwxyz0123456789` | Conjunto de caracteres |

Com os padrões: `36^7 ≈ 78 bilhões` de combinações possíveis. Colisão em 5 tentativas é improvável no volume do hackathon e resulta em HTTP 503.

---

## Dockerfile Multi-Stage

```dockerfile
# api/Dockerfile

# ──── Etapa 1: build ────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Copia apenas os arquivos de dependências primeiro (cache de camada)
COPY package*.json tsconfig.json ./
RUN npm ci

# Copia o restante do código-fonte e compila
COPY src/ ./src/
RUN npm run build    # tsc → dist/

# ──── Etapa 2: produção ─────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app

# Cria usuário sem privilégios
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copia apenas as dependências de produção e o código compilado
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist/

# Transfere a propriedade dos arquivos para o usuário sem privilégios
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

A versão concreta do Node.js base (`node:22-alpine`) deve ser validada contra a versão LTS disponível no momento da implementação.

---

## docker-compose.yml Local

```yaml
# api/docker-compose.yml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: kiro_dev
      POSTGRES_USER: kiro
      POSTGRES_PASSWORD: kiro_dev_password   # placeholder — não usar em produção
    volumes:
      - ../db-schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U kiro -d kiro_dev"]
      interval: 5s
      timeout: 3s
      retries: 10
    ports:
      - "5432:5432"

  api:
    build:
      context: .
      target: production
    environment:
      NODE_ENV: development
      DATABASE_URL: postgres://kiro:kiro_dev_password@postgres:5432/kiro_dev
      DB_POOL_MIN: "1"
      DB_POOL_MAX: "5"
      BASE_URL: http://localhost:3000
      SHORT_CODE_LENGTH: "7"
      SHORT_CODE_ALPHABET: abcdefghijklmnopqrstuvwxyz0123456789
      CACHE_MAX_SIZE: "1000"
      CACHE_DEFAULT_TTL_SECONDS: "300"
      OTEL_SERVICE_NAME: kiro-api
      OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-collector:4318   # ajustar se collector não estiver no compose
      OTEL_PROPAGATORS: tracecontext,baggage
      OTEL_TRACES_SAMPLER: parentbased_always_on
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "3000:3000"
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3000/healthz || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 6

volumes:
  postgres_data:
```

**Importante:** As credenciais acima são exclusivas para desenvolvimento local. Nunca devem ser versionadas com valores reais. Em produção, os valores serão fornecidos via Kubernetes Secrets, referenciados por ConfigMap e Secret do cluster (fora deste repositório).

---

## Environment Variables

Todas as variáveis de ambiente são lidas e validadas no startup por `src/config.ts` usando zod. A API deve recusar a inicialização se uma variável obrigatória estiver ausente ou com valor inválido.

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `DATABASE_URL` | Sim (ou variáveis individuais) | — | Connection string PostgreSQL |
| `DB_HOST` | Não (se DATABASE_URL fornecido) | — | Host do banco |
| `DB_PORT` | Não | `5432` | Porta do banco |
| `DB_NAME` | Não | — | Nome do banco |
| `DB_USER` | Não | — | Usuário do banco |
| `DB_PASSWORD` | Não | — | Senha do banco |
| `DB_POOL_MIN` | Não | `1` | Tamanho mínimo do pool |
| `DB_POOL_MAX` | Não | `10` | Tamanho máximo do pool (máx. 100) |
| `BASE_URL` | Sim | — | URL base para construir short_url e qr_code_url |
| `PORT` | Não | `3000` | Porta de escuta HTTP |
| `SHORT_CODE_LENGTH` | Não | `7` | Comprimento do código curto gerado |
| `SHORT_CODE_ALPHABET` | Não | `abcdefghijklmnopqrstuvwxyz0123456789` | Alfabeto do código curto |
| `CACHE_MAX_SIZE` | Não | `1000` | Número máximo de entradas no cache |
| `CACHE_DEFAULT_TTL_SECONDS` | Não | `300` | TTL padrão do cache em segundos |
| `OTEL_SERVICE_NAME` | Sim | — | Nome do serviço (deve ser `kiro-api`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Sim | — | Endpoint OTLP do Collector |
| `OTEL_PROPAGATORS` | Não | `tracecontext,baggage` | Propagadores de contexto |
| `OTEL_TRACES_SAMPLER` | Não | `parentbased_always_on` | Sampler de traces |

---

## Testing Strategy

### Abordagem dual

A estratégia combina testes de unidade/propriedade (lógica pura, em memória) com testes de integração (endpoints com banco real via Testcontainers).

### Ferramentas propostas

| Ferramenta | Finalidade |
|---|---|
| **Vitest** | Test runner (unit + property tests) — mais rápido que Jest para projetos TypeScript |
| **fast-check** | Biblioteca PBT para gerar inputs aleatórios |
| **Supertest** ou **Fastify inject** | Testes de integração HTTP sem subir servidor real |
| **Testcontainers** | Banco PostgreSQL real para testes de integração |

### Testes de unidade e propriedade (rápidos, sem I/O)

Os testes de propriedade (PBT) devem ser configurados com **mínimo de 100 iterações** e tagueados com comentário referenciando a propriedade do design.

Cobrir prioritariamente:

- **`cache/redirectCache.ts`**: Propriedades 1–4 (cache hit, miss, TTL, marcador de ausência)
- **`utils/shortCode.ts`**: Propriedade 12 (código gerado respeita alfabeto e comprimento)
- **`services/listService.ts`**: Propriedades 5–9 (paginação, validação, formatação)
- **`services/shortenService.ts`**: Propriedades 10–11, 13 (validação de URL, custom_code, qr_code_url)
- **`services/redirectService.ts`**: Propriedades 14–16 (redirect, 404, incremento de clicks)
- **`services/statsService.ts`**: Propriedade 17 (stats)

Exemplo de tag de teste:
```typescript
// Feature: backend-api, Property 3: TTL do cache respeita expiração do link
it.prop([fc.date({ min: new Date(Date.now() + 1000) })])('property 3', (expiresAt) => {
  const ttl = computeTtl(expiresAt, 300);
  const expected = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  expect(ttl).toBe(expected);
});
```

### Testes de integração (com banco real)

Cobrir os endpoints principais com banco PostgreSQL real via Testcontainers:

- `POST /api/links` — criação com URL válida, custom_code, expires_at
- `GET /{shortCode}` — 302, 404, 410 com link expirado
- `GET /api/links` — paginação e total
- `GET /api/links/{shortCode}/stats` — link expirado deve retornar 200
- `GET /healthz` e `GET /readyz` — com banco disponível e indisponível
- `GET /metrics` — verificar presença das métricas definidas no contrato

### O que não testar com PBT

- Inicialização do OTel SDK (smoke test)
- Dockerfile e docker-compose (verificação manual / `docker build`)
- Propagação de traces (verificação manual no Grafana/Tempo)
- `GET /metrics` como texto Prometheus (integração, não PBT)

---

## Impactos em outras specs

| Área | Impacto |
|---|---|
| **Frontend** | O contrato da API está definido em `openapi.yaml`. Qualquer alteração nos campos de resposta ou nos status codes deve ser refletida no `openapi.yaml` e comunicada ao frontend. |
| **Observabilidade (spec futura)** | Os nomes dos instrumentos (`kiro.link.clicks`, `kiro.link.redirect.duration`, etc.) e os atributos definidos aqui devem ser usados na configuração do dashboard Grafana e nas queries PromQL do `otel-metrics-spec.md`. |
| **Manifests Kubernetes (spec futura)** | As variáveis de ambiente da seção de configuração devem ser mapeadas para ConfigMap e Secret. Os endpoints `/healthz` e `/readyz` devem ser referenciados nos probes `livenessProbe` e `readinessProbe` do Deployment. |
| **GitOps / ArgoCD** | A imagem produzida pelo Dockerfile deve seguir a convenção de tag definida pela decisão D-10 (registry pendente). |

---

## Decisões Pendentes

As seguintes decisões afetam diretamente a implementação deste design e precisam ser confirmadas pela equipe antes de iniciar as tarefas:

| ID | Decisão | Impacto neste design |
|---|---|---|
| D-03 | Linguagem e framework da API | Define se usamos Fastify ou Express, TypeScript ou JavaScript puro |
| D-05 | Banco de dados | Confirma o uso de PostgreSQL com driver `pg` |
| D-06 | Formato do código curto | Confirma o uso de nanoid, comprimento 7 e alfabeto `[a-z0-9]` |
| D-09 | Ferramentas de observabilidade | Define o backend de traces (Tempo, Jaeger, etc.) e a abordagem para `GET /metrics` (prom-client vs exporter OTel Prometheus) |
| D-10 | Registry de imagens | Define a convenção de tag no Dockerfile |
