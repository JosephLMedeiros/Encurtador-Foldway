Status: Rascunho

# Tasks — 02-devops-gitops

## Dependências externas antes de iniciar

- [x] D-02 confirmada (ambiente Kubernetes).
- [x] D-10 confirmada (registry de imagens).
- [x] Q-01 confirmada (tipo de exposição externa).
- [x] Q-02 confirmada (estratégia de banco).
- [x] Q-03 verificada (status do ArgoCD no cluster).
- [x] Spec `01-nucleo-funcional` deve ter ao menos o design aprovado (para saber porta/path do health check, variáveis de ambiente e Dockerfiles esperados).

---

## Grupo A — Estrutura base (pode ser feito já)

### Tarefa A-01 — Criar estrutura de diretórios e arquivo de namespace

**Escopo:** Criar os diretórios `k8s/base/`, `k8s/api/`, `k8s/frontend/`, `k8s/database/`,
`k8s/observability/` e `.github/workflows/`. Criar o manifesto `k8s/base/namespace.yaml`.

**Arquivos criados/alterados:**
- `k8s/base/namespace.yaml`
- `k8s/observability/.gitkeep`

**Verificações:**
- [x] `kubectl apply -f k8s/base/namespace.yaml` cria o namespace sem erros.
- [x] `kubectl get namespace encurtador` retorna o namespace.

**Dependências:** nenhuma.

---

### Tarefa A-02 — Criar ConfigMap da API

**Escopo:** Criar `k8s/api/configmap.yaml` com as variáveis de configuração não sensíveis
da API (ex.: porta, nome do banco, nível de log). Usar valores placeholder que serão ajustados
conforme a spec `01-nucleo-funcional`.

**Arquivos criados/alterados:**
- `k8s/api/configmap.yaml`

**Verificações:**
- [x] `kubectl apply -f k8s/api/configmap.yaml -n encurtador` sem erros.
- [x] `kubectl describe configmap api-config -n encurtador` mostra as chaves esperadas.

**Dependências:** A-01 (namespace deve existir).

---

### Tarefa A-03 — Criar Secret placeholder do banco de dados

**Escopo:** Criar `k8s/database/secret.yaml` com a estrutura do Secret (chaves sem valores
reais — valores serão `<PLACEHOLDER>`). Adicionar instrução clara no arquivo sobre como
injetar os valores reais. Adicionar `k8s/database/secret.yaml` ao `.gitignore` ou documentar
que o arquivo versionado não contém credenciais.

**Arquivos criados/alterados:**
- `k8s/database/secret.yaml`
- `.gitignore` (se necessário)

**Verificações:**
- [x] O arquivo versionado não contém credenciais reais.
- [x] Existe uma instrução (comentário ou README) de como criar o Secret com valores reais.

**Dependências:** A-01.

---

## Grupo B — Manifests de aplicação (aguarda confirmação das decisões pendentes + design da 01)

### Tarefa B-01 — Criar Deployment e Service da API

**Escopo:** Criar `k8s/api/deployment.yaml` e `k8s/api/service.yaml` com as especificações
do design desta spec. A imagem usa a tag `IMAGE_TAG_PLACEHOLDER` que será substituída pelo CI.
Incluir liveness e readiness probes apontando para `/health`.

**Arquivos criados/alterados:**
- `k8s/api/deployment.yaml`
- `k8s/api/service.yaml`

**Verificações:**
- [x] `kubectl apply -f k8s/api/ -n encurtador` sem erros de sintaxe.
- [x] Após substituição de imagem real: `kubectl rollout status deployment/api -n encurtador`.
- [x] `kubectl get svc api -n encurtador` mostra o Service.

**Dependências:** A-01, A-02, A-03. Requer confirmação da porta e do path de health da API.

---

### Tarefa B-02 — Criar Deployment e Service do Frontend

**Escopo:** Criar `k8s/frontend/deployment.yaml` e `k8s/frontend/service.yaml`. A imagem usa
tag placeholder. Incluir probes apontando para `/` (ou path acordado com equipe de frontend).

**Arquivos criados/alterados:**
- `k8s/frontend/deployment.yaml`
- `k8s/frontend/service.yaml`

**Verificações:**
- [x] `kubectl apply -f k8s/frontend/ -n encurtador` sem erros de sintaxe.
- [x] Após imagem real: `kubectl rollout status deployment/frontend -n encurtador`.

**Dependências:** A-01. Requer confirmação da porta e do path de health do frontend.

---

### Tarefa B-03 — Criar StatefulSet e Service do banco de dados

**Escopo:** Criar `k8s/database/statefulset.yaml` e `k8s/database/service.yaml`. Tipo de
banco conforme D-05 (pendente). Usar a imagem oficial do banco escolhido. Configurar
`volumeClaimTemplate` de 1Gi para persistência.

**Arquivos criados/alterados:**
- `k8s/database/statefulset.yaml`
- `k8s/database/service.yaml`

**Verificações:**
- [x] `kubectl apply -f k8s/database/ -n encurtador` sem erros.
- [x] `kubectl get statefulset -n encurtador` mostra o StatefulSet.
- [x] Pod do banco atinge status `Running`.

**Dependências:** A-01, A-03. Requer D-05 confirmada.

---

### Tarefa B-04 — Criar Ingress (ou ajustar Services para NodePort)

