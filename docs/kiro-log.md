# Registro de Uso do Kiro

## Para que serve este documento

Este é o diário de bordo do uso de IA no projeto. Ele serve a três propósitos:

1. **Rastreabilidade:** mostrar como cada requisito, design e tarefa nasceu, o que o Kiro propôs e o que o grupo decidiu.
2. **Avaliação:** o enunciado avalia *como* o Kiro foi usado (código, manifests, pipeline, dashboards) e pede prompts e decisões documentados. Este arquivo é a evidência.
3. **Pitch:** a parte "por baixo do capô" da apresentação será montada a partir daqui.

## Quando registrar

Registre uma entrada sempre que uma sessão com o Kiro produzir ou alterar algo relevante, como uma etapa de spec (requirements, design ou tasks), a execução de tarefas, a resolução de um problema difícil ou uma decisão técnica importante.

Não é preciso registrar cada mensagem, nem perguntas rápidas que não geraram resultado. O ideal é uma entrada por sessão relevante, feita por quem conduziu a sessão, logo depois dela, enquanto ainda se lembra do que aconteceu.

## Como preencher

- **Prompt:** copie o prompt ou faça um resumo fiel. Se for muito longo, possivelmente pode ser salvo em outro local e colocado o link aqui.
- **O que o Kiro produziu:** descreva o resultado em poucas linhas, sem colar o documento inteiro.
- **Revisão humana:** campo mais importante. Registre o que foi corrigido, rejeitado ou questionado, e por quê. Se nada foi alterado, escreva "aprovado sem alterações" e diga quem revisou.
- **Verificações:** liste as verificações que foram realmente executadas e os resultados. Podem ser automatizadas (testes de código, execução do pipeline) ou manuais (ex.: pods saudáveis, trace visível no Grafana).
- **Registre também os erros do Kiro.** É interessante para estudarmos o tipo de erro que ele tá propenso a cometer. E como reagimos a ele.

## Modelo de entrada

Exemplo de como podemos organizar cada entrada.

```markdown
## Registro NN — <título curto>

- **Data:** AAAA-MM-DD
- **Responsável:** <nome de quem conduziu a sessão>
- **Spec / tarefa:** <ex.: 01-nucleo-funcional / requirements.md ou tarefa 3.1>
- **Objetivo:** <o que se queria obter>
- **Prompt:** <prompt ou resumo fiel>
- **O que o Kiro produziu:** <resultado em poucas linhas>
- **Revisão humana:** <o que foi corrigido, rejeitado ou questionado, e por quê>
- **Verificações:** <verificações executadas (automatizadas ou manuais) e resultados, ou "não executado">
- **Decisões:** <IDs das decisões tomadas ou "nenhuma">
- **Pendências / próximo passo:** <o que ficou em aberto>
- **Evidência (opcional):** <link de PR, commit ou captura de tela>
```

---

## Registro 01 — Requisitos da spec 01-nucleo-funcional (EXEMPLO)

- **Data:** AAAA-MM-DD
- **Responsável:** Fulano
- **Spec / tarefa:** 01-nucleo-funcional / requirements.md
- **Objetivo:** Obter uma proposta inicial de requisitos para criação, listagem e redirecionamento de links, sem avançar para o design.
- **Prompt:** "Siga o sdd-workflow.md. Crie a spec 01-nucleo-funcional começando apenas pelo requirements.md, com base no SSOT. Liste ambiguidades e decisões pendentes. Não avance para o design."
- **O que o Kiro produziu:** Um `requirements.md` com histórias de usuário e critérios de aceitação para criar, listar e redirecionar links, além de uma lista de ambiguidades (formato do código curto, comportamento para URL inválida, contagem de cliques).
- **Revisão humana:** Removemos um requisito de autenticação de usuários, que não está no SSOT. Pedimos que sugestões opcionais ficassem separadas dos requisitos confirmados. Ajustamos o critério de URL inválida para exigir resposta de erro clara. Os demais requisitos foram aprovados após leitura em grupo.
- **Verificações:** Não aplicável (etapa de documentação).
- **Decisões:** Requisitos aprovados por Fulano e Ciclana. Formato do código curto segue pendente (proposta do Kiro ainda não aprovada).
- **Pendências / próximo passo:** Decidir o formato do código curto e solicitar o `design.md`.

## Registro 02 — Tarefa de redirecionamento com verificação falhando (EXEMPLO)

