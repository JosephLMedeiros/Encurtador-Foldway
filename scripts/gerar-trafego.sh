#!/usr/bin/env bash
# Gera tráfego para a demo: cria links e dispara cliques (inclui 404s para o painel de erros).
# Uso: scripts/gerar-trafego.sh [URL_BASE] [SEGUNDOS]
#   docker compose: scripts/gerar-trafego.sh http://localhost:3000 120
#   cluster:        kubectl -n encurtador port-forward svc/frontend 3000:80  (em outro terminal)
set -euo pipefail

BASE="${1:-http://localhost:3000}"
DURATION="${2:-60}"
CODES=(portal-alfa portal-beta portal-gama)

for code in "${CODES[@]}"; do
  curl -s -o /dev/null -X POST "$BASE/api/links" -H 'content-type: application/json' \
    -d "{\"original_url\":\"https://example.com/$code\",\"custom_code\":\"$code\"}" || true
done

echo "Gerando cliques em $BASE por ${DURATION}s (Ctrl+C para parar)..."
end=$((SECONDS + DURATION))
while (( SECONDS < end )); do
  # Distribuição desigual para o ranking "link do dia" ficar interessante
  for code in portal-alfa portal-alfa portal-alfa portal-beta portal-beta portal-gama; do
    curl -s -o /dev/null "$BASE/r/$code" &
  done
  curl -s -o /dev/null "$BASE/r/nao-existe-$RANDOM" &   # 404
  curl -s -o /dev/null "$BASE/api/ranking" &
  wait
  sleep 0.2
done
echo "Pronto."
