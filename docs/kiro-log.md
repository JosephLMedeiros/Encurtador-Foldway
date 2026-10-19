# Registro de uso do Kiro e de IA

## Para que serve

Este é o diário de bordo do uso de IA no projeto. Ele tem três funções:

1. **Rastreabilidade:** mostrar de onde veio cada requisito, design e tarefa, o que a ferramenta propôs e o que o grupo decidiu.
2. **Avaliação:** o enunciado avalia como o Kiro foi usado (código, manifests, pipeline, dashboards). Este arquivo é a nossa evidência.
3. **Pitch:** a parte "por baixo do capô" da apresentação sai daqui.

Registramos o que foi feito, o que a gente revisou e o que deu errado. Os prompts em si não ficam registrados.

## Quando registrar

Uma entrada por sessão que produziu ou mudou algo relevante: uma etapa de spec, a execução de tarefas, um problema difícil resolvido ou uma decisão técnica. Pergunta rápida que não gerou nada não precisa de entrada.

Quem conduziu a sessão escreve a entrada logo depois, enquanto ainda lembra do que aconteceu.

## Como preencher

- **O que a IA produziu:** o resultado em poucas linhas, sem colar o documento inteiro.
- **Revisão humana:** o campo mais importante. O que foi corrigido, rejeitado ou questionado, e por quê. Se nada mudou, escreva "aprovado sem alterações" e quem revisou.
- **Verificações:** só o que foi realmente executado, com o resultado. Vale teste automatizado, pipeline ou checagem manual (pods saudáveis, trace no Grafana).
- **Erros da IA:** anote também. Ajuda a entender que tipo de erro ela costuma cometer e como reagimos.

## Modelo

```markdown
## Registro NN — <título curto>

- **Data:** AAAA-MM-DD
- **Responsável:** <quem conduziu a sessão>
- **Ferramenta:** <Kiro, Claude Code etc.>
- **Spec / tarefa:** <ex.: 01-backend-api / design.md ou tarefa 3.1>
- **Objetivo:** <o que se queria obter>
- **O que a IA produziu:** <resultado em poucas linhas>
- **Revisão humana:** <o que foi corrigido, rejeitado ou questionado, e por quê>
- **Verificações:** <o que foi executado e o resultado, ou "não executado">
- **Decisões:** <IDs das decisões ou "nenhuma">
- **Pendências:** <o que ficou em aberto>
- **Evidência (opcional):** <PR, commit ou captura de tela>
```

---

## Registro 01 — Estrutura de DevOps e GitOps (spec 02-devops-gitops)

- **Data:** 2026-10-16
- **Responsável:** Diêgo (DevOps e GitOps)
- **Ferramenta:** Kiro
- **Spec / tarefa:** 02-devops-gitops (requirements, design e tasks) e a estrutura base
- **Objetivo:** deixar Kubernetes, CI/CD e GitOps preparados antes de o backend e o frontend ficarem prontos, para a integração ser só um encaixe.
- **O que a IA produziu:**
  - a spec `02-devops-gitops` completa;
  - manifests de namespace, Ingress, API (Deployment, Service e ConfigMap), frontend (Deployment e Service) e banco (StatefulSet, Service e Secret de exemplo), mais um rascunho da Application do ArgoCD;
  - dois workflows (`ci-api.yaml` e `ci-frontend.yaml`) com testes de placeholder, build e push no GHCR e atualização das tags;
  - `.gitignore` protegendo secrets locais;
  - `docs/devops-integration-guide.md`, explicando para cada pessoa como conectar sua parte.
- **Revisão humana:** quando a API em Python ficou pronta (Registro 02), essa estrutura foi revisada e vários pontos foram corrigidos: as probes estavam em `/health` em vez de `/healthz` e `/readyz`, o Secret tinha base64 inválido, o Ingress tinha um `rewrite-target: /` que quebrava `/api`, e o nome da imagem tinha maiúsculas, o que o GHCR não aceita. Os dois workflows também foram unificados, porque faziam push das tags ao mesmo tempo.
- **Verificações:** nenhuma nesta fase, porque ainda não havia aplicação para subir.
- **Decisões:** D-07 (monorepo), D-10 (GHCR), Q-01 (Ingress) e Q-02 (StatefulSet com PVC), todas como proposta.

---

## Registro 02 — API em Python, Kubernetes, CI/CD e observabilidade

