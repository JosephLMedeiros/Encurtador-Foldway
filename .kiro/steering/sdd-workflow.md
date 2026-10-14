# SDD Workflow — Instruções para o Kiro

## 1. Objetivo

Este arquivo define como o Kiro deve conduzir o desenvolvimento do projeto utilizando Spec-Driven Development (SDD).

O desenvolvimento deve ser guiado por requisitos documentados, decisões aprovadas, planejamento verificável e validação da implementação.

O Kiro é responsável por auxiliar na elaboração das especificações, propor soluções técnicas, decompor o trabalho e implementar tarefas. As decisões sobre o produto e a aprovação das etapas pertencem ao grupo.

## 2. Contexto do projeto

Antes de iniciar uma nova especificação ou modificar o código, consulte os documentos relevantes disponíveis no repositório:

- `SSOT.md`: referência geral do projeto, requisitos, restrições e decisões.
- `.kiro/steering/product.md`: visão, objetivos e características do produto, quando disponível.
- `.kiro/steering/tech.md`: tecnologias e restrições técnicas aprovadas, quando disponível.
- `.kiro/steering/structure.md`: organização e convenções do repositório, quando disponível.
- `.kiro/steering/sdd-workflow.md`: estas instruções.
- Especificações existentes em `.kiro/specs/` que possam afetar o trabalho solicitado.

Não presuma que documentos mencionados já existem. Consulte os arquivos disponíveis e solicite esclarecimentos caso a ausência de alguma informação impeça o trabalho.

## 3. Fluxo obrigatório de desenvolvimento

Siga esta sequência para cada especificação:

**Requirements → Design → Tasks → Implementação → Verificações e revisão**

As etapas devem ocorrer progressivamente. Não gere todos os documentos como se estivessem automaticamente aprovados e não inicie a implementação antes da aprovação do plano correspondente pelo grupo.

### Etapa 1 — Requirements

Ao receber uma solicitação para iniciar uma Spec:

1. Consulte o SSOT e o contexto relevante.
2. Identifique o escopo da funcionalidade, suas dependências e suas restrições.
3. Elabore uma proposta de `requirements.md`.
4. Descreva comportamentos esperados, regras de negócio e critérios de aceitação verificáveis.
5. Identifique ambiguidades, conflitos e decisões pendentes.
6. Apresente o documento para revisão e aguarde a aprovação do grupo.

Não invente requisitos nem acrescente funcionalidades opcionais como se fossem obrigatórias. Quando necessário, apresente sugestões separadamente dos requisitos confirmados.

### Etapa 2 — Design

Somente após a aprovação dos requisitos, elabore uma proposta de `design.md`.

O documento deve explicar como os requisitos serão atendidos, considerando, conforme aplicável:

- Arquitetura e responsabilidades dos componentes.
- Fluxos de dados e comunicação.
- Contratos entre frontend, API e banco de dados.
- Modelo de dados e persistência.
- Tratamento de erros e casos extremos.
- Segurança, configuração e dependências.
- Estratégia de verificações.
- Integração com os componentes existentes.

Respeite as tecnologias e decisões já aprovadas. Se houver decisões técnicas importantes em aberto, apresente alternativas e suas consequências, solicitando a decisão do grupo quando necessário.

Apresente o design para revisão e aguarde a aprovação antes de elaborar o plano de tarefas.

### Etapa 3 — Tasks

Somente após a aprovação do design, elabore uma proposta de `tasks.md`.

As tarefas devem:

- Ser pequenas, claras e verificáveis.
- Estar alinhadas aos requisitos e ao design aprovados.
- Indicar dependências e uma ordem de execução coerente.
- Identificar os componentes envolvidos quando isso ajudar na compreensão.
- Incluir as verificações pertinentes, automatizadas ou manuais.
- Evitar tarefas vagas ou que agrupem toda a implementação em uma única etapa.

Quando apropriado, indique quais tarefas podem ser executadas em paralelo sem comprometer as dependências.

Apresente o plano ao grupo e aguarde sua aprovação antes de iniciar a implementação.

### Etapa 4 — Implementação

Ao receber uma solicitação para executar tarefas aprovadas:

1. Consulte a tarefa, os requisitos, o design e o código existente.
2. Verifique se as dependências necessárias foram atendidas.
3. Implemente somente o escopo autorizado.
4. Evite alterações não relacionadas e mudanças desnecessárias na arquitetura.
5. Execute as verificações disponíveis.
6. Informe os arquivos alterados, os resultados das verificações e os problemas restantes.

Não considere uma tarefa concluída apenas porque o código foi gerado. A conclusão deve refletir o resultado efetivamente verificado.

### Etapa 5 — Verificações e revisão

Verifique a implementação em relação aos critérios de aceitação e ao design aprovado.

Execute as verificações pertinentes sempre que o ambiente permitir. Se não for possível executá-las, explique a limitação e indique o que ainda precisa ser validado.

As verificações podem ser automatizadas (como testes de código ou a execução do pipeline) ou manuais (como a conferência de probes, traces e dashboards). Em ambos os casos, o resultado deve ser informado com evidências.

Não afirme que verificações foram executadas ou aprovadas sem evidências correspondentes.

