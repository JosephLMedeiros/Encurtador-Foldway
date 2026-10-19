Status: Reconciliado com a implementação em 18/10/2026 (escrito após a implementação)

# Design — 02-devops-gitops

Este documento descreve a implementação real de CI/CD, Kubernetes e GitOps, conforme encontrada no repositório. Toda afirmação cita o arquivo que a comprova. O plano original está preservado na seção final.

---

## 1. Visão geral

A entrega do Foldway usa um mono-repo GitOps: o mesmo repositório contém código e manifests. O GitHub Actions testa, builda e publica imagens; o ArgoCD observa `k8s/` e reconcilia o cluster.

```
Push na main
    │
    ▼
GitHub Actions (.github/workflows/ci-cd.yaml)
    ├── test-api      → pytest + Postgres service
    ├── test-frontend → lint + testes + build Vite
    ├── validate      → kubeconform + docker compose config
    ├── build         → docker build + push GHCR (só na main)
    │                   tags: <sha7> e latest
    └── deploy        → yq edita images[].newTag em k8s/kustomization.yaml
                        git commit "deploy: ... [skip ci]"
                        git push (retry × 3 com rebase)
                            │
                            ▼
                        ArgoCD (argocd/application.yaml)
                        observa k8s/, branch main
                        sync automático: prune + selfHeal
                            │
                            ▼
                        Cluster Kubernetes (kind local)
                        namespace: encurtador
```

---

## 2. Pipeline CI/CD (`.github/workflows/ci-cd.yaml`)

### 2.1 Gatilhos

| Evento | Comportamento |
|---|---|
| `push` em `main` ou `develop` | Roda todos os jobs; push de imagens e deploy somente na `main` |
| `pull_request` | Roda testes, validação e build (sem push); deploy pulado |
| `workflow_dispatch` | Manual; segue a mesma regra da branch escolhida |
| `paths-ignore` (apenas push) | `**.md`, `docs/**`, `.kiro/**` não disparam o pipeline |

O `concurrency` usa `cancel-in-progress: true` em PRs (evita builds simultâneos na mesma branch).

Fonte: `.github/workflows/ci-cd.yaml`.

### 2.2 Estrutura de jobs e dependências

```
test-api ──┐
            ├──► validate ──► build ──► deploy
test-frontend ──┘
```

`build` tem `needs: [test-api, test-frontend, validate]`. `deploy` tem `needs: build` e só roda quando `github.ref == 'refs/heads/main'` e o evento não é `pull_request`.

### 2.3 Job `test-api`

- Runner: `ubuntu-24.04`, Python 3.12.
- Serviço: `postgres:16-alpine` (usuário `kiro`, banco `kiro_test`), com healthcheck `pg_isready`.
- Instala `requirements-dev.txt` com cache pip.
- Executa `python -m pytest -v` com `TEST_DATABASE_URL=postgresql://kiro:kiro@localhost:5432/kiro_test`.
- Working directory: `api/`.

Fonte: `.github/workflows/ci-cd.yaml`.

### 2.4 Job `test-frontend`

- Runner: `ubuntu-24.04`, Node.js 22 com cache npm.
- Executa (em sequência): `npm ci --no-audit --no-fund`, `npm run lint`, `npm run lint:css`, `npm test`, `npm run build`.
- Working directory: `frontend/`.

Fonte: `.github/workflows/ci-cd.yaml`.

### 2.5 Job `validate`

- `kubectl kustomize k8s > rendered.yaml` — renderiza o kustomize.
- kubeconform `v0.6.7` com flag `-strict -summary`:
  - `rendered.yaml` contra schemas padrão do Kubernetes.
  - `argocd/application.yaml` contra schemas padrão + CRDs do ArgoCD (catálogo `datreeio/CRDs-catalog`).
- `docker compose config -q` — valida a sintaxe do `docker-compose.yml`.

Fonte: `.github/workflows/ci-cd.yaml`.

