Status: Rascunho

# Requirements — 02-devops-gitops

## 1. Contexto

Esta spec cobre a infraestrutura de entrega do encurtador de links: orquestração Kubernetes,
pipeline CI/CD via GitHub Actions e implantação GitOps via ArgoCD. Ela não define o comportamento
da aplicação em si (coberto em `01-nucleo-funcional`), mas define como os três componentes
(frontend, API, banco) são empacotados, entregues e mantidos em execução no cluster.

A spec de observabilidade (OpenTelemetry + Grafana) será tratada em `03-observabilidade`,
mas esta spec deve garantir que os manifests e a estrutura de diretórios já acomodam os
recursos de observabilidade que serão adicionados posteriormente.

## 2. Requisitos

### R-K8S-01 — Execução dos três componentes no Kubernetes
Os componentes frontend, API e banco de dados devem ser executados como workloads no cluster
Kubernetes. Cada componente deve ter seu próprio Deployment (ou StatefulSet para o banco).

**Critérios de aceitação:**
- Existe um Deployment (ou StatefulSet) para cada componente: frontend, api, banco.
- Os Pods de cada componente sobem com status `Running`.
- Os componentes conseguem se comunicar entre si dentro do cluster.

### R-K8S-02 — Services para acesso interno e externo
Cada componente deve ter um Service Kubernetes que permita acesso pelos outros componentes
do cluster. O frontend e a API devem ser acessíveis externamente.

**Critérios de aceitação:**
- Existe um Service para cada componente.
- O Service da API permite acesso interno pelo frontend.
- O frontend é exposto externamente (via NodePort, LoadBalancer ou Ingress, conforme o ambiente).
- A API é exposta externamente para testes e demo.

### R-K8S-03 — ConfigMaps e Secrets
Variáveis de configuração não sensíveis devem ser gerenciadas via ConfigMap. Credenciais e
variáveis sensíveis devem ser gerenciadas via Secret, nunca embutidas nos manifestos ou imagens.

**Critérios de aceitação:**
- Existe pelo menos um ConfigMap com configurações da aplicação (ex.: URL da API, nome do banco).
- Existe pelo menos um Secret para as credenciais do banco de dados.
- Nenhuma credencial está exposta em texto claro nos manifestos versionados no repositório.

### R-K8S-04 — Probes de saúde
Todos os Deployments devem ter liveness probe e readiness probe configuradas. O banco pode
ter apenas uma readiness probe inicial caso o tipo de probe não seja compatível com o driver.

**Critérios de aceitação:**
- Cada Deployment de aplicação (frontend, api) tem `livenessProbe` e `readinessProbe`.
- As probes apontam para endpoints reais que serão implementados pela equipe de backend/frontend.
- Os Pods só recebem tráfego após a readiness probe passar.

### R-K8S-05 — Namespace dedicado
Todos os recursos devem ser criados em um namespace próprio do projeto, não no namespace `default`.

**Critérios de aceitação:**
- Existe um manifesto de Namespace para o projeto.
- Todos os recursos (Deployments, Services, ConfigMaps, Secrets) referenciam esse namespace.

### R-CI-01 — Pipeline de CI: build e push de imagem (API)
O GitHub Actions deve construir e publicar a imagem Docker da API sempre que houver push
para a branch `main` com alterações no diretório `api/`.

**Critérios de aceitação:**
- O workflow é disparado por push na branch `main` com mudanças em `api/**`.
- O workflow faz checkout do código, build da imagem Docker e push para o registry configurado.
- O workflow falha se o build ou o push falharem.
- A tag da imagem inclui o SHA do commit.

### R-CI-02 — Pipeline de CI: build e push de imagem (Frontend)
O GitHub Actions deve construir e publicar a imagem Docker do frontend sempre que houver push
para a branch `main` com alterações no diretório `frontend/`.

**Critérios de aceitação:**
- O workflow é disparado por push na branch `main` com mudanças em `frontend/**`.
- O workflow faz checkout do código, build da imagem Docker e push para o registry configurado.
- O workflow falha se o build ou o push falharem.
- A tag da imagem inclui o SHA do commit.

