Status: Reconciliado com a implementação em 18/10/2026 (escrito após a implementação)

# Requirements — 02-devops-gitops

## 1. Contexto

Esta spec cobre a infraestrutura de entrega do encurtador de links: orquestração Kubernetes, pipeline CI/CD via GitHub Actions e implantação GitOps via ArgoCD. Ela não define o comportamento da aplicação em si (coberto em `01-backend-api`).

> **Nota:** o documento original mencionava uma spec `03-observabilidade`. A numeração real é `04-observabilidade`. Os manifests de observabilidade estão em `k8s/observability/` e são gerenciados pelo mesmo kustomization.

## 2. Requisitos

### R-K8S-01 — Execução dos três componentes no Kubernetes

Os componentes frontend, API e banco de dados devem ser executados como workloads no cluster Kubernetes. Cada componente deve ter seu próprio Deployment (ou StatefulSet para o banco).

**Critérios de aceitação:**
- Existe um Deployment (ou StatefulSet) para cada componente: frontend, api, banco.
- Os Pods de cada componente sobem com status `Running`.
- Os componentes conseguem se comunicar entre si dentro do cluster.

> **Atendido.** `k8s/api/deployment.yaml` (2 réplicas), `k8s/frontend/deployment.yaml` (2 réplicas), `k8s/database/statefulset.yaml` (1 réplica, `postgres:16-alpine`). Validado em execução: `docs/validacao-sre.md` (seção 3.2, teste 4: "deployments 2/2"). Namespace: `encurtador` (definido em `k8s/kustomization.yaml`).

### R-K8S-02 — Services para acesso interno e externo

Cada componente deve ter um Service Kubernetes. O frontend e a API devem ser acessíveis externamente.

**Critérios de aceitação:**
- Existe um Service para cada componente.
- O Service da API permite acesso interno pelo frontend.
- O frontend é exposto externamente (via NodePort, LoadBalancer ou Ingress, conforme o ambiente).
- A API é exposta externamente para testes e demo.

> **Atendido com divergência.** `k8s/api/service.yaml` (ClusterIP, porta 8080), `k8s/frontend/service.yaml` (ClusterIP, porta 80), `k8s/database/service.yaml` (ClusterIP, porta 5432). O frontend e a API são expostos externamente por `kubectl port-forward` (scripts/port-forward.sh) e não por NodePort/LoadBalancer. O Ingress (`k8s/base/ingress.yaml`) existe mas está comentado no `k8s/kustomization.yaml` — depende de Ingress Controller (Q-01 pendente). Motivo: ambiente demo usa port-forward.

### R-K8S-03 — ConfigMaps e Secrets

Variáveis de configuração não sensíveis via ConfigMap. Credenciais via Secret, nunca embutidas nos manifestos ou imagens.

**Critérios de aceitação:**
- Existe pelo menos um ConfigMap com configurações da aplicação.
- Existe pelo menos um Secret para as credenciais do banco de dados.
- Nenhuma credencial está exposta em texto claro nos manifestos versionados no repositório.

> **Atendido com divergência (credencial de exemplo versionada).** `k8s/api/configmap.yaml` existe. `k8s/database/secret.yaml` e `k8s/observability/grafana.yaml` (Secret `grafana-admin`) existem e contêm valores de exemplo (`troque-esta-senha`). Os arquivos comentam explicitamente que são exemplos e fornecem instruções para uso de credenciais reais fora do Git. A decisão de versionar os exemplos foi aceita para permitir que o ArgoCD suba o ambiente sem intervenção manual — limitação de demo documentada em `docs/validacao-sre.md` (seção 5).

### R-K8S-04 — Probes de saúde

Todos os Deployments devem ter liveness probe e readiness probe.

**Critérios de aceitação:**
- Cada Deployment de aplicação (frontend, api) tem `livenessProbe` e `readinessProbe`.
- As probes apontam para endpoints reais implementados.
- Os Pods só recebem tráfego após a readiness probe passar.

