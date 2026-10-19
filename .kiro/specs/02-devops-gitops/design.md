Status: Aprovado em 2026-10-18 por Diêgo

# Design — DevOps e GitOps

## 1. Visão geral

Usamos um monorepo: código, manifests e pipeline no mesmo repositório. O GitHub Actions testa e publica as imagens; o ArgoCD observa `k8s/` na `main` e deixa o cluster igual ao Git.

```
merge na main
   │
   ▼
GitHub Actions (.github/workflows/ci-cd.yaml)
   test-api ─────┐
   test-frontend ├─► build (api, frontend) ─► deploy
   validate ─────┘    push no GHCR             yq grava newTag em k8s/kustomization.yaml
                      tags <sha7> e latest     commit "deploy: ... [skip ci]"
                                                   │
                                                   ▼
                                    ArgoCD (Application kiro-portal)
                                    observa k8s/ na main, prune + selfHeal
                                                   │
                                                   ▼
                                    cluster, namespace encurtador
```

## 2. Pipeline (`.github/workflows/ci-cd.yaml`)

Começamos com dois workflows, um por componente, cada um commitando sua tag. Eles faziam push ao mesmo tempo e brigavam no Git, então juntamos tudo num pipeline só.

### Gatilhos

| Evento | O que roda |
|---|---|
| Pull request | Testes, validação e build, sem publicar |
| Push na `develop` | Igual ao PR |
| Push na `main` | Tudo, incluindo publicar as imagens e o commit da tag |
| `workflow_dispatch` | Segue a regra da branch escolhida |

No push, `paths-ignore` deixa de fora `**.md`, `docs/**` e `.kiro/**`. Não filtramos por componente: qualquer mudança de código roda o pipeline dos dois. Para o tamanho do projeto isso é mais simples e o tempo extra é pequeno.

O `concurrency` agrupa por branch e cancela execuções antigas só em PR. Na `main` cada execução vai até o fim, para nenhum deploy ficar pela metade.

### Jobs

- **test-api:** Ubuntu 24.04, Python 3.12 (a mesma da imagem), Postgres 16 como service e `python -m pytest -v`.
- **test-frontend:** Node 22 (o mesmo da imagem), `npm ci`, `npm run lint`, `npm run lint:css`, `npm test` e `npm run build`.
- **validate:** `kubectl kustomize k8s` e kubeconform `-strict` no resultado; kubeconform na Application do ArgoCD usando o catálogo de CRDs; `docker compose config -q`.
- **build:** matriz `[api, frontend]`, depende dos três anteriores. O nome da imagem é `ghcr.io/${GITHUB_REPOSITORY,,}/<componente>`, em minúsculas porque o GHCR exige (o dono do repositório tem maiúsculas). Só faz login e push quando o evento não é PR e a branch é `main`. Usa cache do Actions por componente e grava os labels OCI `source` e `revision`.
- **deploy:** só na `main`. Usa o `yq` que já vem no runner para atualizar `newName` e `newTag` das duas imagens em `k8s/kustomization.yaml`, commita como `github-actions[bot]` com a mensagem `deploy: api e frontend em <sha7> [skip ci]` e faz push com até 3 tentativas, com `git pull --rebase` entre elas.

As permissões são as mínimas: `contents: read` no geral, `packages: write` no build e `contents: write` no deploy.

## 3. Manifests

### Ponto de entrada

`k8s/kustomization.yaml` aplica `namespace: encurtador` e o label `app.kubernetes.io/part-of: kiro-portal` em tudo, lista os recursos e gera os ConfigMaps da observabilidade a partir dos arquivos em `k8s/observability/config/` e do JSON do dashboard. O sufixo de hash desses ConfigMaps faz o pod reiniciar quando a config muda no Git.

O bloco `images` é a única coisa que o CI edita:

```yaml
images:
  - name: ghcr.io/josephlmedeiros/rascunho-encurtador/api
    newName: ghcr.io/josephlmedeiros/rascunho-encurtador/api
    newTag: <sha7>
  - name: ghcr.io/josephlmedeiros/rascunho-encurtador/frontend
    newName: ghcr.io/josephlmedeiros/rascunho-encurtador/frontend
    newTag: <sha7>
```

### API

- Deployment com 2 réplicas, `envFrom` do ConfigMap `api-config` e `DB_USER`/`DB_PASSWORD` do Secret `db-credentials`.
- `startupProbe` em `/healthz` a cada 2s, até 60 falhas (120s de orçamento). O valor anterior, 80s, matava a API no primeiro boot do Postgres no kind.
- `livenessProbe` em `/healthz` a cada 10s e `readinessProbe` em `/readyz` a cada 5s.
- Roda sem root (UID 10001), com sistema de arquivos só leitura, sem escalada de privilégio, sem capabilities e com seccomp `RuntimeDefault`. Um `emptyDir` em `/tmp` cobre o que precisa de escrita.
- Requests de 100m/128Mi e limits de 500m/256Mi.
- Anotações `prometheus.io/scrape`, `port` e `path` para o Prometheus achar cada pod.
- Service `ClusterIP` na porta 8080.

