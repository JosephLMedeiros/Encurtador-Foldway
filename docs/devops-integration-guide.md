# Guia de integração DevOps

Este guia é para quem vai mexer em alguma parte do projeto e precisa saber como aquilo chega ao cluster. Ele começou como um "o que cada um precisa entregar" antes de existir API e frontend; agora que tudo está integrado, ele explica o caminho de uma mudança e o que tocar em cada caso.

## Como uma mudança chega ao cluster

1. Você abre um PR para a `develop` (ou faz push nela). O pipeline `ci-cd.yaml` roda os testes da API e do frontend, valida os manifests e builda as imagens, sem publicar.
2. A `develop` vai para a `main` por PR. Na `main`, o pipeline publica as imagens no GHCR com a tag do commit e o bot grava essa tag em `k8s/kustomization.yaml`.
3. O ArgoCD vê o commit e aplica no cluster. Em uns 3 minutos os pods novos estão no ar.

Ninguém roda `kubectl apply` à mão. Se fizer, o ArgoCD desfaz (`selfHeal`).

Mudanças só em `**.md`, `docs/` e `.kiro/` não disparam o pipeline.

## O que já está no lugar

```
.github/workflows/ci-cd.yaml   # pipeline único: testes → validação → build → deploy
argocd/application.yaml        # Application kiro-portal, observando k8s/ na main
k8s/
├── kustomization.yaml         # ponto de entrada; o CI só mexe no bloco images
├── base/                      # namespace "encurtador" e Ingress (desligado)
├── api/                       # Deployment (2 réplicas), Service e ConfigMap
├── frontend/                  # Deployment (2 réplicas) e Service
├── database/                  # StatefulSet do Postgres, Service e Secret de exemplo
└── observability/             # Collector, Tempo, Prometheus, Grafana, configs e dashboard
scripts/                       # kind-up, argocd-up, port-forward, gerar-trafego
docker-compose.yml             # a mesma stack para rodar na máquina
```

## Backend

**Variável de ambiente nova.** Leia em `api/app/config.py`. Se não for sensível, coloque o valor em `k8s/api/configmap.yaml` e no serviço `api` do `docker-compose.yml`. Se for senha ou token, vai num Secret: avise o DevOps, porque o valor real não pode ir para o Git.

Variáveis que a API já recebe no cluster:

| Variável | De onde vem | Valor no cluster |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME` | ConfigMap `api-config` | `database`, `5432`, `encurtador` |
| `DB_POOL_MAX` | ConfigMap | `10` |
| `BASE_URL` | ConfigMap | `http://localhost:3000` |
| `SHORT_CODE_LENGTH` | ConfigMap | `7` |
| `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_PROPAGATORS`, `OTEL_TRACES_SAMPLER` | ConfigMap | ver `docs/otel-metrics-spec.md` |
| `DB_USER`, `DB_PASSWORD` | Secret `db-credentials` | valores de exemplo no Git |

**Rota nova.** Atualize o `openapi.yaml` e escreva o teste em `api/tests/test_api.py`. Se o caminho puder colidir com um código curto (a rota `/{code}` aceita qualquer coisa), inclua o nome em `RESERVED_CODES`, em `api/app/shortcode.py`.

**Mudança no banco.** Edite `api/app/schema.sql` de forma idempotente (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). A API aplica o schema a cada boot, com lock, então não existe passo de migração separado.

**Porta.** A API escuta na 8080. Se mudar, mude também o Dockerfile, o `containerPort`, o Service, as anotações do Prometheus e o upstream do `frontend/nginx.conf`.

## Frontend

O frontend e as telas são do Joseph. Mudança visual, de tela ou de texto passa por Diêgo.

- Toda chamada à API passa por `frontend/src/api/api.js`, que usa o `tracedFetch`. Assim o trace começa no navegador sem esforço extra.
- O frontend não tem variáveis de ambiente: em produção o nginx faz proxy de `/api` e `/r` para a API; em desenvolvimento, o Vite.
- O nginx escuta na 8080 dentro do container e responde `/healthz` sozinho para as probes.
- Rota nova no React não precisa de nada no nginx, porque qualquer caminho desconhecido cai no `index.html`. Só caminhos que devem ir para a API precisam de um `location`.

## SRE e observabilidade

**Métrica nova de feature.** Inclua o nome em `FEATURES`, em `api/app/telemetry.py`, chame `telemetry.feature_used("<nome>")` no ponto certo e atualize o contrato e o teste. O painel "Uso de features" já mostra qualquer valor novo.

**Painel novo.** Edite `k8s/observability/dashboards/kiro-portal.json` (dá para exportar do Grafana e colar). O kustomize gera o ConfigMap com hash, então o Grafana reinicia sozinho com o painel novo depois do sync.

**Config do Collector, Tempo, Prometheus ou Grafana.** Edite os arquivos em `k8s/observability/config/`. Eles valem para o compose e para o cluster. O Prometheus tem uma versão só do compose (`prometheus.compose.yaml`), com alvo fixo.

**Scrape de outro serviço.** Basta colocar as anotações `prometheus.io/scrape: "true"`, `prometheus.io/port` e `prometheus.io/path` no pod. O job `kiro-pods` acha sozinho.

## Secrets

Os Secrets do Git (`k8s/database/secret.yaml` e o `grafana-admin`) têm só valores de exemplo, para o ArgoCD conseguir subir a demo sem passo manual. Num ambiente de verdade, tire esses arquivos do kustomization e crie os Secrets direto no cluster:

```bash
kubectl create secret generic db-credentials \
  --namespace encurtador \
  --from-literal=DB_USER=<usuario> \
  --from-literal=DB_PASSWORD=<senha> \
  --dry-run=client -o yaml | kubectl apply -f -
```

## Testar antes do PR

```bash
docker compose --profile test run --rm api-test     # testes da API em Python 3.12
docker compose --profile test down
cd frontend && npm run lint && npm run lint:css && npm test && npm run build
kubectl kustomize k8s > /dev/null                    # manifests renderizam
docker compose up --build                            # stack completa em localhost:3000
```

Para ver no Kubernetes antes do merge, `scripts/kind-up.sh` sobe um cluster kind com as imagens buildadas na sua máquina.

## Ainda em aberto

| ID | Questão |
|---|---|
| D-02 | Ambiente final: hoje é kind local com ArgoCD |
| Q-01 | Ingress: o manifest existe, mas só liga quando houver um Ingress Controller |