> **Atendido.** API (`k8s/api/deployment.yaml`): startupProbe + livenessProbe em `/healthz` e readinessProbe em `/readyz`. Frontend (`k8s/frontend/deployment.yaml`): livenessProbe e readinessProbe em `/healthz`. Banco (`k8s/database/statefulset.yaml`): readinessProbe e livenessProbe via `pg_isready`. Validado em execução: `docs/validacao-sre.md` (seção 3.2, teste 1: banco fora do ar → pods da API saem do balanceamento sem reiniciar; teste 7: probes sem traces).

> **Divergência (R-K8S-04):** o documento original previa probes em `/health`. A implementação usa `/healthz` (liveness) e `/readyz` (readiness), conforme a spec `01-backend-api`.

### R-K8S-05 — Namespace dedicado

Todos os recursos devem ser criados em um namespace próprio, não no namespace `default`.

**Critérios de aceitação:**
- Existe um manifesto de Namespace para o projeto.
- Todos os recursos referenciam esse namespace.

> **Atendido.** `k8s/base/namespace.yaml` define o namespace `encurtador`. O namespace é aplicado globalmente via `k8s/kustomization.yaml` (`namespace: encurtador`).

### R-CI-01 — Pipeline de CI: build e push de imagem (API)

O GitHub Actions deve construir e publicar a imagem Docker da API em push para `main`.

**Critérios de aceitação:**
- O workflow é disparado por push na branch `main` com mudanças em `api/**`.
- O workflow faz checkout, build e push para o registry configurado.
- O workflow falha se o build ou push falharem.
- A tag da imagem inclui o SHA do commit.

> **Atendido com divergência.** `.github/workflows/ci-cd.yaml`: workflow único (não arquivos separados por componente). O gatilho de push ignora `**.md`, `docs/**` e `.kiro/**` (paths-ignore); qualquer mudança de código em qualquer diretório dispara o pipeline para ambos os componentes em matriz. O push de imagens ocorre **somente na `main`** (não apenas quando `api/` muda). A tag inclui o SHA curto (7 dígitos) e `latest`. Validado: `docs/validacao-sre.md` (seção 3.3).

### R-CI-02 — Pipeline de CI: build e push de imagem (Frontend)

O GitHub Actions deve construir e publicar a imagem Docker do frontend em push para `main`.

**Critérios de aceitação:**
- O workflow é disparado por push na branch `main` com mudanças em `frontend/**`.
- O workflow faz checkout, build e push para o registry.
- O workflow falha se o build ou push falharem.
- A tag da imagem inclui o SHA do commit.

> **Atendido com divergência.** Mesmo comentário que R-CI-01: workflow único em matriz. Validado: `docs/validacao-sre.md` (seção 3.3).

### R-CI-03 — Atualização automática das tags de imagem nos manifests

Após o build e push, o pipeline atualiza a tag nos manifests Kubernetes e faz commit.

**Critérios de aceitação:**
- Após push de nova imagem, o arquivo de manifesto correspondente é atualizado com a nova tag.
- O commit de atualização é registrado na branch `main` com mensagem padronizada.
- O ArgoCD detecta a alteração e sincroniza o cluster.

> **Atendido com divergência.** O CI usa `yq` para atualizar `images[].newTag` em `k8s/kustomization.yaml` (não o campo `image` nos Deployments individuais). A mensagem de commit é `"deploy: api e frontend em <sha7> [skip ci]"`. O retry de push inclui rebase automático (até 3 tentativas) para evitar conflito quando dois commits chegam simultâneos. Validado: `docs/validacao-sre.md` (seção 3.3: "bot commitou a nova tag 652b3c7 → 4b79deb em k8s/kustomization.yaml").

### R-CI-04 — Execução de testes no CI

O pipeline deve executar testes antes de construir e publicar a imagem.

