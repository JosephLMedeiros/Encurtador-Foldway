# Fluxo SDD — como o Kiro trabalha neste projeto

## 1. A ideia

Aqui a gente combina primeiro o que vai ser feito, numa spec, e só depois implementa. O Kiro ajuda a escrever as specs, propõe soluções, quebra o trabalho em tarefas e implementa. Quem decide e aprova é o grupo.

## 2. Antes de começar qualquer coisa

Leia o que for relevante para o pedido:

- `SSOT.md`: escopo, requisitos do hackathon e a tabela de decisões (seção 8).
- `.kiro/steering/product.md`, `tech.md` e `structure.md`.
- As specs em `.kiro/specs/` que tocam no assunto:
  - `01-backend-api`: a API em Python;
  - `02-devops-gitops`: Kubernetes, pipeline e ArgoCD;
  - `04-observabilidade`: métricas, traces e dashboard.
- Os contratos: `openapi.yaml` e `docs/otel-metrics-spec.md`.
- O código. As specs foram atualizadas para bater com ele, mas se encontrar diferença, avise em vez de escolher um lado sozinho.

Se faltar uma informação que trava o trabalho, pergunte.

## 3. As etapas

**Requisitos → Design → Tarefas → Implementação → Verificação**

Uma etapa por vez. Não gere os três documentos de uma vez como se já estivessem aprovados, e não implemente antes de o plano estar aprovado.

### Requisitos

1. Leia o SSOT e o contexto.
2. Entenda o escopo, as dependências e as restrições.
3. Proponha o `requirements.md`, com comportamentos e critérios de aceitação que dê para verificar.
4. Liste ambiguidades, conflitos e decisões pendentes.
5. Espere a aprovação.

Não invente requisito. Sugestões opcionais vão separadas dos requisitos, marcadas como sugestão.

### Design

Só depois dos requisitos aprovados. O `design.md` explica como cada requisito será atendido: componentes, fluxo de dados, contratos, modelo de dados, erros, configuração, testes e como se encaixa no que já existe.

Respeite as decisões já tomadas. Se uma escolha importante estiver em aberto, mostre as alternativas e o que muda com cada uma, e deixe o grupo decidir.

### Tarefas

Só depois do design aprovado. As tarefas do `tasks.md` devem ser pequenas, ter uma verificação clara, seguir uma ordem que faça sentido e dizer quais podem andar em paralelo. Evite tarefa do tipo "implementar tudo".

### Implementação

Só tarefas aprovadas, de preferência uma por vez:

1. Releia a tarefa, os requisitos, o design e o código em volta.
2. Confira se as dependências já estão prontas.
3. Faça só o que a tarefa pede, sem mudanças de carona.
4. Rode as verificações.
5. Diga o que mudou, o resultado das verificações e o que ficou faltando.

Código gerado não é tarefa concluída. Concluída é tarefa verificada.

### Verificação

Confira a implementação contra os critérios de aceitação e o design. Rode o que der para rodar: pytest, testes e lint do frontend, `kubectl kustomize`, pipeline. O que não der para rodar no ambiente, diga que não rodou e o que falta validar.

Verificação manual também vale (pods saudáveis, trace no Tempo, painel no Grafana), desde que venha com a evidência.

Nunca diga que algo foi verificado sem ter verificado.

## 4. Decisões e aprovações

- Separe sempre o que está decidido, o que é proposta e o que está pendente.
- Silêncio não é aprovação.
- Recomendação sua não é decisão do grupo.
- Não escolha em silêncio algo que depende de decisão pendente.
- Não mude um requisito aprovado só para caber na implementação.
- Não altere o SSOT ou outra spec sem avisar.

### Status dos documentos

Todo `requirements.md`, `design.md` e `tasks.md` começa com uma linha de status:

- `Status: Rascunho`: em construção;
- `Status: Em revisão`: apresentado ao grupo, esperando aprovação;
- `Status: Aprovado em AAAA-MM-DD por <nome>`: aprovado.

Só o status `Aprovado` libera a próxima etapa. Documento novo começa como `Rascunho`. Status ausente ou fora desse formato conta como não aprovado.

Aprovação dita só na conversa não vale: o status precisa ser atualizado no arquivo antes de seguir. O Kiro não muda o status para aprovado por conta própria, e não inventa data nem nome de quem aprovou. Quem aprova documentos e decisões neste projeto é o Diêgo (SSOT, seção 10).

Se um documento aprovado mudar de forma relevante, ele volta para `Rascunho`.

## 5. Impacto em outras partes

Quase toda mudança mexe em mais de um lugar. Alguns exemplos deste projeto:

- mudou o contrato da API → `openapi.yaml`, `frontend/src/api/api.js`, testes da API e, se mexer em rota, o dashboard;
- mudou ou criou uma métrica → `docs/otel-metrics-spec.md`, `api/tests/test_telemetry.py` e `kiro-portal.json`;
- mudou porta, variável ou probe → manifests em `k8s/`, `docker-compose.yml` e README.

Quando perceber um impacto, diga quais arquivos e specs são afetados, proponha as mudanças, espere a aprovação e confira tudo de novo depois.

## 6. Quando algo muda

1. Entenda o que mudou e por quê.
2. Veja o impacto.
3. Atualize primeiro requisitos, design e tarefas.
4. Espere a aprovação.
5. Ajuste o código e rode as verificações de novo.

Refatoração que não muda o comportamento não precisa refazer a spec, mas passa por revisão e testes.

Se a implementação andar na frente da spec (aconteceu na troca de Node para Python), atualize a spec logo depois, descrevendo o que foi feito, e coloque o documento em `Em revisão` até o grupo aprovar.

## 7. Onde ficam as specs

```
.kiro/
├── steering/
│   ├── product.md
│   ├── tech.md
│   ├── structure.md
│   └── sdd-workflow.md
└── specs/
    ├── 01-backend-api/
    ├── 02-devops-gitops/
    └── 04-observabilidade/
        ├── requirements.md
        ├── design.md
        └── tasks.md
```

Uma pasta por área, sempre com os três arquivos. Não crie arquivo ou pasta que ninguém pediu.

## 8. Como responder

No fim de uma etapa ou tarefa, diga em poucas linhas:

- o que foi feito ou alterado;
- o que continua pendente de decisão;
- o que foi verificado e o resultado;
- o que ainda tem problema;
- o próximo passo que você sugere.

## 9. Resumindo

O objetivo é manter ligados as decisões do grupo, a spec, o código e as verificações. Documentação na medida do trabalho: nada importante sem spec, e nada de papelada que ninguém lê. O Kiro acelera e ajuda a achar problemas, mas não decide pelo grupo nem esconde incerteza.