- **Data:** 2026-10-16
- **Responsável:** Diêgo
- **Ferramenta:** Claude Code (no VS Code), partindo dos contratos produzidos com o Kiro
- **Spec / tarefa:** 01-backend-api (reimplementada em Python), 02-devops-gitops e 04-observabilidade
- **Objetivo:** sair dos contratos e do esqueleto de infra para uma stack funcionando de ponta a ponta.
- **O que a IA produziu:**
  - branch `feat/backend-python`: API com FastAPI e psycopg 3, schema único, telemetria seguindo o `otel-metrics-spec.md`, analytics (ranking e série por hora) e 43 testes;
  - branch `feat/devops-gitops-python`: manifests em kustomize (aproveitando a estrutura do Registro 01), frontend placeholder em nginx com OpenTelemetry, pipeline `ci-cd.yaml`, Application do ArgoCD, stack de observabilidade, dashboard, scripts de demo e README.
- **Revisão humana e problemas corrigidos:**
  - os problemas da estrutura do Registro 01 (probes, Secret, Ingress, nome da imagem e workflows concorrentes);
  - **erro da IA:** o método `list` do repositório sombreava o builtin. Os testes passavam no Python 3.14 local e quebravam no 3.12 da imagem. Desde então os testes rodam também em 3.12;
  - **erro da IA:** o `startupProbe` (80s) matava a API no primeiro boot do Postgres no kind. O orçamento subiu para 120s, acima da espera interna de 60s;
  - os traces tinham spans soltos do `/readyz` e spans internos do ASGI. Foram suprimidos, com teste;
  - o mapa de serviços do Tempo não liga nginx e API (o nginx só emite spans SERVER). O painel virou "spans por componente";
  - pelos traces, o p95 do redirect estava em centenas de ms por causa do fsync do commit no disco do Docker/WSL. Com `synchronous_commit off` só no clique, o pior caso caiu de cerca de 1s para cerca de 12 ms.
- **Verificações:**
  - pytest com 43 testes passando em Python 3.14 (local) e 3.12 (container);
  - docker compose com a stack completa: trace navegador → nginx → API → Postgres no Tempo e painéis consultados pela API do Grafana;
  - kind: todos os pods Ready, probes testadas com o banco desligado, persistência no PVC e Prometheus coletando as 2 réplicas;
  - actionlint, kubeconform (incluindo o CRD do ArgoCD) e shellcheck.
- **Não verificado nesta sessão:** execução real no GitHub Actions e no GHCR e o ArgoCD sincronizando a partir do repositório. Isso foi validado depois, no Registro 05.
- **Decisões:** D-03 (Python/FastAPI) e D-05 (Postgres) confirmadas por Diêgo; D-06, D-07 e D-10 como proposta.

---

## Registro 03 — Frontend e telas do Foldway

- **Data:** 2026-10-17
- **Responsável:** Joseph (frontend e telas)
- **Ferramenta:** Kiro
- **Spec / tarefa:** frontend (branch `feat/frontend-joseph`), seguindo a D-04
- **Objetivo:** construir a interface do portal: criar e listar links, com a identidade do Foldway e do Furl.
- **O que a IA produziu:**
  - app em React 19 e Vite, com React Router e CSS puro, sem TypeScript;
  - tela inicial com o formulário de criação, o resultado com botão de copiar e a lista de links;
  - a animação da dobra (`FoldAnimation`): o endereço vira um papel kraft dobrado até o origami com o código curto;
  - o Furl como componente trocável, com cinco poses (boas-vindas, dobrando, pronto, erro e mesa vazia) configuradas em `src/config/mascot.js`;
  - telas de link inexistente ou expirado e de página não encontrada;
  - `theme.css` como única fonte de cores, com o stylelint barrando cor fora do tema;
  - `api.js` como única porta de rede (regra do ESLint), com um mock para trabalhar antes de a API existir;
  - testes unitários, de componente e de acessibilidade (axe).
- **Revisão humana:** o Joseph definiu a stack (D-04), as telas e o visual. Na integração com a API (Registro 04), o contrato provisório do `api.js` foi ajustado ao `openapi.yaml` e o mock, as variáveis `VITE_*` e alguns testes foram removidos. As telas, os componentes e o mascote ficaram como ele fez.
- **Verificações:** os testes do frontend passaram na integração (Registro 04).
- **Decisões:** D-04 (stack do frontend) confirmada; D-08 (mascote) e D-15 (paleta) como proposta.

---

## Registro 04 — Integração do frontend, QR Code e CI do frontend