Se a implementação não atender à especificação, proponha e realize as correções autorizadas e repita as verificações pertinentes.

## 4. Regras para decisões e aprovações

Durante todas as etapas:

- Diferencie decisões aprovadas, propostas e pendentes.
- Não interprete silêncio como aprovação.
- Não trate recomendações próprias como decisões do grupo.
- Não escolha silenciosamente tecnologias ou soluções que dependam de uma decisão pendente.
- Apresente alternativas quando elas ajudarem o grupo a decidir.
- Solicite esclarecimentos quando uma informação ausente bloquear uma decisão importante.
- Não altere requisitos aprovados apenas para justificar uma implementação.
- Não modifique o SSOT ou outras especificações silenciosamente.

O Kiro pode sugerir alterações e explicar suas justificativas, mas deve identificar o que precisa ser aprovado antes de aplicá-las.

### Registro formal de aprovação

A aprovação de cada documento deve ser registrada no próprio arquivo, por meio do campo `Status`.

O Kiro só deve considerar um documento aprovado quando seu campo `Status` estiver preenchido no formato de aprovação definido na seção 7, contendo a data e o nome de quem aprovou.

Confirmações feitas apenas na conversa não substituem o registro no documento. Se o grupo confirmar uma aprovação verbalmente ou pelo chat, o status deverá ser atualizado antes de o Kiro avançar para a próxima etapa.

Se o status estiver como `Rascunho` ou `Em revisão`, ausente ou inválido, o documento deve ser tratado como não aprovado.

O Kiro não deve alterar o status para aprovado por conta própria. A atualização deve refletir uma aprovação explícita de um integrante autorizado pela equipe.

Se um documento aprovado sofrer alterações relevantes, seu status deverá voltar para `Rascunho` até que a nova versão seja revisada e aprovada.

## 5. Consistência entre especificações

Considere os impactos do trabalho sobre outras áreas do projeto.

Por exemplo, alterações nos contratos da API podem afetar o frontend, as verificações, a instrumentação de observabilidade e os manifests do Kubernetes.

Quando identificar impactos:

1. Explique quais componentes e documentos podem ser afetados.
2. Indique quais especificações precisam ser revisadas.
3. Proponha as atualizações necessárias.
4. Aguarde a aprovação das mudanças relevantes.
5. Verifique a consistência da implementação após as alterações.

Não modifique especificações não relacionadas sem necessidade.

## 6. Tratamento de mudanças

Quando houver uma mudança de requisito, arquitetura ou comportamento:

1. Identifique a mudança solicitada.
2. Avalie seus impactos.
3. Indique os documentos e componentes afetados.
4. Proponha a atualização dos requisitos, do design e das tarefas, conforme necessário.
5. Aguarde a aprovação das mudanças relevantes.
6. Ajuste a implementação e execute novamente as verificações pertinentes.

Refatorações internas que não alterem o comportamento especificado podem seguir um processo proporcional à sua complexidade, sem exigir a recriação completa da Spec.

## 7. Organização e manutenção dos documentos

Mantenha as especificações em `.kiro/specs/`, organizadas por funcionalidade ou área de trabalho.

Exemplo:

```text
.kiro/
├── steering/
│   ├── product.md
│   ├── tech.md
│   ├── structure.md
│   └── sdd-workflow.md
└── specs/
    └── 01-api/
        ├── requirements.md
        ├── design.md
        └── tasks.md
```

Adapte a estrutura às convenções existentes no repositório. Não crie arquivos ou diretórios desnecessários.

Mantenha os documentos consistentes entre si e com o SSOT. Quando uma mudança aprovada afetar uma especificação, atualize os documentos correspondentes.

### Campo de status das especificações

Todos os arquivos de especificação (`requirements.md`, `design.md` e `tasks.md`) devem conter um campo `Status` no início do documento.

Os formatos permitidos são:

- `Status: Rascunho`
- `Status: Em revisão`
- `Status: Aprovado em AAAA-MM-DD por <nome>`

O status `Rascunho` indica que o documento ainda não foi aprovado. O status `Em revisão` indica que o documento foi apresentado à equipe e aguarda aprovação. O status `Aprovado` registra a aprovação formal do documento, e somente ele autoriza o avanço para a etapa seguinte.

Documentos novos devem ser criados com `Status: Rascunho`.

O Kiro deve preservar a data e o nome registrados, sem inventar informações de aprovação. Alterações que exijam nova aprovação devem retornar o documento para `Rascunho`.

## 8. Comunicação dos resultados

Ao concluir uma etapa ou tarefa, informe de forma objetiva:

- O que foi produzido ou alterado.
- Quais decisões ainda estão pendentes.
- Quais verificações foram executadas e seus resultados.
- Quais problemas ou limitações permanecem.
- Qual é o próximo passo recomendado.

Não declare uma etapa aprovada pelo grupo sem confirmação explícita.

## 9. Princípio final

O objetivo do SDD é manter uma ligação consistente entre as decisões do grupo, os requisitos, o design, as tarefas, o código e as verificações.

Priorize clareza, rastreabilidade, mudanças controladas e documentação proporcional à complexidade do trabalho.

O Kiro deve acelerar o desenvolvimento e ajudar a identificar problemas, sem substituir as decisões do grupo ou ocultar incertezas.