- **Data:** AAAA-MM-DD
- **Responsável:** Ciclana
- **Spec / tarefa:** 01-nucleo-funcional / tarefa 4 (redirecionamento)
- **Objetivo:** Implementar o redirecionamento e as verificações associadas.
- **Prompt:** "Execute a tarefa 4 de tasks.md. Implemente somente o escopo dela e execute as verificações."
- **O que o Kiro produziu:** Implementação do endpoint de redirecionamento e duas verificações automatizadas (testes de código).
- **Revisão humana:** Na primeira execução, uma verificação falhou porque o código inexistente retornava resposta de sucesso em vez de 404. Pedimos a correção e revisamos o diff manualmente. O Kiro havia tentado marcar a tarefa como concluída antes da correção, e pedimos que só o fizesse após as verificações passarem.
- **Verificações:** Verificações automatizadas da API executadas localmente: todas passaram após a correção.
- **Decisões:** Nenhuma nova.
- **Pendências / próximo passo:** Avançar para a tarefa 5.
- **Evidência (opcional):** PR #__


---

## Registro 02 — Estrutura DevOps & GitOps (spec 02-devops-gitops)

- **Data:** 2026-10-16
- **Responsável:** Nome 1 (DevOps & GitOps Lead)
- **Spec / tarefa:** 02-devops-gitops / requirements.md, design.md, tasks.md + implementação da estrutura base
- **Objetivo:** Preparar todo o terreno de infraestrutura (Kubernetes, CI/CD, GitOps) antes de o backend e o frontend estarem prontos, de forma que a integração seja um encaixe simples.
- **Prompt:** "Leia os arquivos md do projeto e o PDF do hackathon. Baseado no conceito de DevOps e na minha função de DevOps & GitOps Lead, quero que você deixe tudo pronto para que quando se tenha o backend e o restante do sistema, fique mais fácil de acrescentar minha parte de DevOps e fazer as integrações. Nesse momento você deve apenas deixar o terreno pronto."
- **O que o Kiro produziu:**
  - Spec completa `02-devops-gitops` (requirements.md, design.md, tasks.md) cobrindo Kubernetes, GitHub Actions e ArgoCD.
  - Manifests Kubernetes: namespace, argocd-app, ingress, api (deployment+service+configmap), frontend (deployment+service), database (statefulset+service+secret placeholder).
  - Workflows GitHub Actions: `ci-api.yaml` e `ci-frontend.yaml` com jobs de test (placeholder), build+push para GHCR e atualização automática de tags nos manifests.
  - `.gitignore` protegendo secrets locais.
  - `docs/devops-integration-guide.md` explicando para cada colega o que precisa ser feito para conectar seu trabalho ao pipeline.
- **Revisão humana:** _A preencher após revisão do Nome 1._
- **Verificações:** Não executadas nesta fase (terreno/skeleton sem aplicação real). Verificações definidas em tasks.md serão executadas após as decisões pendentes serem confirmadas.
- **Decisões:** D-07 (proposta: mono-repo, YAML raw), D-10 (proposta: GHCR), Q-01 (proposta: Ingress), Q-02 (proposta: StatefulSet + PVC) — todas como `Proposta`, aguardando confirmação do time.
- **Pendências / próximo passo:**
  - Confirmar D-02, D-03, D-04, D-05, D-08, D-10, Q-01, Q-03 no SSOT.
  - Ajustar os TODOs nos manifests conforme as decisões forem aprovadas.
  - Backend criar `api/Dockerfile` e endpoint `/health`.
  - Frontend criar `frontend/Dockerfile`.
  - Criar o Secret do banco no cluster.
  - Atualizar a URL do repositório em `k8s/base/argocd-app.yaml`.

---

## Registro 03 — Implementação Python: API, Kubernetes, CI/CD e observabilidade