- **Data:** 2026-10-17
- **Responsável:** Diêgo
- **Ferramenta:** Claude Code (no VS Code)
- **Spec / tarefa:** integração do frontend do Joseph (`feat/frontend-joseph`, Registro 03) com a API, feature exclusiva e GitHub Actions
- **Objetivo:** ter o sistema funcionando com o frontend real, simplificar o código e entregar a feature do QR Code.
- **O que a IA produziu:**
  - branch `feat/frontend-integracao`, com o merge da branch do Joseph preservando o histórico;
  - `api.js` falando com a API real e convertendo o contrato; proxy do Vite em desenvolvimento; rota `/r/:code` para link inexistente ou expirado (D-11 a D-13);
  - simplificação: saíram o mock, as variáveis `VITE_*`, os arquivos `.env`, testes sem valor, CSS duplicado de botões e comentários que desligavam o stylelint (cerca de 350 linhas a menos);
  - QR Code (D-17) com o origami no centro e download em PNG, apontando para `/r/{code}?via=qr`; a API conta `kiro_feature_used_total{feature="qrcode"}`;
  - tracing do navegador levado do placeholder para `src/api/tracing.js` (D-14);
  - Dockerfile multi-stage, nginx com cache e gzip e job `test-frontend` no `ci-cd.yaml`.
- **Revisão humana e problemas corrigidos:**
  - o contrato provisório do frontend (`{ url }`, lista como array, `body.error` como mensagem) não batia com a API. A conversão ficou só no `api.js`;
  - **erro da IA:** a primeira resolução do conflito no `SSOT.md` rodou sem Python no PATH e o merge foi commitado com marcadores de conflito. Vimos na hora e o merge (ainda local) foi refeito;
  - **erro da IA:** um commit da API levou junto arquivos do frontend que já estavam no índice. Foi desfeito (ainda local) e refeito separado;
  - tirar o placeholder apagaria os spans `kiro-browser` usados num painel do dashboard, então o tracing foi portado para o app React;
  - no runner Linux, `stylelint src/**/*.css` sem aspas não entrava nas pastas dos componentes. O glob foi colocado entre aspas;
  - coral nos módulos do QR ficaria perto do limite de leitura das câmeras. Os módulos ficaram em índigo e o coral só no origami do centro.
- **Verificações:**
  - frontend: 92 testes (incluindo axe e decodificação real do QR com `jsqr`, em URLs curtas e longas), ESLint e stylelint; os mesmos passos do CI rodados num container Linux com Node 22;
  - API: 44 testes com Postgres;
  - docker compose: criação, redirect pelo QR (302 e métrica `qrcode` contada), `/r/inexistente` com 404 e a tela do Furl, spans `kiro-browser`, `kiro-frontend` e `kiro-api` nas span metrics;
  - navegador (Edge headless): fluxo de criação com a animação, QR no resultado e na lista, PNG baixado e decodificado de volta para a URL certa, layout em 390 px;
  - actionlint no workflow.
- **Não verificado:** leitura do QR por câmera de celular (só por decodificador).
- **Decisões:** D-11 a D-14 e D-17 como proposta, aguardando aprovação do Diêgo.

---

## Registro 05 — Validação de SRE do projeto inteiro

- **Data:** 2026-10-17 e 2026-10-18
- **Responsável:** Abby (SRE e observabilidade)
- **Ferramenta:** Claude, apoiando o roteiro de testes, a leitura das saídas e a redação do relatório
- **Spec / tarefa:** 02-devops-gitops e 04-observabilidade (verificações); README
- **Objetivo:** seguir o README do zero e confirmar que tudo o que ele promete funciona, no compose, no kind e com o ArgoCD.
- **O que a IA produziu:** o roteiro dos testes, a análise dos resultados e o texto do `docs/validacao-sre.md`. Os comandos foram executados por pessoas.
- **Revisão humana:** cada achado foi decidido pela equipe: corrigir, documentar ou aceitar o risco. Os 15 achados e o que foi feito com cada um estão na seção 4 do relatório. Entre as correções: scripts sem permissão de execução, testes da API passando a rodar pelo compose em Python 3.12, `scripts/port-forward.sh` e o filtro `http_route!=""` no dashboard.
- **Verificações:** seis dos sete testes de comportamento no cluster passaram e um passou com ressalva (um 504 em 300 requisições durante o rollout). Pipeline validado na `main`, com o bot commitando a nova tag e o ArgoCD aplicando.
- **Decisões:** nenhuma nova. Riscos aceitos e limitações registrados no relatório.
- **Evidência:** `docs/validacao-sre.md`, PR #4.

---

## Registro 06 — Specs, steering e docs alinhados ao que foi construído