**Escopo:** Conforme decisão Q-01. Se Ingress: criar `k8s/base/ingress.yaml` expondo frontend
e API. Se NodePort: ajustar os Services de frontend e API para tipo `NodePort`.

**Arquivos criados/alterados:**
- `k8s/base/ingress.yaml` (se Ingress)
- ou ajuste em `k8s/api/service.yaml` e `k8s/frontend/service.yaml` (se NodePort)

**Verificações:**
- [x] Frontend acessível pelo browser via URL/IP+porta do cluster.
- [x] API acessível por `curl` via URL/IP+porta do cluster.

**Dependências:** B-01, B-02. Requer Q-01 confirmada.

---

## Grupo C — Pipeline CI/CD (aguarda D-10 e Dockerfiles)

### Tarefa C-01 — Criar workflow de CI da API

**Escopo:** Criar `.github/workflows/ci-api.yaml`. O workflow deve: disparar em push para
`main` com mudanças em `api/**`; executar step de teste (placeholder); fazer build e push da
imagem para o registry (D-10); chamar o step de atualização de manifests.

**Arquivos criados/alterados:**
- `.github/workflows/ci-api.yaml`

**Verificações:**
- [x] Push de um arquivo em `api/` na branch `main` dispara o workflow.
- [x] O workflow aparece na aba Actions do GitHub.
- [x] Quando o Dockerfile da API existir: workflow conclui com sucesso e imagem aparece no registry.

**Dependências:** D-10 confirmada. Dockerfile da API (criado pela equipe de backend).

---

### Tarefa C-02 — Criar workflow de CI do Frontend

**Escopo:** Criar `.github/workflows/ci-frontend.yaml`. Similar ao C-01, mas para o frontend
e disparado por mudanças em `frontend/**`.

**Arquivos criados/alterados:**
- `.github/workflows/ci-frontend.yaml`

**Verificações:**
- [x] Push de um arquivo em `frontend/` dispara o workflow.
- [x] Quando o Dockerfile do frontend existir: workflow conclui com sucesso.

**Dependências:** D-10 confirmada. Dockerfile do frontend (criado pela equipe de frontend).

---

### Tarefa C-03 — Criar step de atualização de manifests

**Escopo:** Adicionar step reutilizável (ou inline em cada workflow) que usa `yq` para
atualizar a tag de imagem no manifesto correspondente e faz commit + push.

**Arquivos criados/alterados:**
- Embutido em `.github/workflows/ci-api.yaml` e `ci-frontend.yaml`

**Verificações:**
- [x] Após execução do CI, o arquivo `k8s/api/deployment.yaml` ou `k8s/frontend/deployment.yaml`
      tem a nova tag no campo `image`.
- [x] O commit de atualização aparece no histórico do repositório.

**Dependências:** C-01, C-02.

---

## Grupo D — GitOps ArgoCD

### Tarefa D-01 — Criar manifesto da Application do ArgoCD

**Escopo:** Criar `k8s/base/argocd-app.yaml` com a Application apontando para `k8s/` deste
repositório, namespace `encurtador`, auto-sync habilitado.

**Arquivos criados/alterados:**
- `k8s/base/argocd-app.yaml`

**Verificações:**
- [x] `kubectl apply -f k8s/base/argocd-app.yaml -n argocd` sem erros.
- [x] A Application aparece na interface do ArgoCD com status `Synced`.

**Dependências:** A-01. Requer Q-03 confirmada (ArgoCD instalado no cluster).

---

### Tarefa D-02 — Verificar sincronização ponta a ponta

**Escopo:** Fazer um commit pequeno de teste nos manifests (ex.: alterar um label), verificar
que o ArgoCD detecta a mudança e sincroniza sem intervenção manual.

**Verificações:**
- [x] ArgoCD detecta divergência em até 3 minutos após o commit.
- [x] Status volta para `Synced` automaticamente sem `kubectl apply`.
- [x] O label alterado aparece no recurso via `kubectl describe`.

**Dependências:** D-01, todos os manifests de B aplicados.

---

## Grupo E — Verificação ponta a ponta (demo)

### Tarefa E-01 — Smoke test do fluxo completo

**Escopo:** Com a aplicação no ar, executar o fluxo: commit na API → CI verde → manifesto
atualizado → ArgoCD sincroniza → novo Pod sobe → aplicação responde.

**Verificações:**
- [x] O workflow de CI conclui sem erros.
- [x] A nova tag de imagem aparece no manifesto após o CI.
- [x] O ArgoCD sincroniza automaticamente.
- [x] `kubectl get pods -n encurtador` mostra todos os Pods em `Running`.
- [x] A API responde em `/health` com status 200.
- [x] O frontend carrega no browser.

**Dependências:** todos os grupos anteriores concluídos. Requer backend e frontend prontos.

---

## Ordem de execução sugerida

```
A-01 → A-02 → A-03   (pode ser feito agora, em paralelo entre si após A-01)
            ↓
B-01, B-02, B-03     (em paralelo, aguarda decisões pendentes)
            ↓
B-04                 (aguarda B-01 e B-02)
            ↓
C-01, C-02           (em paralelo, aguarda Dockerfiles)
            ↓
C-03                 (inline no C-01/C-02)
            ↓
D-01                 (pode ser antecipado logo após A-01)
            ↓
D-02                 (aguarda todos os B)
            ↓
E-01                 (smoke test final)
```
