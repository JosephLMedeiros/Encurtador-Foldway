# Guia de Desenvolvimento da Equipe com Spec-Driven Development (SDD)

**Para quem é este documento?**  <br>
Para as pessoas do grupo. Ele explica como trabalhamos com o Kiro, o que cada um faz em cada etapa e como revisamos e registramos o trabalho. <br>
As regras de comportamento do agente ficam em `.kiro/steering/sdd-workflow.md`. As decisões e o escopo ficam no `SSOT.md`.

## 1. O que é SDD e por que usamos

No Spec-Driven Development, **primeiro combinamos o que será feito (a especificação) e só depois implementamos**. O Kiro ajuda a escrever a especificação e a implementar, mas quem decide e aprova somos nós.

O que ganhamos com isso:

- Menos retrabalho: erros de entendimento aparecem no papel, antes de virar código.
- Componentes que combinam entre si (frontend, API e banco seguem o mesmo contrato).
- Rastreabilidade: dá para explicar por que cada coisa existe, o que ajuda no pitch.
- Evidência do uso do Kiro, que faz parte da avaliação.

A ideia central é que o Kiro vai propor e nós revisamos, vendo se está ok ou se mudanças são necessárias.

## 2. Onde está cada coisa

| Arquivo | Para quê |
|---|---|
| `SSOT.md` | Escopo, requisitos do hackathon, prioridades e registro de decisões. Em caso de conflito, é a referência |
| `.kiro/steering/` | Instruções permanentes para o Kiro (produto, tecnologia, estrutura e regras do fluxo SDD) |
| `.kiro/specs/<nome>/` | Uma pasta por funcionalidade, com `requirements.md`, `design.md` e `tasks.md` |
| `docs/kiro-log.md` | Registro das sessões relevantes com o Kiro |
| Este documento | Como a equipe trabalha |

## 3. O ciclo de uma spec

```
Requisitos → Design → Tarefas → Implementação → Verificações e revisão
      aprovação em cada etapa antes de avançar 
```

Uma pessoa conduz a spec (conversa com o Kiro) e o restante do grupo revisa e aprova. Os prompts abaixo são pontos de partida, podem adaptar se necessário.

### Etapa 1 — Requisitos

**O que fazemos:** pedimos ao Kiro uma proposta de `requirements.md` e a revisamos.

**Exemplo de prompt:**
> Siga o `sdd-workflow.md`. Crie a spec `<nome>`, começando apenas pelo `requirements.md`, com base no SSOT. Liste ambiguidades e decisões pendentes. Não avance para o design.

**Checklist de revisão:**
- [ ] Os requisitos refletem o que queremos, sem funcionalidades inventadas?
- [ ] Cada critério de aceitação é verificável (dá para provar que foi cumprido)?
- [ ] Erros e casos extremos estão cobertos (ex.: URL inválida, código inexistente)?
- [ ] Sugestões opcionais estão separadas dos requisitos obrigatórios?
- [ ] Nada contradiz o SSOT?
- [ ] As ambiguidades levantadas pelo Kiro foram respondidas ou registradas como decisão pendente?

### Etapa 2 — Design

**O que fazemos:** com os requisitos aprovados, pedimos o `design.md`. É aqui que o Kiro costuma propor tecnologias, e nós decidimos (ver §6).

**Exemplo de prompt:**
> Os requisitos foram aprovados. Elabore o `design.md`. Onde houver decisão técnica pendente, apresente alternativas, prós e contras e uma recomendação, sem assumir nenhuma como definitiva.

**Checklist de revisão:**
- [ ] O design atende a todos os requisitos aprovados?
- [ ] As escolhas técnicas são viáveis para o nosso prazo e ambiente?
- [ ] Os contratos entre frontend, API e banco estão claros?
- [ ] Há impacto em outras specs (API, frontend, observabilidade, manifests)? Foi apontado?
- [ ] Nenhuma decisão pendente foi tomada em silêncio?

### Etapa 3 — Tarefas

**O que fazemos:** com o design aprovado, pedimos o `tasks.md`.