### 2.6 Job `build`

- Estratégia: matriz `[api, frontend]`, dois jobs em paralelo.
- Permission: `packages: write` (necessário para push ao GHCR).
- Nome da imagem: `ghcr.io/${GITHUB_REPOSITORY,,}/<component>` (GHCR exige minúsculas).
- Tag: `${GITHUB_SHA::7}` (SHA de 7 dígitos).
- Push: somente se `github.event_name != 'pull_request' && github.ref == 'refs/heads/main'` (variável `PUSH`).
- Tags publicadas: `<sha7>` **e** `latest`.
- Labels OCI: `source` (URL do repo) e `revision` (SHA completo).
- Cache Docker: `type=gha,scope=<component>` (GitHub Actions cache por componente).

Fonte: `.github/workflows/ci-cd.yaml`.

### 2.7 Job `deploy`

- Executa somente na `main` (não em PR).
- Usa `yq` (pré-instalado no runner) para atualizar `images[].newName` e `images[].newTag` em `k8s/kustomization.yaml` para **ambos** os componentes (`api` e `frontend`).
- Commit: `"deploy: api e frontend em <sha7> [skip ci]"` com bot `github-actions[bot]`.
- Push com retry: até 3 tentativas, cada falha faz `git pull --rebase origin main` antes de tentar novamente.
- Permission: `contents: write`.

Fonte: `.github/workflows/ci-cd.yaml`.

---

## 3. Manifests Kubernetes

### 3.1 Ponto de entrada: `k8s/kustomization.yaml`

Kustomize aplica `namespace: encurtador` a todos os recursos e etiqueta tudo com `app.kubernetes.io/part-of: kiro-portal`. Os ConfigMaps de observabilidade são gerados por `configMapGenerator` com sufixo de hash (o pod reinicia automaticamente quando a config muda no Git).

O bloco `images` é atualizado pelo CI:

```yaml
images:
  - name: ghcr.io/josephlmedeiros/rascunho-encurtador/api
    newTag: <sha7>
  - name: ghcr.io/josephlmedeiros/rascunho-encurtador/frontend
    newTag: <sha7>
```

Fonte: `k8s/kustomization.yaml`.

### 3.2 Namespace

`k8s/base/namespace.yaml`: namespace `encurtador` com labels `app.kubernetes.io/managed-by: argocd` e `project: encurtador-hackathon`.

### 3.3 API

**Deployment** (`k8s/api/deployment.yaml`):
- 2 réplicas.
- `envFrom: configMapRef: api-config` (variáveis não sensíveis, incluindo `OTEL_*`).
- `env` com `DB_USER` e `DB_PASSWORD` de `secretKeyRef: db-credentials`.
- **Probes:**
  - `startupProbe`: `/healthz`, 2s × 60 tentativas (orçamento 120s para o banco subir).
  - `livenessProbe`: `/healthz`, período 10s.
  - `readinessProbe`: `/readyz`, período 5s.
- Segurança: `runAsNonRoot: true`, `runAsUser: 10001`, `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`, `capabilities: drop: ALL`, `seccompProfile: RuntimeDefault`.
- Volume `tmp` em `emptyDir` (necessário por `readOnlyRootFilesystem`).
- Anotações de scrape: `prometheus.io/scrape: "true"`, `prometheus.io/port: "8080"`, `prometheus.io/path: "/metrics"`.

**Service** (`k8s/api/service.yaml`): ClusterIP, porta 8080.

**ConfigMap** (`k8s/api/configmap.yaml`): `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_POOL_MAX`, `BASE_URL`, `SHORT_CODE_LENGTH`, variáveis `OTEL_*`.

Fonte: `k8s/api/deployment.yaml`, `k8s/api/service.yaml`, `k8s/api/configmap.yaml`.

### 3.4 Frontend

