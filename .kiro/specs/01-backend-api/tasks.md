Status: Aprovado em 2026-10-18 por Diêgo

# Tarefas — Backend API

As tarefas seguem a ordem em que a API foi construída na branch `feat/backend-python`, com um commit por etapa. Esta lista substitui o plano antigo em Node.js, que deixou de valer com a D-03.

## 1. Núcleo da API

- [x] 1.1 `config.py`: ler conexão, pool, `BASE_URL`, tamanho e alfabeto do código e timeout de boot das variáveis de ambiente.
- [x] 1.2 `schema.sql`: tabelas `links` e `click_events`, view `active_links` e índices.
- [x] 1.3 `db.py`: pool do psycopg, espera pelo banco no boot e migração com advisory lock.
- [x] 1.4 `shortcode.py`: geração com `secrets`, validação de código e URL e lista de reservados.
- [x] 1.5 `repository.py`: criar, listar com paginação, buscar, contar clique e contar ativos.
- [x] 1.6 `main.py`: rotas de criação, listagem, stats, redirect (`/r/{code}` e `/{code}`), probes e handlers de erro.
- [x] 1.7 Testes unitários do `shortcode` e testes de integração com Postgres real.

Verificação: `pytest` com todos os testes passando. Requisitos 1 a 5 e 7.

## 2. Imagem e ambiente local

- [x] 2.1 `api/Dockerfile` multi-stage, usuário sem root (UID 10001).
- [x] 2.2 `docker-compose.yml` com banco e API, healthchecks e senhas de exemplo.
- [x] 2.3 Profile `test` no compose, com banco descartável e pytest em Python 3.12.

Verificação: `docker compose up` deixa `/healthz` e `/readyz` em 200; `docker compose --profile test run --rm api-test` passa. Requisito 10.

## 3. Telemetria

- [x] 3.1 `telemetry.py` com tracer, meter, instrumentação do FastAPI e do psycopg e a rota `/metrics`.
- [x] 3.2 Instrumentos `kiro.links.created`, `kiro.link.clicks`, `kiro.link.redirect.duration` (buckets explícitos) e o gauge `kiro.active_links`.
- [x] 3.3 Chamadas de telemetria nos handlers e atributo `kiro.link.short_code` nos spans.
- [x] 3.4 Testes do contrato: nomes e rótulos no `/metrics`, span do banco como filho, continuação do `traceparent`.

Verificação: `test_telemetry.py` passando e `/metrics` conferido à mão contra o `docs/otel-metrics-spec.md`. Requisitos 8 e 9.

## 4. Base para as features exclusivas

- [x] 4.1 Gravar `click_events` (com `user_agent` e `referer`) na mesma instrução que soma o clique.
- [x] 4.2 Série por hora no `/stats` (`last_24h`).
- [x] 4.3 Rota `GET /api/ranking`.
- [x] 4.4 Métrica `kiro.feature.used` com o conjunto fechado `FEATURES`.

Verificação: testes de ranking, série por hora e referer. Requisitos 4.5, 5 e 6.

## 5. Correções depois da primeira integração

- [x] 5.1 Renomear `LinkRepository.list` para `list_page`. O nome sombreava o builtin e quebrava no Python 3.12.
- [x] 5.2 Tirar o ruído dos traces: probes, boot e spans internos do ASGI fora da instrumentação. Com teste.
- [x] 5.3 `synchronous_commit off` só na transação do clique, depois de ver nos traces os picos de fsync.

Verificação: testes passando em 3.12 e 3.14; p95 do redirect medido de novo no Grafana (de centenas de ms para cerca de 10 ms).

## 6. QR Code

- [x] 6.1 Contar `kiro.feature.used{feature="qrcode"}` quando o redirect vier com `?via=qr` (D-17).

Verificação: `test_qrcode_access_metric`, e no compose o contador sobe com `?via=qr` e não muda sem o parâmetro. Requisito 4.9.

## Pendências

- [ ] Medir o tempo de resposta do `/healthz` (critério 7.1).
- [ ] Testar o `/readyz` com um banco que aceita conexão mas demora na query.
- [ ] Descobrir por que `db.client.operation.duration` não aparece no `/metrics`. É desejável, não obrigatório.
