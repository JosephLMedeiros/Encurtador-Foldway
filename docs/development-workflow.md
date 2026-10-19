# Como a equipe trabalha (Spec-Driven Development)

Este guia é para as pessoas do grupo: como usamos o Kiro, o que cada um faz em cada etapa e como revisamos e registramos o trabalho. As regras para o próprio Kiro ficam em `.kiro/steering/sdd-workflow.md`, e o escopo e as decisões no `SSOT.md`.

## 1. O que é SDD e por que usamos

Primeiro combinamos o que vai ser feito (a spec) e só depois implementamos. O Kiro ajuda a escrever e a implementar, mas quem decide e aprova somos nós.

O que a gente ganha:

- menos retrabalho, porque erro de entendimento aparece no papel antes de virar código;
- frontend, API e banco seguindo o mesmo contrato;
- dá para explicar por que cada coisa existe, o que ajuda no pitch;
- evidência do uso do Kiro, que faz parte da avaliação.

## 2. Onde está cada coisa

| Arquivo | Para quê |
|---|---|
| `SSOT.md` | Escopo, requisitos do hackathon, prioridades e decisões. Em caso de conflito, vale o que está aqui |
| `.kiro/steering/` | Instruções permanentes para o Kiro: produto, tecnologia, estrutura e fluxo SDD |
| `.kiro/specs/<nome>/` | Uma pasta por área (`01-backend-api`, `02-devops-gitops`, `04-observabilidade`), com `requirements.md`, `design.md` e `tasks.md` |
| `openapi.yaml` e `docs/otel-metrics-spec.md` | Contratos da API e da telemetria |
| `docs/kiro-log.md` | Registro das sessões relevantes com o Kiro e outras IAs |
| `docs/devops-integration-guide.md` | Como uma mudança chega ao cluster e o que tocar em cada caso |
| `docs/validacao-sre.md` | Relatório da validação de ponta a ponta |
| Este documento | Como a equipe trabalha |

## 3. O ciclo de uma spec

```
Requisitos → Design → Tarefas → Implementação → Verificação
       (aprovação em cada etapa antes de avançar)
```

Uma pessoa conduz a spec com o Kiro e o resto do grupo revisa e aprova.

### Requisitos

Pedimos ao Kiro uma proposta de `requirements.md` baseada no SSOT, com as ambiguidades e decisões pendentes listadas à parte, e paramos aí até revisar.

Na revisão:

- [ ] Os requisitos são o que queremos, sem funcionalidade inventada?
- [ ] Cada critério de aceitação dá para provar?
- [ ] Erros e casos extremos estão cobertos (URL inválida, código inexistente, link expirado)?
- [ ] Sugestões opcionais estão separadas dos requisitos?
- [ ] Nada contradiz o SSOT?
- [ ] As ambiguidades foram respondidas ou registradas como decisão pendente?

### Design

Com os requisitos aprovados, pedimos o `design.md`. É aqui que o Kiro costuma propor tecnologia. Onde houver decisão em aberto, ele deve trazer alternativas, prós e contras e uma recomendação, e nós decidimos (ver seção 6).

Na revisão:

- [ ] O design atende a todos os requisitos aprovados?
- [ ] As escolhas cabem no nosso prazo e no nosso ambiente?
- [ ] Os contratos entre frontend, API e banco estão claros?
- [ ] O impacto em outras specs (API, frontend, observabilidade, manifests) foi apontado?
- [ ] Nenhuma decisão pendente foi tomada em silêncio?

### Tarefas

Com o design aprovado, pedimos o `tasks.md`: tarefas pequenas, com verificação, dependências e o que dá para fazer em paralelo.

Na revisão:

- [ ] As tarefas cobrem todos os requisitos?
- [ ] Cada uma é pequena o bastante para revisar de uma vez?
- [ ] A ordem faz sentido?
- [ ] Dá para dividir entre pessoas?

### Implementação

Aprovar o plano não gera código. A implementação é uma etapa à parte: quem conduz a spec pede ao Kiro que execute uma tarefa por vez (ou um grupo pequeno de tarefas independentes), e acompanha as alterações.

Antes de começar:

- [ ] Os três documentos da spec estão com `Status: Aprovado`.
- [ ] As decisões que a tarefa exige estão confirmadas no SSOT.
- [ ] O ambiente tem o necessário para rodar e verificar (Docker, banco, kind). Se não tiver, a verificação vai ser manual e precisa ser registrada.

Regras práticas:

- Nada de pedir "implemente tudo" de uma vez.
- Cada spec gera só o que é do seu escopo. A spec do backend não mexe em manifests nem no pipeline, por exemplo.
- Leia o diff antes de aceitar.
- Se a tarefa precisar de algo que não está na spec, pare e atualize a spec primeiro (seção 7).
- Tarefa concluída é tarefa verificada, não código gerado.

