#!/usr/bin/env bash
# Instala o ArgoCD no cluster do contexto atual do kubectl e registra a Application do portal.
# Depois disso, tudo chega pelo Git: cada push na main vira deploy (GitOps).
# Requer: kubectl apontando para o cluster (ex.: kind-kiro, criado por scripts/kind-up.sh).
# Uso: scripts/argocd-up.sh
set -euo pipefail
cd "$(dirname "$0")/.."

ARGOCD_VERSION=v3.5.5   # versão fixa: a demo não muda sozinha se sair uma release nova

kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
# --server-side: os CRDs do ArgoCD passam do limite de tamanho do apply tradicional
kubectl apply -n argocd --server-side --force-conflicts \
  -f "https://raw.githubusercontent.com/argoproj/argo-cd/${ARGOCD_VERSION}/manifests/install.yaml"
kubectl -n argocd rollout status deploy/argocd-server --timeout=300s
kubectl -n argocd rollout status statefulset/argocd-application-controller --timeout=300s

kubectl apply -n argocd -f argocd/application.yaml

echo "Aguardando a primeira sincronização da main..."
for _ in $(seq 1 60); do
  status=$(kubectl -n argocd get application kiro-portal \
    -o jsonpath='{.status.sync.status}/{.status.health.status}' 2>/dev/null || true)
  [ "$status" = "Synced/Healthy" ] && break
  sleep 5
done
echo "Application kiro-portal: ${status:-sem status}"

password=$(kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d)

cat <<MSG

Pronto. Interface do ArgoCD:
  kubectl -n argocd port-forward svc/argocd-server 8443:443
  https://localhost:8443  (usuário: admin | senha: ${password})
O certificado é autoassinado: aceite o aviso do navegador.
MSG
