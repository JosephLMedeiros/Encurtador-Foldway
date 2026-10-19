# Validação de SRE e Observabilidade

**Projeto:** Portal dos Links (Foldway)  
**Escopo:** execução do README do zero, validação da stack de observabilidade, do comportamento no Kubernetes e do fluxo GitOps  
**Período:** 17 e 18 de outubro de 2026

---

## 1. Resumo

O portal foi validado seguindo o README do zero, no Docker Compose e num cluster Kubernetes local (kind) com ArgoCD. A stack de observabilidade se mostrou correta de ponta a ponta: métricas, dashboard, traces atravessando navegador, frontend, API e banco, e detecção das falhas provocadas.

Dos sete testes de comportamento no cluster, **seis passaram integralmente** e **um passou com ressalva**: durante o rollout da API houve 1 erro `504` em 300 requisições. Esse resultado está registrado como limitação conhecida (seção 5).

A validação também encontrou **15 pontos de melhoria**, quase todos de documentação e portabilidade. Eles foram corrigidos ou documentados e estão listados na seção 4. As correções de README e do dashboard estão na branch `develop`; a etapa final é o merge na `main`.

## 2. Escopo e método

A validação tratou cada afirmação do README como uma hipótese a ser comprovada: executou-se o comando, comparou-se o resultado com o esperado e registrou-se a diferença.

**Ambiente**

| Item | Valor |
|---|---|
| Sistema | Ubuntu (Linux) |
| Execução local | Docker Compose |
| Kubernetes | kind (cluster `kiro`, 2 réplicas da API e do frontend) |
| GitOps | ArgoCD, instalado por `scripts/argocd-up.sh` |
| Observabilidade | Grafana 11.3.0, Prometheus 2.55.1, Tempo 2.6.1, OpenTelemetry Collector 0.120.0 |
| Banco | PostgreSQL 16 |
| CI | GitHub Actions (`ci-cd.yaml`), Python 3.12 e Node 22 |

**Execução.** Os testes foram executados manualmente. Um assistente de IA (Claude) apoiou o planejamento do roteiro, a análise das saídas e a redação deste documento. A execução dos comandos e as decisões sobre cada achado foram humanas.

## 3. Resultados

### 3.1 Docker Compose

| Verificação | Resultado |
|---|---|
| Subida da stack | 7 containers no ar; API e banco `healthy` |
| Endpoints | `/healthz` e `/readyz` respondem 200; `/metrics` expõe as métricas `kiro_*`; `/docs` lista todas as rotas do README |
| Coleta no Prometheus | Alvo da API `UP` (`up{app="api", job="kiro-pods"}`) |
| Redirect | `302` para link existente; `404` para inexistente |
| Carga (`gerar-trafego.sh`) | Cerca de 27 cliques/s; latência do redirect p50 ≈ 6 ms, p95 ≈ 10 ms, p99 ≈ 30 a 38 ms; erros 5xx em 0% |
| Consistência dos dados | O "Link do dia" (SQL direto no Postgres) mostrou 4092, 2728 e 1364 cliques, proporção 3:2:1, coerente com as métricas |
| Falha do banco | `/readyz` passou a 503, a lista do site sumiu, o painel de 5xx subiu (pico de cerca de 14%) e tudo se recuperou sozinho quando o banco voltou |
| Traces | `kiro-browser` → `kiro-frontend` → `kiro-api` → spans do Postgres, no mesmo Trace ID; rotas registradas como template (`/r/{short_code}`) |
| QR Code | `?via=qr` incrementa `kiro_feature_used_total{feature="qrcode"}`; acesso sem o parâmetro não altera o contador |
| Testes da API | 44 testes passam (Python 3.14 local e container `python:3.12`; o CI usa 3.12) |
| Testes do frontend | 92 testes em 14 arquivos passam; ESLint e Stylelint sem erros |

### 3.2 Kubernetes (kind) e GitOps