- **Data:** 2026-10-18
- **Responsável:** Diêgo
- **Ferramenta:** Claude Code (no VS Code)
- **Spec / tarefa:** as três specs, os quatro arquivos de steering e os arquivos de `docs/`
- **Objetivo:** as specs ainda carregavam o plano antigo (Node.js, cache em memória, dois workflows, probes em `/health`) e uma série de notas de divergência. A ideia foi deixar cada documento descrevendo o projeto como ele é hoje.
- **O que a IA produziu:**
  - `requirements.md`, `design.md` e `tasks.md` das specs 01, 02 e 04 reescritos a partir do código, com o que ficou de fora listado e as pendências no fim das tarefas;
  - steering com a stack em uso, a estrutura real do repositório e o fluxo SDD com as specs que existem;
  - `docs/otel-metrics-spec.md` com as rotas, os nomes de serviço e as consultas que o dashboard usa de verdade;
  - `docs/devops-integration-guide.md` reescrito para o estado atual;
  - `docs/development-workflow.md` sem os exemplos de prompt;
  - este arquivo sem os prompts e sem as entradas de exemplo, e com o registro do frontend do Joseph (Registro 03), que ainda não estava aqui.
- **Revisão humana:** o Diêgo revisou os documentos e aprovou as três specs em 2026-10-18.
- **Verificações:** as afirmações dos documentos foram conferidas no código (`api/app/`, `k8s/`, `.github/workflows/ci-cd.yaml`, `frontend/nginx.conf` e `frontend/src/api/tracing.js`). Nenhum teste foi rodado, porque só mudou documentação.
- **Decisões:** nenhuma nova.

---

## Resumo por área

Uma linha por interação relevante com o Kiro ou outra IA. É a base da parte "como o Kiro ajudou" do pitch.

| # | Data | Quem | Ferramenta | Área | Resultado | Revisão humana | Decisões |
|---|---|---|---|---|---|---|---|
| 1 | 2026-10-15 | Abby | Kiro | Observabilidade | Stack definida, requisitos da spec 04 e rascunho do contrato de telemetria | Contrato revisado pela Abby (v2) | D-09 |
| 2 | 2026-10-16 | Lucas | Kiro | Spec do backend | Spec 01 e `openapi.yaml`, escritos para Node.js | Spec reescrita depois da troca para Python (Registro 06) | D-03 |
| 3 | 2026-10-16 | Diêgo | Kiro | DevOps e GitOps | Registro 01 | Registro 01 | D-07, D-10 |
| 4 | 2026-10-16 | Diêgo | Claude Code | API, infra e observabilidade | Registro 02 | Registro 02 | D-03, D-05 |
| 5 | 2026-10-17 | Joseph | Kiro | Frontend e telas | Registro 03 | Registro 03 | D-04, D-08, D-15 |
| 5b | 2026-10-17 | Fábio | — | Identidade (brand book) | `docs/brand-book.md` com personagem, tema, tom de voz e features do Foldway | A preencher pelo Fábio | D-08, D-16, D-17 |
| 6 | 2026-10-17 | Diêgo | Claude Code | Integração do frontend e CI | Registro 04 | Registro 04 | D-11 a D-14 |
| 7 | 2026-10-17 | Diêgo | Claude Code | Feature exclusiva (QR Code) | Registro 04 | Registro 04 | D-17 |
| 8 | 2026-10-18 | Abby | Claude | Validação de SRE | Registro 05 | Registro 05 | — |
| 9 | 2026-10-18 | Diêgo | Claude Code | Documentação | Registro 06 | Aprovado pelo Diêgo | — |

---

## Lições aprendidas

- **Rodar os testes na mesma versão da imagem.** O bug do `list` só apareceu no Python 3.12. Depois disso, o CI e o profile `test` do compose usam a mesma versão do Dockerfile.
- **Os traces pagaram o esforço.** Foi olhando um trace que achamos o fsync que segurava o redirect. Sem o trace teríamos culpado a API.
- **Pedir evidência, não "está funcionando".** Os dois erros de commit do Registro 04 foram pegos porque a gente olhava o diff antes de seguir.
- **Spec escrita antes da decisão envelhece rápido.** A spec do backend foi escrita para Node e virou quase toda divergência quando trocamos para Python. Atualizar a spec logo depois da mudança teria dado menos trabalho do que acumular notas.
- **Probes conversam entre si.** O `startupProbe` do Kubernetes precisa ser maior que a espera interna da API pelo banco. O valor que parecia folgado não era.