### R-CI-03 — Atualização automática das tags de imagem nos manifests
Após o build e push de uma imagem, o pipeline deve atualizar automaticamente a tag da imagem
nos manifests Kubernetes do repositório e fazer commit dessa alteração, desencadeando o GitOps.

**Critérios de aceitação:**
- Após o push de nova imagem, o arquivo de manifesto correspondente é atualizado com a nova tag.
- O commit de atualização é registrado na branch `main` com mensagem padronizada.
- O ArgoCD detecta a alteração e sincroniza o cluster.

### R-CI-04 — Execução de testes no CI (ponto de integração)
O pipeline de CI deve ter uma etapa de testes que executa os testes automatizados da API
antes de construir e publicar a imagem. Se os testes falharem, o build não deve ser publicado.

**Critérios de aceitação:**
- O workflow inclui um step de execução de testes.
- O step de build/push só é executado se os testes passarem.
- Enquanto os testes da API não existirem, o step pode ser um placeholder que retorna sucesso.

### R-GITOPS-01 — Repositório como fonte de verdade (ArgoCD)
O ArgoCD deve monitorar o diretório `k8s/` do repositório e sincronizar o estado do cluster
com o estado declarado nos manifests.

**Critérios de aceitação:**
- Existe um manifesto de Application do ArgoCD apontando para o diretório `k8s/` deste repositório.
- O ArgoCD detecta alterações nos manifests e sincroniza automaticamente (auto-sync habilitado).
- O status de sincronização pode ser verificado na interface do ArgoCD.

### R-GITOPS-02 — Organização dos manifests Kubernetes
Os manifests Kubernetes devem ser organizados em subdiretórios por componente dentro de `k8s/`,
facilitando o rastreamento e a manutenção.

**Critérios de aceitação:**
- Existe um subdiretório para cada componente: `k8s/api/`, `k8s/frontend/`, `k8s/database/`.
- Existe um diretório para recursos compartilhados ou de namespace: `k8s/base/`.
- Cada subdiretório contém os manifests pertinentes ao componente correspondente.

### R-GITOPS-03 — Implantação via ArgoCD sem acesso manual ao cluster
O processo normal de deploy deve ocorrer exclusivamente pela atualização dos manifests no
repositório, sem a necessidade de executar `kubectl apply` manualmente.

**Critérios de aceitação:**
- Uma alteração de imagem no manifesto propagada pelo CI/CD resulta em um novo Pod sendo
  criado no cluster sem intervenção manual.
- O processo é demonstrável ao vivo durante o pitch.

## 3. Restrições e dependências

- A escolha do registry de imagens (D-10) e do ambiente Kubernetes (D-02) ainda estão pendentes
  no SSOT. Os manifests e workflows devem usar placeholders ou variáveis de ambiente/secrets do
  GitHub para esses valores, de forma que possam ser configurados sem alterar o código.
- Os endpoints de health check das probes dependem da implementação da API e do frontend
  (spec `01-nucleo-funcional`). Os manifests devem usar paths convencionados
  (`/healthz` ou `/health`) que serão implementados pelos responsáveis por cada componente.
- A organização GitOps (D-07) é decidida nesta spec.
- Esta spec não cobre a configuração detalhada de OpenTelemetry e Grafana (spec `03-observabilidade`),
  mas deve garantir que o namespace e os diretórios de manifests acomodem esses recursos.

## 4. Ambiguidades e decisões pendentes

| ID    | Questão                                                      | Estado   |
|-------|--------------------------------------------------------------|----------|
| D-02  | Ambiente Kubernetes (local/kind/cluster do bootcamp)         | Pendente |
| D-07  | Organização do repositório GitOps (mono-repo ou repo separado) | Pendente |
| D-10  | Registry de imagens (GHCR, Docker Hub, ECR etc.)             | Pendente |
| Q-01  | A exposição externa usará Ingress, NodePort ou LoadBalancer? | Pendente |
| Q-02  | O banco de dados usa StatefulSet com PVC ou solução gerenciada? | Pendente |
| Q-03  | O ArgoCD já está instalado no cluster do bootcamp?           | Pendente |