- **Data:** 2026-10-16
- **Responsável:** Diêgo
- **Ferramenta:** Claude Code (assistente de IA no VS Code), a partir dos contratos produzidos com o Kiro
- **Spec / tarefa:** 01-backend-api (reimplementada em Python), 02-devops-gitops, 04-observabilidade
- **Objetivo:** Sair dos contratos e do esqueleto de infra para uma stack funcionando de ponta a ponta.
- **Prompt (resumo fiel):** "Investigue todas as branches e proponha um plano, sem alterar nada. Depois, em branches novas, com um commit por etapa: API (slug opcional, listar, redirect 302 contando cliques, /healthz e /readyz) com testes; Dockerfiles e compose; manifests kustomize; frontend placeholder nginx; GitHub Actions + ArgoCD; OpenTelemetry + Collector, Tempo, Prometheus e Grafana; estrutura para features; README. Backend em Python e banco Postgres. Nunca colocar senhas reais; validar tudo e dizer o que não foi testado."
- **O que a IA produziu:**
  - Branch `feat/backend-python`: API FastAPI + psycopg 3, schema único, telemetria conforme `otel-metrics-spec.md`, analytics (ranking e série por hora) e 43 testes.
  - Branch `feat/devops-gitops-python`: manifests kustomize (reaproveitando a estrutura da branch de DevOps), frontend nginx com OTel, pipeline `ci-cd.yaml`, Application do ArgoCD, stack de observabilidade, dashboard, scripts de demo e README.
- **Revisão humana / problemas encontrados e corrigidos:**
  - A branch de DevOps tinha probes em `/health` (o contrato define `/healthz` e `/readyz`), um Secret com base64 inválido, um Ingress com `rewrite-target: /` que quebrava `/api` e uma imagem com maiúsculas no GHCR. Tudo foi corrigido.
  - Os dois workflows faziam push concorrente das tags e foram unificados num pipeline.
  - **Erro da IA:** o método `list` do repositório sombreava o builtin. Os testes passavam no Python 3.14 local e quebravam no 3.12 da imagem. Desde então, os testes rodam também em 3.12.
  - **Erro da IA:** o `startupProbe` (80s) matava a API no primeiro boot do Postgres no kind. O orçamento subiu para 120s, acima da espera interna de 60s.
  - Os traces tinham spans soltos do `/readyz` e spans internos do ASGI. Foram suprimidos, com teste.
  - O mapa de serviços do Tempo não liga nginx → API (o nginx só emite spans SERVER). O painel foi trocado por "spans por componente".
  - Pelos traces, o p95 do redirect estava em centenas de ms. A causa era o fsync do commit no disco do Docker/WSL. Com `synchronous_commit off` só no clique, o pior caso caiu de ~1s para ~12 ms.
- **Verificações:**
  - pytest com 43 testes passando em Python 3.14 (local) e 3.12 (container).
  - docker compose com a stack completa: trace navegador → nginx → API → Postgres no Tempo e os painéis do dashboard consultados via API do Grafana.
  - Cluster kind: todos os pods Ready, probes testadas com o banco desligado, persistência no PVC e Prometheus coletando as 2 réplicas.
  - actionlint, kubeconform (incluindo o CRD do ArgoCD) e shellcheck.
- **Não verificado:** a execução real no GitHub Actions/GHCR e o ArgoCD sincronizando a partir do repositório (depende do merge na `main` e de um cluster com ArgoCD).
- **Decisões:** D-03 Python/FastAPI e D-05 Postgres (confirmadas por Diêgo, aguardando ciência de Abby e Lucas); D-06, D-07 e D-10 como proposta.
- **Pendências / próximo passo:** revisar e mesclar as branches; revisar a spec `01-backend-api` (escrita para Node); definir a identidade (D-08); construir o frontend real.

---

## Registro 04 — Integração do frontend, QR Code e CI do frontend

- **Data:** 2026-10-17
- **Responsável:** Diêgo
- **Ferramenta:** Claude Code (assistente de IA no VS Code)
- **Spec / tarefa:** integração do frontend do Joseph (`feat/frontend-joseph`) com a API Python; feature exclusiva; GitHub Actions
- **Objetivo:** Deixar o sistema funcionando com o frontend real, simplificar o código e entregar a feature do QR Code.
- **Prompt (resumo fiel):** "Integre a branch do frontend e torne o sistema funcional. Verifique o código do frontend e simplifique o que for desnecessário. Faça o GitHub Actions do projeto. O recurso extra é um QR Code que leva ao link encurtado, com visual combinando com o frontend."
- **O que a IA produziu:**
  - Branch `feat/frontend-integracao` (a partir de `feat/devops-gitops-python`), com merge da branch do Joseph preservando o histórico.
  - `api.js` falando com a API real e convertendo o contrato; proxy do Vite em desenvolvimento; rota `/r/:code` para link inexistente ou expirado (D-11 a D-13).
  - Simplificação: mock, variáveis `VITE_*`, arquivos `.env`, testes sem valor, CSS duplicado de botões e comentários de desabilitar o stylelint removidos (o frontend ficou cerca de 350 linhas menor).
  - QR Code (D-17) com o origami no centro e download em PNG, apontando para `/r/{code}?via=qr`; a API conta `kiro_feature_used_total{feature="qrcode"}`.
  - Tracing do navegador portado do placeholder para `src/api/tracing.js` (D-14).
  - Dockerfile multi-stage, nginx com cache e gzip, e job `test-frontend` no `ci-cd.yaml`.
