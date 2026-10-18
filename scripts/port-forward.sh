#!/usr/bin/env bash
trap 'kill $(jobs -p) 2>/dev/null' EXIT

kubectl -n encurtador port-forward svc/frontend 3000:80 &
kubectl -n encurtador port-forward svc/grafana 3001:3000 &
kubectl -n encurtador port-forward svc/prometheus 9090:9090 &
kubectl -n argocd port-forward svc/argocd-server 8443:443 &

echo "Port-forwards ativos. Ctrl+C para encerrar todos."
wait