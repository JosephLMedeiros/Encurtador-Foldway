# Guia de Integração DevOps — Para o Time

Este documento explica o que já está pronto na infraestrutura e **o que cada pessoa do time
precisa fazer** para conectar seu trabalho ao pipeline.

## O que já está no lugar

```
.github/workflows/
├── ci-api.yaml        ← dispara automaticamente ao mexer em api/
└── ci-frontend.yaml   ← dispara automaticamente ao mexer em frontend/

k8s/
├── base/
│   ├── namespace.yaml     ← namespace "encurtador"
│   ├── argocd-app.yaml    ← configuração do ArgoCD (aplica tudo em k8s/)
│   └── ingress.yaml       ← expõe frontend e API externamente
├── api/
│   ├── deployment.yaml    ← Deployment com probes, envs e recursos definidos
│   ├── service.yaml       ← Service ClusterIP
│   └── configmap.yaml     ← variáveis não sensíveis (porta, host do banco etc.)
├── database/
│   ├── statefulset.yaml   ← PostgreSQL com PVC de 1Gi
│   ├── service.yaml       ← Service interno
│   └── secret.yaml        ← estrutura do Secret (SEM valores reais)
├── frontend/
│   ├── deployment.yaml    ← Deployment com probes e env da URL da API
│   └── service.yaml       ← Service ClusterIP
└── observability/
    └── .gitkeep           ← reservado para o SRE (spec 03)
```

---

## [Nome 3 — Backend] O que você precisa fazer

### 1. Criar o Dockerfile em `api/Dockerfile`

O CI espera um `Dockerfile` na raiz do diretório `api/`. Ele faz o build a partir daí.

Exemplo mínimo (Python/FastAPI):
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

### 2. Implementar o endpoint `/health`

O Kubernetes usa esse endpoint para saber se a API está viva. Ele precisa retornar `200 OK`.

```python
# FastAPI
@app.get("/health")
def health():
    return {"status": "ok"}
```

```javascript
// Express
app.get('/health', (req, res) => res.json({ status: 'ok' }))
```

### 3. Conferir as variáveis de ambiente disponíveis

Seu código receberá as seguintes variáveis já configuradas nos manifests:

| Variável      | De onde vem  | Valor atual (ajuste se necessário) |
|---------------|--------------|-------------------------------------|
| `APP_PORT`    | ConfigMap    | `8080`                              |
| `DB_HOST`     | ConfigMap    | `database.encurtador.svc.cluster.local` |
| `DB_PORT`     | ConfigMap    | `5432`                              |
| `DB_NAME`     | ConfigMap    | `encurtador`                        |
| `LOG_LEVEL`   | ConfigMap    | `info`                              |
| `DB_USER`     | Secret       | injetado pelo ops na criação do Secret |
| `DB_PASSWORD` | Secret       | idem                                |

Se precisar de mais variáveis, adicione em `k8s/api/configmap.yaml` (não sensíveis) ou avise
o DevOps para adicionar no Secret.

### 4. Confirmar a porta

O `deployment.yaml` espera que a API escute na porta `8080`. Se for diferente, avise o DevOps
para ajustar o `containerPort` e o ConfigMap.

---

## [Nome 4 — Frontend] O que você precisa fazer

### 1. Criar o Dockerfile em `frontend/Dockerfile`

Exemplo mínimo (Next.js):
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

### 2. Implementar um endpoint ou página de health check

O Kubernetes testa `GET /` (raiz) para a readiness probe. Se o framework retornar `200 OK`
na raiz automaticamente, não é necessário criar nada extra. Confirme com o DevOps se a porta
for diferente de `3000`.

### 3. Variável de ambiente da API

O endereço da API está em `NEXT_PUBLIC_API_URL` (Next.js) ou equivalente. O valor atual
é um placeholder — o DevOps vai ajustar conforme Q-01 for confirmada.

### 4. Confirmar a porta

O `deployment.yaml` espera que o frontend escute na porta `3000`. Se for diferente, avise.

---

## [Nome 2 — SRE & Observabilidade] O que você precisa fazer

O diretório `k8s/observability/` está reservado para você. Adicione seus manifests lá.

Os Deployments da API e do frontend já têm comentários com as anotações do Prometheus
esperando para serem descomentadas quando sua spec (03-observabilidade) chegar:

```yaml
# Descomente no k8s/api/deployment.yaml quando a spec 03 for implementada:
# annotations:
#   prometheus.io/scrape: "true"
#   prometheus.io/port: "8080"
#   prometheus.io/path: "/metrics"
```

---

## Decisões pendentes que bloqueiam partes do pipeline

| ID   | Questão                                      | Quem decide |
|------|----------------------------------------------|-------------|
| D-02 | Ambiente Kubernetes (kind local / cluster)   | Time todo   |
| D-03 | Linguagem da API                             | Nome 3      |
| D-04 | Framework do frontend                        | Nome 4      |
| D-05 | Banco de dados (PostgreSQL confirmado?)      | Nome 3      |
| D-08 | Nome do produto e namespace final            | Time todo   |
| D-10 | Registry (GHCR está como padrão)             | Confirmar   |
| Q-01 | Ingress ou NodePort?                         | Nome 1 + D-02 |
| Q-03 | ArgoCD já instalado no cluster?              | Nome 1      |

---

## Como criar o Secret do banco (sem commitar credenciais)

```bash
kubectl create secret generic db-credentials \
  --namespace encurtador \
  --from-literal=DB_USER=<usuario> \
  --from-literal=DB_PASSWORD=<senha> \
  --dry-run=client -o yaml | kubectl apply -f -
```

---

## Fluxo após as decisões estarem confirmadas

1. Backend cria o Dockerfile e o endpoint `/health`.
2. Frontend cria o Dockerfile.
3. DevOps ajusta os TODOs nos manifests (imagem, porta, host) e cria o Secret no cluster.
4. Primeiro push na branch `main` dispara o CI.
5. CI faz build, push da imagem e atualiza o manifesto.
6. ArgoCD detecta a mudança e sincroniza o cluster.
7. `kubectl get pods -n encurtador` deve mostrar tudo `Running`.
