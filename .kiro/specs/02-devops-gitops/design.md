Status: Rascunho

# Design — 02-devops-gitops

## 1. Visão geral

Este documento descreve como os requisitos de infraestrutura, CI/CD e GitOps serão atendidos.
A abordagem central é o **mono-repo com GitOps**: o mesmo repositório contém o código da
aplicação e os manifests Kubernetes. O GitHub Actions constrói e publica as imagens e atualiza
as tags nos manifests. O ArgoCD observa o repositório e reconcilia o cluster com o estado
declarado.

```
┌─────────────────────────────────────────────────────────────────┐
│  Developer push → main                                           │
│           │                                                       │
│           ▼                                                       │
│   ┌───────────────┐   build + push   ┌──────────────────┐        │
│   │ GitHub Actions│ ───────────────► │  Container       │        │
│   │  (CI/CD)      │                  │  Registry (GHCR) │        │
│   └───────┬───────┘                  └──────────────────┘        │
│           │ atualiza tag em k8s/                                  │
│           ▼                                                       │
│   ┌───────────────┐   sync           ┌──────────────────┐        │
│   │  Git repo     │ ◄─── watch ──── │  ArgoCD          │        │
│   │  k8s/         │                  │  (GitOps)        │        │
│   └───────────────┘                  └────────┬─────────┘        │
│                                               │ apply             │
│                                               ▼                   │
│                                    ┌──────────────────┐          │
│                                    │  Kubernetes       │          │
│                                    │  Cluster          │          │
│                                    └──────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## 2. Organização dos manifests Kubernetes

Adota-se um **mono-repo com diretório `k8s/` plano por componente** (D-07: proposta).
Não se usa Helm nem Kustomize nesta fase para reduzir complexidade, dado o prazo do hackathon.
Os manifests são YAML raw, organizados por componente:

```
k8s/
├── base/
│   ├── namespace.yaml         # Namespace do projeto
│   └── argocd-app.yaml        # Application do ArgoCD
├── api/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── configmap.yaml
├── frontend/
│   ├── deployment.yaml
│   └── service.yaml
├── database/
│   ├── statefulset.yaml       # ou deployment.yaml se sem PVC
│   ├── service.yaml
│   └── secret.yaml            # placeholder — não contém valores reais
└── observability/             # reservado para spec 03-observabilidade
    └── .gitkeep
```

### Namespace

Todos os recursos usam o namespace `encurtador` (nome provisório, ajustar conforme identidade
definida em D-08).

### Estratégia de Secrets

O `database/secret.yaml` versionado no repositório contém **apenas a estrutura do Secret**
(chaves sem valores, ou com valores de exemplo). Os valores reais são injetados:
- No ambiente local: via `kubectl create secret` manual ou arquivo `.env` não versionado.
- No CI/CD: via GitHub Secrets, com o workflow criando/atualizando o Secret no cluster antes
  do ArgoCD sincronizar, **ou** via um External Secrets Operator (fora do escopo desta fase).

> **Decisão pendente Q-02:** se o banco for uma solução gerenciada (ex.: RDS, Cloud SQL),
> o StatefulSet e o Secret serão simplificados ou removidos.

## 3. Manifests Kubernetes — Detalhamento

### 3.1. Namespace

```yaml
# k8s/base/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: encurtador
```

### 3.2. API — Deployment

Variáveis de ambiente injetadas via ConfigMap e Secret. Probes apontam para `/health`
(a ser implementado pela equipe de backend).

```yaml
# k8s/api/deployment.yaml (resumido)
containers:
  - name: api
    image: ghcr.io/josephlmedeiros/rascunho-encurtador/api:TAG   # TAG atualizada pelo CI
    ports:
      - containerPort: 8080
    envFrom:
      - configMapRef:
          name: api-config
      - secretRef:
          name: db-credentials
    livenessProbe:
      httpGet:
        path: /health
        port: 8080
      initialDelaySeconds: 10
      periodSeconds: 15
    readinessProbe:
      httpGet:
        path: /health
        port: 8080
      initialDelaySeconds: 5
      periodSeconds: 10
```

### 3.3. Frontend — Deployment

Probe aponta para `/` ou `/healthz` (a ser implementado/confirmado pela equipe de frontend).

### 3.4. Database

Usa StatefulSet com `volumeClaimTemplate` de 1Gi para persistência durante o hackathon.
Se o ambiente não suportar PVC, pode ser simplificado para Deployment com `emptyDir`
(dados perdidos ao reiniciar o Pod — aceitável para demo se o time decidir assim).

> **Decisão pendente Q-02.**

### 3.5. Services

| Componente | Tipo sugerido      | Motivo                                           |
|------------|--------------------|--------------------------------------------------|
| API        | ClusterIP + Ingress | Acesso externo controlado via Ingress            |
| Frontend   | ClusterIP + Ingress | Idem                                             |
| Database   | ClusterIP          | Acesso apenas interno (pela API)                 |

> **Decisão pendente Q-01:** se não houver Ingress Controller no cluster do bootcamp,
> usar NodePort como fallback.

## 4. Pipeline CI/CD — GitHub Actions

### 4.1. Estrutura de workflows

```
.github/
└── workflows/
    ├── ci-api.yaml         # Build, test e push da API
    ├── ci-frontend.yaml    # Build e push do Frontend
    └── update-manifests.yaml  # Atualiza tags no k8s/ (chamado pelos anteriores)