**Deployment** (`k8s/frontend/deployment.yaml`):
- 2 réplicas.
- Imagem `nginx:1.27-alpine-otel` (módulo OTel do nginx).
- `livenessProbe` e `readinessProbe` em `/healthz` (rota do nginx, sem consultar a API).
- Sem `envFrom` (nginx não lê variáveis de ambiente da aplicação).
- `securityContext: allowPrivilegeEscalation: false`.

**Service** (`k8s/frontend/service.yaml`): ClusterIP, porta 80.

Fonte: `k8s/frontend/deployment.yaml`, `k8s/frontend/service.yaml`.

### 3.5 Banco de dados

**StatefulSet** (`k8s/database/statefulset.yaml`):
- Imagem `postgres:16-alpine` (D-05).
- `POSTGRES_DB` lido do `api-config`; credenciais do Secret `db-credentials`.
- `PGDATA=/var/lib/postgresql/data/pgdata` (subdiretório evita conflito com `lost+found`).
- `readinessProbe` e `livenessProbe` via `pg_isready`.
- PVC `db-data` de 1Gi (ReadWriteOnce).

**Service** (`k8s/database/service.yaml`): ClusterIP, porta 5432 — banco nunca exposto fora do cluster.

**Secret** (`k8s/database/secret.yaml`): valores de exemplo (`troque-esta-senha`). Arquivo versionado para permitir deploy automático pelo ArgoCD; contém instruções para substituição por credencial real.

Fonte: `k8s/database/statefulset.yaml`, `k8s/database/service.yaml`, `k8s/database/secret.yaml`.

### 3.6 Ingress

`k8s/base/ingress.yaml` existe mas está **comentado** no `k8s/kustomization.yaml`. Aponta todo o tráfego para o Service `frontend` (o nginx do frontend faz proxy de `/api` e `/r` para a API — sem necessidade de regras separadas no Ingress). Host placeholder: `encurtador.local`.

Fonte: `k8s/base/ingress.yaml`, `k8s/kustomization.yaml`.

### 3.7 Observabilidade

`k8s/observability/` gerenciado pelo mesmo kustomization. ConfigMaps gerados por `configMapGenerator` com hash. Inclui: OTel Collector, Tempo, Prometheus (com RBAC), Grafana (com Secret `grafana-admin`), configs em `k8s/observability/config/`, dashboard em `k8s/observability/dashboards/kiro-portal.json`.

Fonte: `k8s/kustomization.yaml`, `k8s/observability/`.

---

## 4. GitOps — ArgoCD

### 4.1 Application (`argocd/application.yaml`)

```yaml
metadata:
  name: kiro-portal
  namespace: argocd
spec:
  source:
    repoURL: https://github.com/JosephLMedeiros/rascunho-encurtador.git
    targetRevision: main
    path: k8s
  destination:
    server: https://kubernetes.default.svc
    namespace: encurtador
  syncPolicy:
    automated:
      prune: true       # remove do cluster o que saiu do Git
      selfHeal: true    # desfaz alterações manuais no cluster
    syncOptions:
      - CreateNamespace=true
    retry:
      limit: 5
      backoff: { duration: 10s, factor: 2, maxDuration: 3m }
```

Finalizer `resources-finalizer.argocd.argoproj.io`: apagar a Application remove os recursos do cluster.

Fonte: `argocd/application.yaml`.

### 4.2 Instalação — `scripts/argocd-up.sh`

- Versão fixa: ArgoCD `v3.5.5`.
- `kubectl apply --server-side --force-conflicts` (necessário por tamanho dos CRDs).
- Aguarda rollout do `argocd-server` e do `argocd-application-controller` (timeout 300s cada).
- Aplica `argocd/application.yaml` e aguarda `Synced/Healthy` (até 60 × 5s = 5 minutos).
- Exibe a senha do `admin` ao final.

Fonte: `scripts/argocd-up.sh`.

### 4.3 Comportamento validado

