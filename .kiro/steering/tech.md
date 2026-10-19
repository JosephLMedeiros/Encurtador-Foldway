# Tecnologia

## Obrigatório pelo enunciado

- **Kubernetes** para rodar frontend, API e banco.
- **GitHub Actions** para build, testes e publicação das imagens.
- **ArgoCD** para o deploy por GitOps.
- **OpenTelemetry** para traces que atravessam os componentes.
- **Grafana** para os dashboards.

## Stack em uso

O estado de cada decisão (confirmada, proposta, pendente) fica só na tabela do `SSOT.md`, seção 8. A lista abaixo resume o que está no código hoje, para consulta rápida.

| Área | O que usamos | Decisão |
|---|---|---|
| API | Python 3.12, FastAPI, psycopg 3 com pool, uvicorn | D-03 |
| Banco | PostgreSQL 16, schema em `api/app/schema.sql` aplicado pela API no boot | D-05 |
| Frontend | React 19, Vite, React Router 7, JavaScript sem TypeScript, CSS puro com variáveis de tema (stack escolhida e construída pelo Joseph) | D-04 |
| Servidor do frontend | nginx 1.27 com módulo OpenTelemetry, proxy de `/api`, `/r` e `/otlp` na mesma origem | D-12, D-13 |
| Código curto | 7 caracteres `[a-z0-9]` aleatórios ou 3 a 50 `[A-Za-z0-9_-]` personalizados; redirect em `/r/{code}` | D-06 |
| Contrato da API | `openapi.yaml`, campos em snake_case | D-11 |
| Manifests | Kustomize, com `k8s/kustomization.yaml` como entrada | D-07 |
| Registry | GHCR, autenticado pelo `GITHUB_TOKEN` | D-10 |
| GitOps | ArgoCD v3.5.5, Application `kiro-portal` observando `k8s/` na `main` | D-01, D-07 |
| Observabilidade | OTel Collector, Tempo, Prometheus e Grafana | D-09 |
| Tracing no navegador | `frontend/src/api/tracing.js`, sem SDK | D-14 |
| Ambiente | Docker Compose para desenvolvimento; kind com ArgoCD para o cluster | D-02 (pendente) |

Versões das imagens e bibliotecas estão fixadas em `api/requirements.txt`, `frontend/package.json`, nos Dockerfiles e nos manifests. Ao subir uma versão, mude no arquivo e rode o pipeline.

## Contratos que não podem quebrar

- `openapi.yaml`: rotas, corpos e códigos de erro da API. O frontend só fala com a API por `frontend/src/api/api.js`.
- `docs/otel-metrics-spec.md`: nomes de métricas, atributos e consultas do dashboard. Mudou uma métrica, atualize o contrato, o teste em `api/tests/test_telemetry.py` e o dashboard juntos.
- `active_links`: a única definição de link ativo. Não repita a regra em outro lugar.

## Regras práticas

- Nada de rótulo de alta cardinalidade em métrica (código curto, URL, IP, user agent). Em span pode.
- Feature nova com métrica entra no conjunto `FEATURES` de `api/app/telemetry.py`.
- Configuração vem de variável de ambiente (ConfigMap ou Secret). Nada de endereço ou senha no código.
- Senha real nunca vai para o Git. Os Secrets versionados têm só valores de exemplo.
- Os testes da API rodam em Python 3.12, a mesma versão da imagem.
- Prefira a solução mais simples que cabe no prazo (2026-10-19). Se uma escolha depende de decisão pendente, proponha e espere a equipe.