**Exemplo de prompt:**
> O design foi aprovado. Elabore o `tasks.md` com tarefas pequenas e verificáveis, indicando dependências, verificações e quais tarefas podem ser feitas em paralelo.

**Checklist de revisão:**
- [ ] As tarefas cobrem todos os requisitos?
- [ ] Cada tarefa é pequena o bastante para ser revisada de uma vez?
- [ ] A ordem e as dependências fazem sentido?
- [ ] Dá para dividir tarefas entre pessoas?

### Etapa 4 — Implementação

**O que fazemos:** com os três documentos da spec aprovados, pedimos ao Kiro que execute **uma tarefa por vez** (ou um grupo pequeno de tarefas independentes), e acompanhamos as alterações.

**Aprovar o plano não gera o código sozinho.** Ao final da Etapa 3 temos apenas o plano. A implementação é uma etapa separada: quem conduz a spec pede ao Kiro que execute as tarefas. Para isso, o Kiro trabalha com base em:

- **A spec** (`requirements.md`, `design.md` e `tasks.md` aprovados): diz o que construir e como.
- **O `SSOT.md`:** escopo, restrições e decisões já confirmadas.
- **O `sdd-workflow.md`:** como o Kiro deve trabalhar (uma tarefa por vez, informar resultados, não afirmar sucesso sem evidência).

Dependendo da versão, a interface do Kiro pode oferecer uma opção para iniciar cada tarefa a partir do `tasks.md`. Também é possível pedir por prompt, como no exemplo abaixo.

**Antes de começar:**
- [ ] `requirements.md`, `design.md` e `tasks.md` estão com `Status: Aprovado`.
- [ ] As decisões técnicas que a tarefa exige já estão **Confirmadas** no SSOT (seção 8).
- [ ] O ambiente tem o que for necessário para executar e verificar a tarefa (ferramentas, banco, Docker etc.). Se não tiver, a verificação será manual e deve ser registrada.

**Exemplo de prompt:**
> Siga o `sdd-workflow.md` e leia o `SSOT.md`. Execute a tarefa `<número>` da spec `<nome>`, com base no `requirements.md` e no `design.md` aprovados. Implemente somente o escopo dela, execute as verificações disponíveis e informe os arquivos alterados e os resultados.

**Regras práticas:**
- Não peça "implemente tudo" em um único prompt.
- Cada spec gera apenas o que está no seu escopo. Por exemplo, a spec do núcleo gera API, banco e frontend, mas não manifests do Kubernetes nem pipeline, que entram em specs próprias.
- Leia o diff antes de aceitar as alterações.
- Se a tarefa exigir algo que não está na spec, pare e atualize a spec primeiro (ver §7).
- Uma tarefa só está concluída quando foi **verificada**, não quando o código foi gerado.

### Etapa 5 — Verificações e revisão

**O que fazemos:** conferimos se a implementação atende aos critérios de aceitação da spec.

**O que são verificações:** são as provas de que um critério de aceitação foi cumprido. Cada critério deve ser coberto por uma verificação, que pode ser:

- **Automatizada:** testes de código (unitários, de integração), rodados localmente ou pelo GitHub Actions. Exemplos: criar link com URL válida, receber 404 para código inexistente, dados persistirem após reiniciar a API.
- **Manual registrada:** checagens feitas por uma pessoa e anotadas no `kiro-log`. É o caso típico de infraestrutura: pods saudáveis com as probes funcionando, pipeline verde, ArgoCD sincronizado, trace cruzando os três componentes no Grafana.

**Quando e onde rodam:**
- Durante uma tarefa: o Kiro executa localmente e informa os resultados, e a equipe confere.
- A partir da spec 02: o GitHub Actions executa as verificações automatizadas em todo PR, e um PR com verificações falhando não deve ser integrado.
- Na spec 01 não existe CI ainda, então tudo roda localmente. Por isso é importante pedir ao Kiro que execute e informe, em vez de assumir que funciona.

**Checklist de revisão:**
- [ ] As verificações foram **realmente executadas** e passaram? (Peça evidência, não apenas "está funcionando".)
- [ ] O comportamento bate com os critérios de aceitação?
- [ ] O código está alinhado com o design aprovado?
- [ ] Não há alterações fora do escopo da tarefa?
- [ ] A documentação afetada foi atualizada?

