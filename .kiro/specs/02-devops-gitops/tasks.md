Status: Reconciliado com a implementação em 18/10/2026 (escrito após a implementação)

> Tarefas reconstruídas a partir da implementação; não refletem o histórico real do desenvolvimento.

# Tasks — 02-devops-gitops

---

## Concluídas

### T-A01 — Namespace e estrutura de diretórios
**Arquivo:** `k8s/base/namespace.yaml`, `k8s/kustomization.yaml`

- [x] Namespace `encurtador` definido em `k8s/base/namespace.yaml`
- [x] Kustomization com `namespace: encurtador` aplicado globalmente
- [x] Estrutura: `k8s/api/`, `k8s/frontend/`, `k8s/database/`, `k8s/base/`, `k8s/observability/`

---

### T-A02 — ConfigMap da API
**Arquivo:** `k8s/api/configmap.yaml`

- [x] Variáveis não sensíveis: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_POOL_MAX`, `BASE_URL`, `SHORT_CODE_LENGTH`
- [x] Variáveis OTel: `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_PROPAGATORS`, `OTEL_TRACES_SAMPLER`

---

### T-A03 — Secret do banco de dados
**Arquivo:** `k8s/database/secret.yaml`

- [x] Secret `db-credentials` com chaves `DB_USER` e `DB_PASSWORD`
- [x] Valores de exemplo (`troque-esta-senha`) com instruções de substituição
- [x] Comentário explicando como criar Secret real fora do Git (via `kubectl create secret` ou Sealed Secrets)

---

### T-B01 — Deployment e Service da API
**Arquivos:** `k8s/api/deployment.yaml`, `k8s/api/service.yaml`

- [x] 2 réplicas
- [x] `envFrom: configMapRef: api-config` + `env` de `secretKeyRef: db-credentials`
- [x] `startupProbe` em `/healthz` (2s × 60 tentativas)
- [x] `livenessProbe` em `/healthz` (período 10s)
- [x] `readinessProbe` em `/readyz` (período 5s)
- [x] Anotações de scrape Prometheus (`prometheus.io/scrape`, `prometheus.io/port`, `prometheus.io/path`)
- [x] Segurança: `runAsNonRoot`, `runAsUser: 10001`, `readOnlyRootFilesystem`, `allowPrivilegeEscalation: false`, `capabilities: drop: ALL`, `seccompProfile: RuntimeDefault`
- [x] Volume `tmp` (emptyDir) para `readOnlyRootFilesystem`
- [x] Service ClusterIP porta 8080

---

### T-B02 — Deployment e Service do Frontend
**Arquivos:** `k8s/frontend/deployment.yaml`, `k8s/frontend/service.yaml`

- [x] 2 réplicas
- [x] Imagem `nginx:1.27-alpine-otel` (módulo ngx_otel_module)
- [x] `livenessProbe` e `readinessProbe` em `/healthz`
- [x] `securityContext: allowPrivilegeEscalation: false`
- [x] Service ClusterIP porta 80

---

### T-B03 — StatefulSet e Service do banco
**Arquivos:** `k8s/database/statefulset.yaml`, `k8s/database/service.yaml`

- [x] StatefulSet `postgres:16-alpine` (D-05)
- [x] Credenciais de `secretKeyRef: db-credentials`; `DB_NAME` de `configMapKeyRef: api-config`
- [x] `PGDATA=/var/lib/postgresql/data/pgdata` (subdiretório para evitar conflito com `lost+found`)
- [x] `readinessProbe` e `livenessProbe` via `pg_isready`
- [x] PVC `db-data` de 1Gi (ReadWriteOnce)
- [x] Service ClusterIP porta 5432 (não exposto fora do cluster)

Validado em execução: dados persistem após recriação do pod (`docs/validacao-sre.md`, seção 3.2, teste 2).

---

### T-B04 — Ingress (opcional, comentado)
**Arquivo:** `k8s/base/ingress.yaml`

- [x] Arquivo `ingress.yaml` criado: roteia tudo para o Service `frontend` (sem rewrite)
- [x] Está **comentado** em `k8s/kustomization.yaml` — ativado quando o cluster tiver Ingress Controller (Q-01 pendente)

---

### T-C01 — Pipeline de CI/CD unificado
**Arquivo:** `.github/workflows/ci-cd.yaml`

- [x] Gatilhos: `push` em `main`/`develop` (com `paths-ignore`), `pull_request`, `workflow_dispatch`
- [x] `concurrency` com `cancel-in-progress: true` em PRs
- [x] Job `test-api`: pytest + Postgres service, Python 3.12, cache pip
- [x] Job `test-frontend`: lint + testes + build, Node 22, cache npm
- [x] Job `validate`: kubeconform (Kubernetes + CRDs do ArgoCD) + `docker compose config`
- [x] Job `build`: matriz `[api, frontend]`; nome de imagem em minúsculas; tags `<sha7>` e `latest`; push somente na `main`; cache Docker por componente; labels OCI
- [x] Job `deploy`: `yq` atualiza `images[].newName` e `images[].newTag` em `k8s/kustomization.yaml`; commit `"deploy: api e frontend em <sha7> [skip ci]"`; retry × 3 com rebase automático

Validado em execução: `docs/validacao-sre.md` (seção 3.3: 6 jobs verdes, bot commitou nova tag).

---

### T-D01 — Application do ArgoCD
**Arquivo:** `argocd/application.yaml`

- [x] Application `kiro-portal`, namespace `argocd`
- [x] `source.path: k8s`, `targetRevision: main`
- [x] `automated.prune: true`, `automated.selfHeal: true`
- [x] `syncOptions: CreateNamespace=true`
- [x] Retry com backoff exponencial (5 tentativas, máx 3 min)
- [x] Finalizer `resources-finalizer.argocd.argoproj.io`

---

### T-D02 — Script de instalação do ArgoCD
**Arquivo:** `scripts/argocd-up.sh`

- [x] Versão fixa `v3.5.5`
- [x] `kubectl apply --server-side --force-conflicts` (CRDs grandes)
- [x] Aguarda rollout do `argocd-server` e `argocd-application-controller`
- [x] Aplica `argocd/application.yaml`
- [x] Aguarda `Synced/Healthy` (até 5 min)
- [x] Exibe senha do `admin` ao final

---

### T-D03 — Script de cluster local
**Arquivo:** `scripts/kind-up.sh`

- [x] Cria cluster kind `kiro` se não existir
- [x] Builda e carrega imagens locais (`tag: local`) com `kind load docker-image`
- [x] Aplica manifests com `kubectl kustomize k8s | sed s/latest/local/`
- [x] Aguarda rollout do StatefulSet e do Deployment da API

---

### T-D04 — Scripts auxiliares
**Arquivos:** `scripts/port-forward.sh`, `scripts/gerar-trafego.sh`

- [x] `port-forward.sh`: abre todas as portas (3000, 3001, 9090, 8080, 8443) num terminal só com `kubectl port-forward` em background + `wait`
- [x] `gerar-trafego.sh`: cria links e gera cliques em loop por N segundos

---

### T-E01 — Validação ponta a ponta
**Evidência:** `docs/validacao-sre.md`

- [x] Docker Compose: 7 containers no ar; healthchecks; `/healthz`, `/readyz`, `/metrics` respondem; Prometheus com alvo `UP`
- [x] Redirects: 302 para link ativo, 404 para inexistente, 410 para expirado
- [x] Carga: ~27 cliques/s; p50 ≈ 6 ms, p95 ≈ 10 ms, p99 ≈ 30–38 ms; 0% de erros 5xx
- [x] Banco fora do ar: pods saem do balanceamento sem reiniciar; recovery automático (seção 3.2, teste 1)
- [x] Persistência: dados sobrevivem à recriação do pod do Postgres (seção 3.2, teste 2)
- [x] Deploy GitOps: ArgoCD aplicou nova tag sem kubectl manual (seção 3.2, teste 4)
- [x] Self-heal: 5 réplicas voltaram a 2 em segundos (seção 3.2)
- [x] Trace_id no log do nginx (seção 3.2, teste 6)
- [x] Probes sem traces (seção 3.2, teste 7)
- [x] Testes: 44 testes da API passam, 92 testes do frontend passam (seção 3.1)
- [x] Pipeline CI: 6 jobs verdes, bot commitou nova tag (seção 3.3)

---

## Obsoletas (plano original — substituídas)

| Tarefa original | Motivo de obsolescência |
|---|---|
| A-01: criar `.gitkeep` em `k8s/observability/` | Substituído: `k8s/observability/` tem manifests reais |
| C-01: criar `ci-api.yaml` separado | Substituído por: workflow único `ci-cd.yaml` com matriz |
| C-02: criar `ci-frontend.yaml` separado | Idem |
| C-03: step `update-manifests.yaml` separado | Substituído por: job `deploy` inline em `ci-cd.yaml` |
| D-01: criar `k8s/base/argocd-app.yaml` | Substituído por: `argocd/application.yaml` em diretório próprio |
| YAML raw sem Kustomize | Substituído por: Kustomize com `configMapGenerator` e bloco `images` |
| Atualizar campo `image` no Deployment via yq | Substituído por: atualizar `images[].newTag` em `k8s/kustomization.yaml` |
| GitHub Secrets `REGISTRY_TOKEN`/`REGISTRY_USER` | Substituído por: `GITHUB_TOKEN` nativo para GHCR |
| Probes em `/health` | Substituído por: `/healthz` (liveness) e `/readyz` (readiness) |

---

## Verificações pendentes

### V-01 — Ingress com Ingress Controller real (Q-01)
**Resultado: não verificado.** O Ingress existe mas não foi testado com um Ingress Controller instalado. Depende da decisão D-02 sobre o ambiente definitivo.

### V-02 — Ambiente do bootcamp (D-02)
**Resultado: não verificado.** A stack foi validada somente em kind local (`docs/validacao-sre.md`, seção 2). O comportamento no cluster do bootcamp (se diferente do kind) não foi verificado.

### V-03 — Causa exata do `504` no rollout (L-3)
**Resultado: não confirmado.** Um `504` em 300 requisições durante `rollout restart deploy/api`. A hipótese é pod em encerramento atendendo requisição, mas o log do nginx não foi analisado para confirmar. Documentado como limitação conhecida em `docs/validacao-sre.md` (seção 5).

### V-04 — Testes no macOS e Windows
**Resultado: não verificado.** A validação foi feita somente em Linux (Ubuntu). O README documenta os comandos de instalação do kind e kubectl para macOS e Windows, mas esses caminhos não foram executados (`docs/validacao-sre.md`, seção 5).
