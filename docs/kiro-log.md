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


## Lições aprendidas (preencher ao longo do projeto)

Aqui podemos anotar o que funcionou bem e o que não funcionou no uso do Kiro (tipos de prompt eficazes, erros recorrentes, regras de steering que ajudaram). Este trecho alimenta a parte "como o Kiro nos ajudou" do pitch.