## 4. Como aprovamos cada etapa

O Kiro conversa com uma pessoa por vez, então ele não consegue saber sozinho se o grupo aprovou algo. Por isso a aprovação precisa ficar registrada no próprio arquivo.

**Proposta de convenção**:

- No topo de cada `requirements.md`, `design.md` e `tasks.md`, uma linha de status:
  `Status: Rascunho | Em revisão | Aprovado em AAAA-MM-DD por <nome>`

- Os significados de cada status e as regras para o Kiro avançar de etapa estão definidos em `.kiro/steering/sdd-workflow.md`.

## 5. Quando o Kiro erra ou discordamos dele

O Kiro vai errar em algum momento: requisito inventado, verificação que não roda, escolha técnica duvidosa. Isso é normal e esperado.

1. **Aponte o problema com clareza**, citando o trecho ou o requisito (ex.: "este requisito não está no SSOT, remova").
2. **Peça a correção** e revise o resultado novamente.
3. **Se o Kiro insistir em algo que o grupo rejeitou**, reforce no prompt e, se for uma regra duradoura, avalie acrescentá-la ao steering.
4. **Registre no `kiro-log`** o que errou e como corrigimos. Isso conta a favor do grupo: mostra revisão crítica.
5. **Em caso de dúvida técnica real**, consultem a documentação oficial ou outro integrante antes de seguir a sugestão do agente.

## 6. Decisões do grupo

Escolhas como linguagem da API, banco de dados e identidade do produto são **decisões do grupo**, não do Kiro.

- Cada decisão tem um ID e um estado na tabela do **SSOT, seção 8 (Registro/Estado de decisões)**.
- Quando o Kiro propõe algo (normalmente no design), o grupo discute e atualiza a linha para **Confirmada**, com data, justificativa e quem aprovou.
- Só depois disso o Kiro deve tratar a escolha como restrição. Se necessário, atualizem também o `tech.md` ou o `product.md`.

## 7. Quando algo muda

Se descobrirmos que um requisito está errado, incompleto ou precisa mudar:

1. Identifique o requisito afetado e o motivo.
2. Peça ao Kiro para listar os documentos e componentes impactados.
3. Atualize **primeiro** requisitos, design e tarefas, conforme necessário.
4. Revisem e aprovem as mudanças.
5. Ajustem a implementação e executem as verificações novamente.
6. Registrem a decisão no SSOT se o escopo ou a arquitetura mudou.

Correções internas que não alteram o comportamento especificado (refatorações, ajustes pequenos) não exigem refazer a spec inteira, mas ainda passam por revisão e verificações.

## 8. Definição de pronto

Uma tarefa está pronta quando:

- [ ] Os critérios de aceitação foram atendidos.
- [ ] As verificações relevantes foram executadas e passaram (ou as limitações foram registradas).
- [ ] A implementação está alinhada ao design aprovado.
- [ ] Não há alterações fora do escopo nem decisões pendentes escondidas.
- [ ] A documentação afetada foi atualizada.
- [ ] Outra pessoa revisou.
- [ ] O `kiro-log` foi atualizado, se a participação do Kiro foi relevante.

Código que compila ou um agente que diz "terminei" não significa pronto.

## 9. Registro do uso do Kiro

Depois de cada sessão relevante, quem a conduziu registra uma entrada em `docs/kiro-log.md` (modelo e exemplos estão no próprio arquivo). Esse registro vale pontos na avaliação e alimenta o pitch.

Registre o que realmente aconteceu: não afirme que a IA verificou ou decidiu algo que ela não fez.

## 10. Princípio final

O objetivo do SDD não é produzir documentos, e sim manter ligadas **as decisões do grupo, a especificação, o código e as verificações**. A documentação deve ser proporcional ao que está sendo feito: sem implementar coisas importantes sem spec, e sem criar papelada que ninguém usa.

O Kiro acelera o trabalho e ajuda a achar problemas. O controle do produto, da arquitetura e da qualidade continua com o grupo.