```

### 4.2. Fluxo do CI (API como exemplo)

```
push para main (api/**)
        │
        ▼
  [checkout]
        │
        ▼
  [setup-language]   # ex.: setup-python, setup-node, setup-go — a definir (D-03)
        │
        ▼
  [test]             # placeholder: executa testes da API
        │
        ▼
  [docker-build]     # docker build -t <registry>/api:<sha>
        │
        ▼
  [docker-push]      # push para GHCR (ou registry configurado em D-10)
        │
        ▼
  [update-manifest]  # sed/yq atualiza image tag em k8s/api/deployment.yaml
        │
        ▼
  [git-commit]       # commit "chore: update api image to <sha>"
```

### 4.3. Segredos necessários (GitHub Secrets)

| Secret                  | Uso                                      |
|-------------------------|------------------------------------------|
| `REGISTRY_TOKEN`        | Autenticação no container registry      |
| `REGISTRY_USER`         | Usuário do registry                      |
| `K8S_DB_PASSWORD`       | Senha do banco (para criar Secret no K8s)|
| `K8S_DB_USER`           | Usuário do banco                         |

> **Nota:** os secrets acima são referenciados nos workflows mas seus valores devem ser
> cadastrados manualmente no GitHub (Settings → Secrets → Actions). Nenhum valor real
> é versionado no repositório.

### 4.4. Atualização de manifests (update-manifests.yaml)

O step usa `yq` (ferramenta de edição YAML) para atualizar o campo `image` no Deployment
correspondente e em seguida faz commit e push na branch `main`. O ArgoCD detecta a mudança
e sincroniza o cluster automaticamente.

```bash
# Exemplo de comando de atualização
yq e '.spec.template.spec.containers[0].image = "ghcr.io/josephlmedeiros/rascunho-encurtador/api:'"$SHA"'"' \
  -i k8s/api/deployment.yaml
```

## 5. ArgoCD — Configuração GitOps

### 5.1. Application

O manifesto `k8s/base/argocd-app.yaml` declara a Application do ArgoCD:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: encurtador
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/JosephLMedeiros/rascunho-encurtador.git
    targetRevision: main
    path: k8s
  destination:
    server: https://kubernetes.default.svc
    namespace: encurtador
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

> **Decisão pendente Q-03:** se o ArgoCD não estiver instalado no cluster do bootcamp,
> será necessário instalá-lo com `kubectl apply -n argocd -f
> https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml`
> antes de aplicar a Application.

### 5.2. Auto-sync

O ArgoCD monitora o diretório `k8s/` na branch `main`. Quando o CI atualiza a tag da imagem
e faz commit, o ArgoCD detecta a divergência e sincroniza automaticamente em até 3 minutos
(intervalo padrão do polling). Para demos ao vivo, pode-se forçar a sincronização manual
pela interface do ArgoCD.

## 6. Estratégia de imagens e tags

| Imagem         | Convenção de tag              | Exemplo                          |
|----------------|-------------------------------|----------------------------------|
| API            | `<sha7>` do commit            | `api:a1b2c3d`                   |
| Frontend       | `<sha7>` do commit            | `frontend:a1b2c3d`              |

Não se usa a tag `latest` em manifests de produção para garantir rastreabilidade.

## 7. Acomodação da observabilidade (spec 03)

O diretório `k8s/observability/` fica reservado para os manifests do stack de observabilidade
(Prometheus, Grafana, OpenTelemetry Collector) que serão adicionados pela equipe de SRE.
Os Deployments de API e frontend já incluem anotações de scrape do Prometheus como comentários,
para facilitar a instrumentação posterior:

```yaml
# Adicionar quando spec 03 for implementada:
# annotations:
#   prometheus.io/scrape: "true"
#   prometheus.io/port: "8080"
#   prometheus.io/path: "/metrics"
```

## 8. Pontos de integração com outras specs

| Spec                  | O que esta spec precisa delas                                    |
|-----------------------|------------------------------------------------------------------|
| 01-nucleo-funcional   | Porta e path do endpoint `/health` da API e do frontend          |
| 01-nucleo-funcional   | Variáveis de ambiente esperadas pela API (ex.: DATABASE_URL)     |
| 01-nucleo-funcional   | Dockerfile da API e do frontend                                  |
| 03-observabilidade    | Manifests de OTel Collector, Prometheus e Grafana (em k8s/observability/) |

## 9. Decisões registradas neste design

| ID    | Decisão proposta                               | Estado   |
|-------|------------------------------------------------|----------|
| D-07  | Mono-repo; manifests em `k8s/` por componente; YAML raw sem Helm/Kustomize | Proposta |
| D-10  | GHCR (GitHub Container Registry) como registry padrão | Proposta |
| Q-01  | ClusterIP + Ingress como padrão; fallback NodePort | Proposta |
| Q-02  | StatefulSet com PVC 1Gi para o banco           | Proposta |
| Q-03  | Verificar se ArgoCD está instalado no cluster do bootcamp | Pendente |
