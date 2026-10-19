Status: Aprovado em 2026-10-18 por Diêgo

# Requisitos — DevOps e GitOps

## Contexto

Esta spec cobre a entrega do encurtador: Kubernetes, pipeline no GitHub Actions e implantação via ArgoCD. O comportamento da API está na spec `01-backend-api`, e a stack de observabilidade na `04-observabilidade`. Os manifests da observabilidade também moram em `k8s/` e passam pelo mesmo GitOps.

A primeira versão foi escrita antes de existir backend e frontend, com YAML puro, dois workflows e probes em `/health`. Quando a API em Python ficou pronta, a estrutura foi revista e a spec foi atualizada para o formato que usamos de fato: kustomize, um pipeline único e probes `/healthz` e `/readyz`.

## Requisitos

### R-K8S-01 — Os três componentes no Kubernetes

Frontend, API e banco rodam no cluster, cada um com seu workload.

Critérios de aceitação:

- A API e o frontend têm um Deployment cada, com 2 réplicas.
- O banco roda num StatefulSet com volume persistente, para os dados sobreviverem à recriação do pod.
- Todos os pods sobem `Running` e `Ready`, e os componentes se encontram pelo nome do Service.

### R-K8S-02 — Services e acesso externo

Critérios de aceitação:

- Cada componente tem um Service `ClusterIP`.
- O banco não é exposto para fora do cluster.
- Para a demo, o acesso de fora é por `kubectl port-forward`, com um script que abre todas as portas de uma vez.
- Existe um Ingress pronto apontando para o frontend, que fica desligado até o cluster ter um Ingress Controller (depende da D-02).

### R-K8S-03 — ConfigMaps e Secrets

Critérios de aceitação:

- As configurações não sensíveis da API (banco, pool, `BASE_URL`, tamanho do código e variáveis `OTEL_*`) ficam num ConfigMap.
- Usuário e senha do banco ficam num Secret, lido pela API e pelo Postgres.
- Nenhuma senha real fica no Git. Os Secrets versionados têm valores de exemplo e um comentário explicando como criar o Secret de verdade fora do repositório.
- As configs da observabilidade viram ConfigMaps gerados pelo kustomize, com hash no nome, para o pod reiniciar sozinho quando a config muda.

### R-K8S-04 — Probes

Critérios de aceitação:

- A API tem `startupProbe` e `livenessProbe` em `/healthz` e `readinessProbe` em `/readyz`.
- O orçamento do `startupProbe` é maior que a espera interna da API pelo banco (60s), para o kubelet não matar o pod no primeiro boot do Postgres.
- O frontend tem liveness e readiness em `/healthz`, respondido pelo próprio nginx.
- O banco tem liveness e readiness com `pg_isready`.
- Com o banco fora do ar, os pods da API saem do balanceamento (readiness), mas não reiniciam (liveness).

### R-K8S-05 — Namespace dedicado

Critérios de aceitação:

- Tudo roda no namespace `encurtador`, definido num manifest próprio e aplicado pelo kustomize.

### R-CI-01 — Testes antes do build

Critérios de aceitação:

- Todo push na `main` ou na `develop`, todo pull request e o disparo manual rodam os testes da API (pytest com Postgres) e do frontend (lint, stylelint, testes e build).
- O pipeline valida os manifests renderizados pelo kustomize, incluindo a Application do ArgoCD, e a sintaxe do `docker-compose.yml`.
- O build das imagens só roda se testes e validação passarem.
- Pushes que mudam só documentação (`**.md`, `docs/`, `.kiro/`) não disparam o pipeline.

### R-CI-02 — Build e publicação das imagens

Critérios de aceitação:

- O pipeline builda as imagens da API e do frontend em todos os eventos.
- Só na `main` as imagens são publicadas no GHCR, com a tag do SHA curto do commit e `latest`.
- O registry é autenticado pelo `GITHUB_TOKEN` do próprio Actions, sem secrets extras.

### R-CI-03 — Atualização da tag no Git

Critérios de aceitação:

- Depois de publicar, o pipeline grava a nova tag em `k8s/kustomization.yaml` e faz o commit na `main`, com `[skip ci]` para não disparar outro pipeline.
- Se o push for rejeitado porque a `main` andou, o pipeline faz rebase e tenta de novo.

### R-GITOPS-01 — Git como fonte da verdade

Critérios de aceitação:

- Existe uma Application do ArgoCD apontando para `k8s/` na `main`.
- O sync é automático, com `prune` (o que sai do Git sai do cluster) e `selfHeal` (mudança manual no cluster é desfeita).
- O status pode ser acompanhado na interface do ArgoCD.
- A instalação do ArgoCD é feita por um script com versão fixa.

### R-GITOPS-02 — Organização dos manifests

Critérios de aceitação:

- `k8s/` tem uma pasta por componente (`api/`, `frontend/`, `database/`), uma para recursos comuns (`base/`) e uma para a observabilidade (`observability/`).
- `k8s/kustomization.yaml` é o único ponto de entrada.

### R-GITOPS-03 — Deploy sem `kubectl` manual

Critérios de aceitação:

- Um merge na `main` termina com pods novos rodando a nova tag, sem ninguém aplicar nada à mão.
- O fluxo pode ser mostrado ao vivo na demo.

### R-LOCAL-01 — Rodar fora do cluster

Critérios de aceitação:

- `docker compose up` sobe a stack inteira (banco, API, frontend e observabilidade) usando os mesmos arquivos de config do Kubernetes.
- Um script sobe um cluster kind local com as imagens buildadas na máquina, como plano B da demo.

## Decisões relacionadas

| ID | Assunto | Situação |
|---|---|---|
| D-02 | Ambiente Kubernetes | Pendente. Hoje usamos kind local com ArgoCD |
| D-07 | Monorepo com `k8s/kustomization.yaml` como fonte do ArgoCD | Proposta |
| D-10 | GHCR como registry | Proposta |

O estado oficial fica na tabela do `SSOT.md`.