| Teste | O que o README afirma | Resultado |
|---|---|---|
| 1. Banco fora do ar | Os pods da API saem do balanceamento (readiness) sem reiniciar (liveness) | **Passou.** Com o StatefulSet do banco em 0 réplicas, os pods da API foram a `0/1` (eventos `Readiness probe failed: ... 503`), o site ficou indisponível e tudo voltou sozinho ao religar o banco. `RESTARTS` = 0 e nenhum evento de liveness |
| 2. Persistência | Os dados sobrevivem à recriação do pod do Postgres | **Passou.** O link criado antes da falha continuou respondendo `302` com o pod do banco recriado |
| 3. Rollout | O rollout acontece sem downtime | **Passou com ressalva.** Durante `rollout restart deploy/api`, em 300 requisições pelo frontend: 299 × `302` e 1 × `504` |
| 4. Deploy GitOps | O ArgoCD troca os pods para a nova tag | **Passou.** As imagens em uso (`...api:4b79deb` e `...frontend:4b79deb`) são as mesmas do `newTag` da `main`; aplicação `Synced` e `Healthy`, deployments `2/2` |
| 5. 404 e 410 | Link inexistente devolve 404 e expirado devolve 410 | **Passou.** Status confirmados no log do nginx |
| 6. `trace_id` no log do nginx | O log de acesso traz o ID do trace | **Passou.** O ID aparece no campo `trace=` e abriu o trace correspondente no Tempo |
| 7. Probes sem traces | As probes não geram traces | **Passou.** A busca por spans `healthz` e `readyz` devolveu 0 resultados, e a busca de controle por `short_code` devolveu vários traces. As probes existem: liveness em `/healthz` (período de 10 s) e readiness em `/readyz` (período de 5 s) |

**Self-heal do ArgoCD.** Ao escalar a API para 5 réplicas com `kubectl`, a aplicação ficou `OutOfSync` por alguns segundos e as 3 réplicas extras foram terminadas, voltando ao estado do Git.

**Painel de saúde.** No cluster, o painel "Pods da API no ar" mostra 2, como esperado (no Compose, 1).

### 3.3 Pipeline CI/CD

| Evento | Testes e build | Publica imagens | Atualiza a tag e faz o deploy |
|---|---|---|---|
| Pull Request | sim | não | não |
| Push na `develop` | sim | não | não |
| Push na `main` | sim | sim | sim |

- Pushes que alteram **apenas** `.md`, `docs/` ou `.kiro/` não disparam o pipeline (`paths-ignore`, só no evento de push).
- Num Pull Request, os 3 jobs de teste (API, frontend e manifests) e os 2 de build ficaram verdes e o job de deploy foi pulado.
- Após o merge na `main`, os 6 jobs rodaram e o bot commitou a nova tag (`652b3c7` → `4b79deb`) em `k8s/kustomization.yaml`, com `[skip ci]` para não disparar outro pipeline.

## 4. Achados e correções

