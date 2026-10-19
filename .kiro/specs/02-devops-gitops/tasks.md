Status: Aprovado em 2026-10-18 por Diêgo

# Tarefas — DevOps e GitOps

A primeira rodada (branch `feat/config-devops-diego`) preparou o terreno antes de existir API e frontend. A segunda (`feat/devops-gitops-python`) encaixou a API em Python e reorganizou tudo em kustomize com um pipeline único. As tarefas abaixo seguem essa ordem.

## 1. Esqueleto inicial

- [x] 1.1 Namespace `encurtador` e estrutura `k8s/api`, `k8s/frontend`, `k8s/database` e `k8s/base`.
- [x] 1.2 Primeiros manifests de API, frontend e banco, com placeholders de imagem.
- [x] 1.3 Workflows separados por componente e um rascunho da Application do ArgoCD.
- [x] 1.4 Guia para o time de como encaixar cada parte (`docs/devops-integration-guide.md`).

Essa rodada foi revisada quando a API ficou pronta. Os problemas encontrados estão na tarefa 3.

## 2. Manifests com kustomize

- [x] 2.1 `k8s/kustomization.yaml` como ponto de entrada, com namespace, labels e bloco `images`.
- [x] 2.2 API: Deployment com 2 réplicas, ConfigMap, Service e probes `/healthz` e `/readyz`.
- [x] 2.3 Banco: StatefulSet com PVC de 1Gi, Service interno e Secret de exemplo.
- [x] 2.4 Frontend: Deployment e Service (no começo um nginx de placeholder com proxy de `/api` e `/r`).
- [x] 2.5 Ingress apontando para o frontend, deixado comentado até termos um Ingress Controller.

Verificação: `kubectl kustomize k8s` sem erro e kubeconform `-strict` passando.

## 3. Correções da primeira rodada

- [x] 3.1 Probes trocadas de `/health` para `/healthz` e `/readyz`, conforme o contrato da API.
- [x] 3.2 Secret com base64 inválido corrigido.
- [x] 3.3 `rewrite-target: /` removido do Ingress, porque quebrava as rotas `/api`.
- [x] 3.4 Nome da imagem em minúsculas para o GHCR.
- [x] 3.5 `startupProbe` da API com 120s de orçamento, acima da espera interna de 60s.

Verificação: no kind, todos os pods `Ready` e a API sobrevivendo ao primeiro boot do Postgres.

## 4. Pipeline único

- [x] 4.1 Juntar os dois workflows em `ci-cd.yaml`, para acabar com os pushes concorrentes de tag.
- [x] 4.2 Jobs `test-api` e `validate` (kustomize, kubeconform com o CRD do ArgoCD e `docker compose config`).
- [x] 4.3 Job `build` em matriz, publicando no GHCR só na `main`.
- [x] 4.4 Job `deploy` com `yq`, commit `[skip ci]` e retry com rebase.
- [x] 4.5 Job `test-frontend` quando o frontend real entrou.
- [x] 4.6 Pipeline também na `develop` e em PR, sem publicar; runner fixo em `ubuntu-24.04`.

Verificação: actionlint sem avisos; PR com deploy pulado; merge na `main` com o bot commitando a tag.

## 5. ArgoCD

- [x] 5.1 `argocd/application.yaml` com sync automático, `prune`, `selfHeal`, `CreateNamespace` e retry.
- [x] 5.2 `scripts/argocd-up.sh` com versão fixa (v3.5.5), espera pelo sync e senha do admin.
- [x] 5.3 Roteiro de demo do GitOps no README.

Verificação: Application `Synced` e `Healthy`; nova tag aplicada no cluster cerca de 3 minutos depois do merge; self-heal desfazendo um `kubectl scale`.

## 6. Ambiente local e scripts

- [x] 6.1 `scripts/kind-up.sh` com imagens locais.
- [x] 6.2 `scripts/port-forward.sh` com todas as portas num terminal.
- [x] 6.3 `scripts/gerar-trafego.sh` para a demo.
- [x] 6.4 Scripts com permissão de execução no Git (`100755`).

Verificação: clone limpo rodando os scripts direto.

## 7. Validação ponta a ponta

- [x] 7.1 Banco fora do ar, persistência, rollout, deploy GitOps, 404/410, `trace_id` no log do nginx e probes sem traces, tudo registrado no `docs/validacao-sre.md`.

## Pendências

- [ ] Decidir o ambiente final (D-02) e testar o Ingress com um controller de verdade.
- [ ] Investigar o 504 no rollout (`preStop` e `maxUnavailable: 0`).
- [ ] Testar os scripts e o README no macOS e no Windows.