- **Deploy GitOps:** o CI faz commit da nova tag em `k8s/kustomization.yaml`; o ArgoCD detecta e sincroniza sem kubectl manual. Evidência: `docs/validacao-sre.md` (seção 3.2, teste 4).
- **Self-heal:** escalar a API para 5 réplicas via kubectl reverte em segundos. Evidência: `docs/validacao-sre.md` (seção 3.2).
- **Readiness sem reiniciar:** banco fora do ar → pods da API saem do balanceamento (readiness), `RESTARTS = 0`, voltam sozinhos. Evidência: `docs/validacao-sre.md` (seção 3.2, teste 1).
- **Persistência:** dados sobrevivem à recriação do pod do Postgres (PVC). Evidência: `docs/validacao-sre.md` (seção 3.2, teste 2).
- **Rollout com ressalva:** 299/300 requisições OK durante `rollout restart`; 1 × 504. Evidência: `docs/validacao-sre.md` (seção 3.2, teste 3 e seção 5).

---

## 5. Ambiente local

### 5.1 Docker Compose (`docker-compose.yml`)

Serviços: `database`, `api`, `frontend`, `otel-collector`, `tempo`, `prometheus`, `grafana`. Profile `test` para testes com banco descartável. Senhas com valor padrão `troque-esta-senha`. Configs de observabilidade montadas dos mesmos arquivos de `k8s/observability/config/`.

Acesso: app em `localhost:3000`, Grafana em `localhost:3001`, Prometheus em `localhost:9090`, API direta em `localhost:8080`.

Fonte: `docker-compose.yml`.

### 5.2 Kubernetes local — `scripts/kind-up.sh`

- Cluster `kiro` em kind.
- Build das imagens localmente (tag `:local`).
- `kind load docker-image` para carregar no cluster.
- `kubectl kustomize k8s | sed s/latest/local/` + `kubectl apply`.
- Aguarda rollout do StatefulSet do banco (180s) e do Deployment da API (240s).

Fonte: `scripts/kind-up.sh`.

### 5.3 Port-forward — `scripts/port-forward.sh`

Abre em um único terminal: frontend (3000), Grafana (3001), Prometheus (9090), API (8080) e ArgoCD (8443). Fonte: `scripts/port-forward.sh`.

---

## 6. Rastreabilidade dos requisitos

| Requisito | Estado | Evidência |
|---|---|---|
| R-K8S-01 Deployments/StatefulSet por componente | Atendido | `k8s/api/deployment.yaml`, `k8s/frontend/deployment.yaml`, `k8s/database/statefulset.yaml` |
| R-K8S-01 Pods Running | Atendido | `docs/validacao-sre.md` seção 3.2 teste 4 |
| R-K8S-02 Service por componente | Atendido | `k8s/api/service.yaml`, `k8s/frontend/service.yaml`, `k8s/database/service.yaml` |
| R-K8S-02 Exposição externa | Atendido com divergência | ClusterIP + port-forward; Ingress comentado |
| R-K8S-03 ConfigMap de configuração | Atendido | `k8s/api/configmap.yaml` |
| R-K8S-03 Secret de credenciais | Atendido com divergência | `k8s/database/secret.yaml` (exemplo versionado) |
| R-K8S-04 Probes em todos os Deployments | Atendido | `k8s/api/deployment.yaml`, `k8s/frontend/deployment.yaml`, `k8s/database/statefulset.yaml` |
| R-K8S-04 Probes em endpoints reais | Atendido | Validado: `docs/validacao-sre.md` testes 1 e 7 |
| R-K8S-05 Namespace dedicado | Atendido | `k8s/base/namespace.yaml`, `k8s/kustomization.yaml` |
| R-CI-01 Build/push da API | Atendido com divergência | `.github/workflows/ci-cd.yaml` (workflow único, não por componente) |
| R-CI-02 Build/push do frontend | Atendido com divergência | Idem |
| R-CI-03 Atualização de tag nos manifests | Atendido com divergência | CI atualiza `kustomization.yaml`, não Deployment individual; `docs/validacao-sre.md` seção 3.3 |
| R-CI-04 Testes antes do build | Atendido | `needs: [test-api, test-frontend, validate]`; `docs/validacao-sre.md` seção 3.1 |
| R-GITOPS-01 Application ArgoCD | Atendido | `argocd/application.yaml` |
| R-GITOPS-01 Auto-sync | Atendido | `argocd/application.yaml` (automated.prune + selfHeal); `docs/validacao-sre.md` seção 3.2 |
| R-GITOPS-02 Subdiretórios por componente | Atendido com extensão | `k8s/api/`, `k8s/frontend/`, `k8s/database/`, `k8s/base/`, `k8s/observability/` |
| R-GITOPS-03 Deploy sem kubectl manual | Atendido | `docs/validacao-sre.md` seção 3.2 teste 4 |