- **Revisão humana / problemas encontrados e corrigidos:**
  - O contrato provisório do frontend (`{ url }`, lista como array, `body.error` como mensagem) não batia com a API; a conversão ficou só no `api.js`.
  - **Erro da IA:** a primeira resolução do conflito no `SSOT.md` rodou sem Python no PATH e o merge foi commitado com marcadores de conflito. Foi detectado na hora e o commit de merge (ainda local) foi refeito.
  - **Erro da IA:** um commit da API levou junto arquivos do frontend que já estavam no índice. Foi desfeito (ainda local) e refeito separado.
  - Remover o placeholder apagaria os spans `kiro-browser` usados por um painel do dashboard; o tracing foi portado para o app React.
  - No runner Linux, `stylelint src/**/*.css` sem aspas não desce até os CSS dos componentes; o glob foi colocado entre aspas.
  - Coral nos módulos do QR ficaria perto do limiar de leitura das câmeras; os módulos ficaram em índigo e o coral só no origami central.
- **Verificações:**
  - Frontend: 92 testes (incluindo axe e decodificação real do QR com `jsqr` em URLs curtas e longas), ESLint e stylelint; os mesmos passos do CI rodados num container Linux com Node 22.
  - API: 44 testes com Postgres.
  - docker compose com a stack completa: criação, redirect pelo QR (302 e métrica `qrcode` contada), `/r/inexistente` com 404 e a tela do Furl, spans `kiro-browser`, `kiro-frontend` e `kiro-api` no Prometheus (span metrics).
  - Navegador (Edge headless): fluxo de criação com a animação, QR no resultado e na lista, PNG baixado decodificado de volta para a URL certa, layout em 390 px.
  - actionlint no workflow.
- **Não verificado:** leitura do QR por câmera de celular (validado só por decodificador); execução do deploy na `main` (GHCR e commit da tag) e o ArgoCD sincronizando.
- **Decisões:** D-11 a D-14 e D-17 registradas como proposta, aguardando aprovação do Joseph.

---

## Tabela de prompts e decisões (preencher durante o projeto)

Uma linha por interação relevante com o Kiro (ou outra IA). Este é o material da parte "como o Kiro ajudou" do pitch.

| # | Data | Quem | Ferramenta | Área | Prompt (resumo) | Resultado | Revisão humana (aceito / corrigido / rejeitado e por quê) | Decisão / ID |
|---|---|---|---|---|---|---|---|---|
| 1 | 2026-10-15 | | Kiro | Spec backend | | | | D-03 |
| 2 | 2026-10-15 | | Kiro | Spec DevOps | | | | D-07, D-10 |
| 3 | 2026-10-15 | | Kiro | Observabilidade | | | | D-09 |
| 4 | 2026-10-16 | Diêgo | Claude Code | API + infra + observabilidade | Ver Registro 03 | Ver Registro 03 | Ver Registro 03 | D-03, D-05 |
| 5 | | | Kiro | Identidade / personagem | | | | D-08 |
| 6 | | | Kiro | Frontend | | | | D-04 |
| 6b | 2026-10-17 | Diêgo | Claude Code | Integração do frontend + CI | Ver Registro 04 | Ver Registro 04 | Ver Registro 04 | D-11 a D-14 |
| 7 | 2026-10-17 | Diêgo | Claude Code | Feature exclusiva (QR Code) | Ver Registro 04 | Ver Registro 04 | Ver Registro 04 | D-17 |

---

## Lições aprendidas (preencher ao longo do projeto)

Aqui podemos anotar o que funcionou bem e o que não funcionou no uso do Kiro (tipos de prompt eficazes, erros recorrentes, regras de steering que ajudaram). Este trecho alimenta a parte "como o Kiro nos ajudou" do pitch.