### Frontend

- Deployment com 2 réplicas, imagem própria baseada em `nginx:1.27-alpine-otel`, escutando na 8080.
- Liveness e readiness em `/healthz`, que o nginx responde sem chamar a API. Assim o frontend não cai junto quando a API está fora.
- Service `ClusterIP` na porta 80, apontando para a 8080 do container.

O nginx do frontend faz proxy de `/api` e `/r` para o Service `api`. Por isso o navegador fala com uma origem só e não precisa de CORS.

### Banco

- StatefulSet com `postgres:16-alpine`. O nome do banco vem do `api-config` e as credenciais do `db-credentials`.
- `PGDATA` num subdiretório do volume, para não conflitar com o `lost+found`.
- Liveness e readiness com `pg_isready`.
- PVC `db-data` de 1Gi.
- Service `ClusterIP` na 5432, só dentro do cluster.

### Secret de exemplo

`k8s/database/secret.yaml` vai para o Git com `troque-esta-senha`. Fizemos assim para o ArgoCD conseguir subir o ambiente da demo sem passo manual. O arquivo explica como criar o Secret real com `kubectl create secret` fora do repositório. O mesmo vale para o Secret `grafana-admin`.

### Ingress

`k8s/base/ingress.yaml` manda todo o tráfego para o Service `frontend`, sem regras para `/api`, porque o nginx já faz esse papel. Ele está comentado no kustomization até o cluster ter um Ingress Controller. A primeira versão tinha um `rewrite-target: /` que quebrava as rotas `/api`, e isso foi tirado.

## 4. ArgoCD

### Application (`argocd/application.yaml`)

- Nome `kiro-portal`, no namespace `argocd`.
- Fonte: este repositório, `targetRevision: main`, `path: k8s`.
- Destino: o próprio cluster, namespace `encurtador`.
- `automated` com `prune: true` e `selfHeal: true`, `CreateNamespace=true` e retry de 5 tentativas com backoff de 10s até 3 min.
- Finalizer `resources-finalizer.argocd.argoproj.io`: apagar a Application apaga os recursos.

A Application fica fora de `k8s/` de propósito. Se ficasse dentro, o ArgoCD estaria gerenciando a si mesmo.

### Instalação (`scripts/argocd-up.sh`)

- Instala o ArgoCD v3.5.5 (versão fixa) com `kubectl apply --server-side --force-conflicts`, porque os CRDs são grandes demais para o apply comum.
- Espera `argocd-server` e `argocd-application-controller` ficarem prontos.
- Aplica a Application e espera `Synced` e `Healthy` por até 5 minutos.
- Mostra a senha inicial do `admin`.

### Cuidado nos testes de resiliência

Com o `selfHeal` ligado, qualquer `kubectl scale` ou `rollout restart` é desfeito em segundos. Para testar falhas é preciso pausar o auto-sync antes e reaplicar a Application depois. O passo a passo está no apêndice do `docs/validacao-sre.md`.

## 5. Ambiente local

- **Docker Compose:** banco, API, frontend, Collector, Tempo, Prometheus e Grafana. As configs da observabilidade são os mesmos arquivos de `k8s/observability/config/` (o Prometheus tem uma versão com alvo fixo, `prometheus.compose.yaml`). Portas: app 3000, Grafana 3001, Prometheus 9090 e API 8080.
- **`scripts/kind-up.sh`:** cria o cluster `kiro` no kind, builda as imagens com a tag `local`, carrega no cluster, aplica o kustomize trocando `latest` por `local` e espera banco e API.
- **`scripts/port-forward.sh`:** abre frontend (3000), Grafana (3001), Prometheus (9090), API (8080) e ArgoCD (8443) num terminal só.
- **`scripts/gerar-trafego.sh`:** cria links e gera cliques por alguns segundos, para o dashboard ter o que mostrar.

## 6. Verificação

O que foi validado e como está no `docs/validacao-sre.md`. Em resumo:

- pipeline: PR com testes e build verdes e deploy pulado; merge na `main` com os 6 jobs verdes e o bot commitando a nova tag;
- ArgoCD: imagens em uso iguais ao `newTag` da `main`, aplicação `Synced` e `Healthy`;
- self-heal: escalar a API para 5 réplicas volta para 2 em segundos;
- banco fora do ar: pods da API em `0/1`, sem restart, e volta sozinho;
- persistência: o link criado antes continua funcionando depois de recriar o pod do Postgres;
- rollout: 299 de 300 requisições OK durante um `rollout restart`, com um 504.

## 7. Limitações conhecidas

- Exposição só por `port-forward`; o Ingress não foi testado com um controller.
- Senhas de exemplo no Git, aceitas para a demo.
- Um 504 durante o rollout da API. A suspeita é uma requisição caindo num pod em encerramento, mas não confirmamos. Um `preStop` com uma pequena espera e `maxUnavailable: 0` devem resolver.
- Tudo foi validado em Linux. macOS e Windows não foram testados.