---

## 7. Lacunas

### L-1 — Ingress sem Ingress Controller configurado (Q-01 pendente)

**Procurado:** `k8s/base/ingress.yaml` habilitado em `k8s/kustomization.yaml`.

**Encontrado:** `ingress.yaml` existe mas está comentado. Não há Ingress Controller configurado no cluster kind. A exposição externa é feita por `port-forward`. O host `encurtador.local` é um placeholder.

### L-2 — Credenciais de exemplo versionadas (R-K8S-03)

**Encontrado:** `k8s/database/secret.yaml` e `k8s/observability/grafana.yaml` contêm `troque-esta-senha` versionado no Git. Decisão de demo documentada em `docs/validacao-sre.md` (seção 5). Não é uma lacuna operacional para o ambiente do hackathon, mas não atende ao critério de "nenhuma credencial em texto claro nos manifests versionados" conforme enunciado.

### L-3 — Rollout sem downtime total (R-K8S-01, ressalva)

**Encontrado:** 1 erro `504` em 300 requisições durante `rollout restart deploy/api`. A causa exata (pod em encerramento atendendo requisição) não foi confirmada analiticamente. Documentado como limitação conhecida em `docs/validacao-sre.md` (seção 5).

### L-4 — `paths-ignore` não cobre push na `develop` para paths específicos

**Encontrado:** o `paths-ignore` do evento `push` ignora `**.md`, `docs/**` e `.kiro/**`. Alterações de código em qualquer componente disparam o pipeline para **ambos** os componentes em matriz. Não existe filtro por componente (ex.: só testar/buildar a API quando `api/` muda). Isso é uma simplificação aceita para o hackathon: o pipeline roda para os dois componentes mesmo que apenas um tenha mudado.

---

## 8. Plano original (substituído)

O design original previa:

- Três arquivos de workflow separados: `ci-api.yaml`, `ci-frontend.yaml`, `update-manifests.yaml`. **Substituído por:** workflow único `ci-cd.yaml` com jobs em matriz.
- YAML raw sem Kustomize. **Substituído por:** Kustomize com `configMapGenerator` e bloco `images`.
- `k8s/base/argocd-app.yaml`. **Substituído por:** `argocd/application.yaml` em diretório próprio.
- Atualização da tag diretamente no campo `image` do Deployment. **Substituído por:** atualização de `images[].newTag` em `k8s/kustomization.yaml`.
- Secrets configurados com `kubectl create secret` manual ou via GitHub Secrets. **Substituído por:** exemplos versionados com instruções de substituição (decisão de demo).
- Probes em `/health`. **Substituído por:** `/healthz` (liveness) e `/readyz` (readiness).
- GitHub Secrets `REGISTRY_TOKEN`, `REGISTRY_USER`, `K8S_DB_PASSWORD`, `K8S_DB_USER`. **Substituído por:** `GITHUB_TOKEN` nativo para GHCR (sem secrets adicionais para o registry).
