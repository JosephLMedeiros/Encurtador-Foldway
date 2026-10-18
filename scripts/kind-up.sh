#!/usr/bin/env bash
# Plano B para a demo: sobe todo o portal num cluster kind local, com as imagens buildadas
# localmente (sem depender do GHCR). Requer: docker, kind, kubectl.
# Uso: scripts/kind-up.sh            (depois: kubectl -n encurtador port-forward svc/frontend 3000:80)
set -euo pipefail
cd "$(dirname "$0")/.."

CLUSTER=kiro
TAG=local
REPO=ghcr.io/josephlmedeiros/rascunho-encurtador

kind get clusters | grep -qx "$CLUSTER" || kind create cluster --name "$CLUSTER" --wait 120s

for c in api frontend; do
  docker build -t "$REPO/$c:$TAG" "./$c"
  kind load docker-image --name "$CLUSTER" "$REPO/$c:$TAG"
done

# Mesmos manifests do GitOps, só trocando a tag das imagens da app.
kubectl kustomize k8s | sed "s#$REPO/\(api\|frontend\):latest#$REPO/\1:$TAG#" | kubectl apply -f -
kubectl -n encurtador rollout status statefulset/database --timeout=180s
kubectl -n encurtador rollout status deploy/api --timeout=240s
kubectl -n encurtador get pods

cat <<MSG

Pronto. Em terminais separados:
  kubectl -n encurtador port-forward svc/frontend 3000:80   # app em http://localhost:3000
  kubectl -n encurtador port-forward svc/grafana 3001:3000  # Grafana em http://localhost:3001
MSG