**Critérios de aceitação:**
- O workflow inclui um step de execução de testes.
- O step de build/push só é executado se os testes passarem.
- Enquanto os testes não existirem, o step pode ser placeholder.

> **Atendido.** Jobs `test-api` (pytest com Postgres como service) e `test-frontend` (lint + testes + build Vite) executam antes do job `build`, que tem `needs: [test-api, test-frontend, validate]`. O job `validate` também valida os manifests com kubeconform e o `docker compose config`. Validado: `docs/validacao-sre.md` (seção 3.1: "44 testes passam" e "92 testes em 14 arquivos passam").

### R-GITOPS-01 — Repositório como fonte de verdade (ArgoCD)

O ArgoCD deve monitorar `k8s/` e sincronizar o cluster automaticamente.

**Critérios de aceitação:**
- Existe um manifesto de Application do ArgoCD apontando para `k8s/`.
- Auto-sync habilitado.
- O status de sincronização pode ser verificado na interface do ArgoCD.

> **Atendido.** `argocd/application.yaml` (fora de `k8s/base/` — ver divergência abaixo): Application `kiro-portal`, path `k8s`, branch `main`, `automated.prune: true`, `automated.selfHeal: true`, `CreateNamespace: true`, retry com backoff exponencial. Validado: `docs/validacao-sre.md` (seção 3.2, teste 4: "Synced e Healthy"; teste self-heal: 5 réplicas voltaram a 2 em segundos).

> **Divergência (R-GITOPS-01):** o design previa `k8s/base/argocd-app.yaml`. O arquivo real está em `argocd/application.yaml` (diretório próprio `argocd/`).

### R-GITOPS-02 — Organização dos manifests Kubernetes

Manifests organizados em subdiretórios por componente dentro de `k8s/`.

**Critérios de aceitação:**
- Existe um subdiretório para cada componente: `k8s/api/`, `k8s/frontend/`, `k8s/database/`.
- Existe um diretório para recursos compartilhados: `k8s/base/`.
- Cada subdiretório contém os manifests pertinentes.

> **Atendido com extensão.** Estrutura: `k8s/api/`, `k8s/frontend/`, `k8s/database/`, `k8s/base/`, `k8s/observability/`. O ponto de entrada é `k8s/kustomization.yaml` (Kustomize), não YAML raw como o design original previa. Fonte: `k8s/kustomization.yaml`.

> **Divergência (R-GITOPS-02):** o design propunha "YAML raw sem Helm/Kustomize". A implementação usa Kustomize com `configMapGenerator` (hash no nome, reinicia o pod quando config muda) e bloco `images` (atualizado pelo CI via `yq`). Fonte: `k8s/kustomization.yaml`.

### R-GITOPS-03 — Implantação via ArgoCD sem acesso manual ao cluster

O deploy deve ocorrer exclusivamente pela atualização dos manifests no repositório.

**Critérios de aceitação:**
- Uma alteração de imagem no manifesto propagada pelo CI/CD resulta em novo Pod sem intervenção manual.
- O processo é demonstrável ao vivo.

> **Atendido.** Validado em execução: `docs/validacao-sre.md` (seção 3.2, teste 4: ArgoCD trocou os pods para a nova tag via commit do CI, sem kubectl apply manual).

## 3. Restrições e dependências

> **Atualização:** as decisões D-10 (GHCR) e D-07 (monorepo com kustomization) foram implementadas como propostas. D-02 (ambiente Kubernetes) continua Pendente no SSOT: a stack roda em kind com ArgoCD (`scripts/kind-up.sh`, `argocd/application.yaml`), sem decisão formal sobre local vs. cluster do bootcamp. Ver seção "Decisões resolvidas".

## 4. Decisões resolvidas