| # | Área | Achado | Correção | Estado |
|---|---|---|---|---|
| 1 | Documentação | O comando `python` não existe no Ubuntu e a versão 3.12 não tinha instrução de instalação (o `python3` apontava para a 3.14) | Testes da API passam a rodar por um serviço do Compose (`profile test`, Python 3.12), igual em qualquer sistema; alternativa local com `python3` e versão explícita | Corrigido |
| 2 | Repositório | Scripts `.sh` com modo `100644`, sem permissão de execução ao clonar | Modo `100755` (PR #4). Verificado com um clone limpo | Corrigido |
| 3 | Documentação | `kind` e `kubectl` não constavam dos pré-requisitos (`kind: command not found`) | Pré-requisito opcional para a seção do Kubernetes e passo a passo de instalação (Linux, macOS e Windows) | Corrigido |
| 4 | Documentação | Acesso ao app e ao Grafana no cluster exigia vários `port-forward`, sem explicar que ocupam o terminal | Explicação na seção 3 e `scripts/port-forward.sh`, que abre as portas num terminal só | Corrigido |
| 5 | Documentação | A seção do ArgoCD misturava CI e CD e descrevia o fluxo antes da instalação | Seção 4 reescrita: diferença entre CI e CD com diagrama, instalação, interface, roteiro de demo e tabela de problemas | Corrigido |
| 6 | Documentação | O pipeline roda também em PR e na `develop`, e o README citava só a `main` | Tabela de gatilhos e regra do `paths-ignore` | Corrigido |
| 7 | Documentação | O Grafana abre como visitante e o clique no Trace ID só recarregava a página sem login; a senha do README foi confundida com `admin` | O "Roteiro da demo" explica o login (**Sign in**) e quando o `kiro-browser` aparece | Corrigido |
| 8 | Documentação | O primeiro `curl` do README não era explicado (cria um link; repetir devolve 409) | Explicação na seção "Como rodar" | Corrigido |
| 9 | Observabilidade | A legenda dos painéis HTTP trazia uma série "Value": requisições 404 sem rota reconhecida geram métricas sem o label `http_route` | Filtro `{http_route!=""}` nas queries de "Requisições/s por rota" e "Latência HTTP p95 por rota". O painel "Respostas por status" continua contando esse tráfego | Corrigido na `develop` |
| 10 | Documentação | O banco de teste (`docker run -d` sem `--rm`) ficava rodando após os testes | A limpeza entrou nos dois caminhos (`docker compose --profile test down` e `docker rm -f`) | Corrigido |
| 11 | Segurança | Limitações do ambiente de demo: senhas de exemplo versionadas, Grafana aberto como visitante, portas do Compose publicadas em `0.0.0.0`, API e Prometheus sem autenticação | Seção "Segurança e limitações conhecidas" no README. O `/metrics` não é exposto pelo frontend (a porta 3000 devolve a página do app) | Documentado |
| 12 | Segurança | `npm audit` reporta 7 vulnerabilidades *high*, todas na cadeia do Stylelint (`braces`) | `npm audit --omit=dev` retorna 0: só afeta ferramenta de desenvolvimento. `audit fix --force` faria downgrade do Stylelint | Risco aceito |
| 13 | Qualidade | Warning de depreciação no pytest (`httpx2`), vindo das bibliotecas | Sem ação; migrar quando o Starlette/FastAPI forem atualizados | Dívida técnica |
| 14 | Confiabilidade | 1 erro `504` em 300 requisições durante o rollout da API | Ver seção 5 | Limitação conhecida |
| 15 | Operação | O `selfHeal` do ArgoCD desfaz em segundos mudanças manuais (`scale`, `rollout restart`), o que impede testes de resiliência | Procedimento no Apêndice A | Documentado |

## 5. Limitações conhecidas e riscos aceitos

- **Rollout da API.** O `504` é o código que o nginx devolve quando a API não responde, o que sugere uma requisição atendida por um pod em encerramento. Essa causa é uma inferência: a estratégia de rollout e o log do nginx não foram analisados. Também não foi verificado se o painel de erros 5xx, que mede a API, registra erros gerados pelo nginx. Por isso, "sem downtime" deve ser lido como "sem downtime perceptível": nos testes, 0,3% das requisições falharam durante a troca dos pods.
- **Ambiente de demo.** Senhas de exemplo, Grafana sem login para visitantes, portas do Compose abertas para a rede e API e Prometheus sem autenticação são escolhas de demonstração, documentadas no README. Não devem ser levadas à produção.
- **Dependências de desenvolvimento.** As vulnerabilidades do Stylelint não chegam às imagens de produção.
- **Plataformas.** A validação foi feita em Linux (Ubuntu). macOS e Windows não foram testados. Como a aplicação roda em containers e em Kubernetes, o risco é baixo; as exceções são os scripts `.sh`, que exigem bash (no Windows, WSL ou Git Bash), e os comandos de instalação do kind e do kubectl para esses sistemas, que seguem a documentação oficial e não foram executados.
- **Itens não medidos.** O tempo entre o merge na `main` e os pods novos `Healthy` não foi cronometrado. O status 404/410 foi confirmado nos logs, mas a tela do Furl no navegador não foi registrada neste relatório.

## 6. Recomendações (não adotadas)

1. **Varreduras de segurança no CI:** `npm audit --omit=dev`, `pip-audit`, varredura das imagens com Trivy (começando só em modo relatório) e Dependabot. Hoje não há nenhuma, e o `npm ci` roda com `--no-audit`.
2. **Rollouts sem erro:** um `preStop` com uma pequena espera no Deployment da API, `maxUnavailable: 0` e um alerta que cubra erros gerados pelo nginx.
3. **Portas do Compose:** prefixar com `127.0.0.1:` o lado esquerdo dos `ports`, para que os serviços fiquem acessíveis apenas na própria máquina.

---

## Apêndice A: como reproduzir os testes do cluster

Pré-requisitos: cluster de pé (`kubectl -n encurtador get pods`), `scripts/port-forward.sh` em execução e um link de teste:

```bash
curl -s -X POST localhost:3000/api/links -H 'content-type: application/json' \
  -d '{"original_url":"https://example.com","custom_code":"teste-sre"}'
```

**Pausar o auto-sync** (necessário para os testes 1 a 3 com o ArgoCD instalado):

```bash
kubectl -n argocd patch application kiro-portal --type merge \
  -p '{"spec":{"syncPolicy":{"automated":null}}}'
# ... testes ...
kubectl apply -f argocd/application.yaml          # restaura a política original
```

**Teste 1: banco fora do ar**

```bash
kubectl -n encurtador get pods -w                                   # em outro terminal
scripts/gerar-trafego.sh http://localhost:3000 120                  # em outro terminal
kubectl -n encurtador scale statefulset/database --replicas=0
kubectl -n encurtador scale statefulset/database --replicas=1       # depois da observação
kubectl -n encurtador get events --sort-by=.lastTimestamp | grep -iE "liveness|killing|readiness"
```

**Teste 2: persistência.** Conferir `curl -i localhost:3000/r/teste-sre` (esperado `302`) antes e depois de recriar o pod do banco (`kubectl -n encurtador delete pod database-0`).

**Teste 3: rollout.** Pelo frontend (porta 3000); o `port-forward` da API cai durante o rollout.

```bash
for i in $(seq 1 300); do
  curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/r/teste-sre
  sleep 0.2
done | sort | uniq -c
# em outro terminal, logo depois de iniciar o loop:
kubectl -n encurtador rollout restart deploy/api
```

**Teste 4: deploy GitOps** (com o auto-sync ativo)

```bash
kubectl -n argocd get applications
kubectl -n encurtador get deploy api frontend -o wide                # coluna IMAGES
git fetch origin && git show origin/main:k8s/kustomization.yaml | grep newTag
```

**Teste 5: 404 e 410**

```bash
curl -i localhost:3000/r/nao-existe
EXP=$(date -u -d '+10 seconds' +%Y-%m-%dT%H:%M:%SZ)
curl -s -X POST localhost:3000/api/links -H 'content-type: application/json' \
  -d "{\"original_url\":\"https://example.com\",\"custom_code\":\"expira-ja\",\"expires_at\":\"$EXP\"}"
sleep 12 && curl -i localhost:3000/r/expira-ja
```

**Teste 6: `trace_id` no log do nginx**

```bash
curl -s -o /dev/null localhost:3000/r/teste-sre
kubectl -n encurtador logs deploy/frontend --tail=5                  # copiar o valor de trace=
```

No Grafana (login de administrador), em **Explore** com o datasource **Tempo** e a aba **TraceQL**, colar o ID.

**Teste 7: probes sem traces.** No mesmo Explore, com o período em "Last 30 minutes":

```
{ name =~ ".*healthz.*" || name =~ ".*readyz.*" }
```

O resultado esperado é vazio. Como controle positivo, `{ name =~ ".*short_code.*" }` deve devolver traces.