### Verificação

Conferimos se a implementação atende aos critérios de aceitação. Cada critério precisa de uma verificação:

- **Automatizada:** pytest da API, testes e lint do frontend e validação dos manifests. Tudo isso roda no GitHub Actions em todo PR e todo push na `develop` e na `main`. PR com verificação falhando não entra.
- **Manual registrada:** o que não dá para automatizar, principalmente infra: pods saudáveis, ArgoCD sincronizado, trace atravessando os componentes no Grafana. Quem verificou anota o resultado no `kiro-log` (ou num relatório, como o `validacao-sre.md`).

Na revisão:

- [ ] As verificações foram executadas de verdade e passaram? Peça a evidência, não um "está funcionando".
- [ ] O comportamento bate com os critérios de aceitação?
- [ ] O código segue o design aprovado?
- [ ] Não há mudança fora do escopo da tarefa?
- [ ] A documentação afetada foi atualizada?

## 4. Como registramos a aprovação

O Kiro conversa com uma pessoa por vez e não tem como saber se o grupo aprovou algo. Por isso a aprovação fica no próprio arquivo, numa linha no topo de cada `requirements.md`, `design.md` e `tasks.md`:

```
Status: Rascunho | Em revisão | Aprovado em AAAA-MM-DD por <nome>
```

Quem aprova documentos e decisões é o Diêgo (SSOT, seção 10). O que cada status significa e quando o Kiro pode avançar está no `sdd-workflow.md`.

## 5. Quando a IA erra ou discordamos dela

Ela vai errar: requisito inventado, teste que não roda, escolha técnica duvidosa, commit levando arquivo errado. É esperado.

1. Aponte o problema citando o trecho ou o requisito.
2. Peça a correção e revise de novo.
3. Se ela insistir em algo que o grupo rejeitou, reforce e, se for regra duradoura, coloque no steering.
4. Registre no `kiro-log` o que errou e como corrigimos. Isso mostra revisão crítica e conta a favor.
5. Em dúvida técnica de verdade, vá na documentação oficial ou pergunte a outra pessoa antes de seguir a sugestão.

## 6. Decisões do grupo

Linguagem da API, banco, identidade do produto: tudo isso é decisão do grupo, não do Kiro.

- Cada decisão tem um ID e um estado na tabela do SSOT (seção 8).
- Quando a IA propõe algo, o grupo discute e a linha vira **Confirmada**, com data, justificativa e quem aprovou.
- Só depois disso a escolha passa a valer como restrição. Se fizer sentido, atualize também o `tech.md` ou o `product.md`.

## 7. Quando algo muda

1. Identifique o requisito afetado e o motivo.
2. Levante os documentos e componentes impactados (o Kiro ajuda nisso).
3. Atualize primeiro requisitos, design e tarefas.
4. Revisem e aprovem.
5. Ajuste o código e rode as verificações de novo.
6. Registre a decisão no SSOT se o escopo ou a arquitetura mudou.

Refatoração e ajuste pequeno que não mudam o comportamento não precisam refazer a spec, mas passam por revisão e testes.

Na prática, nem sempre a spec vem antes. A troca da API de Node para Python (D-03) aconteceu no meio do projeto e a implementação andou na frente. Nesses casos, a spec é atualizada logo depois para descrever o que foi feito e volta para `Em revisão` até o grupo aprovar. O importante é ela não ficar desatualizada.

## 8. Definição de pronto

Uma tarefa está pronta quando:

- [ ] os critérios de aceitação foram atendidos;
- [ ] as verificações rodaram e passaram (ou as limitações foram registradas);
- [ ] a implementação segue o design aprovado;
- [ ] não há mudança fora do escopo nem decisão pendente escondida;
- [ ] a documentação afetada foi atualizada;
- [ ] outra pessoa revisou;
- [ ] o `kiro-log` foi atualizado, se a IA participou de forma relevante.

Código que compila ou um agente que diz "terminei" não é pronto.

## 9. Registro do uso de IA

Depois de cada sessão relevante, quem conduziu escreve uma entrada em `docs/kiro-log.md` (o modelo está lá). Registramos o que foi produzido, o que revisamos, o que verificamos e os erros. Os prompts não entram no registro.

Escreva o que aconteceu de fato: não diga que a IA verificou ou decidiu algo que ela não fez.

## 10. Resumindo

O objetivo do SDD não é produzir documento. É manter ligados as decisões do grupo, a spec, o código e as verificações. Documentação na medida do trabalho: nada importante sem spec, e nada de papelada que ninguém usa.

A IA acelera o trabalho e ajuda a achar problemas. O controle do produto, da arquitetura e da qualidade continua com a gente.