| ID | Questão | Resultado | Evidência |
|---|---|---|---|
| D-02 | Ambiente Kubernetes | **Pendente** no SSOT. Implementado: kind local (`scripts/kind-up.sh`) com ArgoCD. Sem decisão formal sobre cluster do bootcamp. | `scripts/kind-up.sh`, `argocd/application.yaml`, `docs/validacao-sre.md` (seção 2) |
| D-07 | Organização GitOps | Monorepo; `k8s/kustomization.yaml` como fonte do ArgoCD; CI atualiza `images.newTag` por `yq`. Estado no SSOT: **Proposta**. | `k8s/kustomization.yaml`, `argocd/application.yaml`, `.github/workflows/ci-cd.yaml` |
| D-10 | Registry de imagens | GHCR (`ghcr.io/josephlmedeiros/rascunho-encurtador/{api,frontend}`), autenticado pelo `GITHUB_TOKEN`. Estado no SSOT: **Proposta**. | `.github/workflows/ci-cd.yaml`, `k8s/kustomization.yaml` (tag `652b3c7`) |
| Q-01 | Exposição externa | ClusterIP + `kubectl port-forward` para demo. Ingress (`k8s/base/ingress.yaml`) existe mas está comentado no kustomization (depende de Ingress Controller). | `k8s/base/ingress.yaml`, `k8s/kustomization.yaml`, `scripts/port-forward.sh` |
| Q-02 | Banco de dados | StatefulSet (`postgres:16-alpine`) com PVC de 1Gi. | `k8s/database/statefulset.yaml` |
| Q-03 | ArgoCD no cluster | Instalado via `scripts/argocd-up.sh` (versão fixa `v3.5.5`). | `scripts/argocd-up.sh` |

## 5. Extensões além do spec

- **Validação de manifests no CI (`validate` job):** `kubectl kustomize` + kubeconform (incluindo CRDs do ArgoCD via catálogo) + `docker compose config`. Não previsto no requirements original. Fonte: `.github/workflows/ci-cd.yaml`.
- **Concorrência do pipeline:** `concurrency` com `cancel-in-progress` em PRs — evita builds simultâneos na mesma branch. Fonte: `.github/workflows/ci-cd.yaml`.
- **Cache de build Docker (GitHub Actions cache):** `cache-from`/`cache-to` por componente reduz o tempo de build em runs subsequentes. Fonte: `.github/workflows/ci-cd.yaml`.
- **Labels OCI nas imagens:** `org.opencontainers.image.source` e `org.opencontainers.image.revision` adicionados automaticamente pelo CI. Fonte: `.github/workflows/ci-cd.yaml`.
- **Scripts de automação:** `scripts/kind-up.sh` (cluster local), `scripts/argocd-up.sh` (ArgoCD v3.5.5 fixo), `scripts/port-forward.sh` (todas as portas num terminal só), `scripts/gerar-trafego.sh` (carga para demo). Não previstos no requirements original.
- **RBAC do Prometheus:** ServiceAccount, Role e RoleBinding para o Prometheus descobrir pods via `kubernetes_sd`. Fonte: `k8s/observability/prometheus.yaml`.
- **Stack de observabilidade integrada ao kustomization:** `k8s/observability/` com Collector, Tempo, Prometheus e Grafana gerenciados pelo mesmo `k8s/kustomization.yaml`. Fonte: `k8s/kustomization.yaml`.
- **`startupProbe` na API:** além de liveness e readiness, a API tem startupProbe (2s × 60 tentativas = 120s de orçamento para a inicialização do banco). Fonte: `k8s/api/deployment.yaml`.
- **Segurança de contêiner:** `readOnlyRootFilesystem`, `allowPrivilegeEscalation: false`, `capabilities: drop: ALL`, `seccompProfile: RuntimeDefault` no Deployment da API. Fonte: `k8s/api/deployment.yaml`.
- **Retry de push no job deploy:** até 3 tentativas com rebase automático para evitar falha por push rejeitado em deploys simultâneos. Fonte: `.github/workflows/ci-cd.yaml`.
