# SSOT — Encurtador de Links (nome pendente)

## 1. Propósito do documento

Este documento centraliza o escopo, os requisitos obrigatórios, as restrições e as decisões gerais do projeto de encurtador de links cloud-native desenvolvido para o hackathon.

Seu objetivo é manter uma referência consistente para o grupo, orientar a elaboração das especificações com Spec-Driven Development (SDD) e apoiar o desenvolvimento com o Kiro.

## 2. Visão do projeto

O projeto consiste no desenvolvimento de um encurtador de links com identidade própria, capaz de criar links curtos, armazenar a relação entre os códigos e as URLs originais e redirecionar usuários para os destinos correspondentes.

A aplicação deverá demonstrar práticas de engenharia cloud-native, incluindo execução em Kubernetes, automação de build e testes, publicação de imagens, implantação via GitOps e observabilidade distribuída.

O produto também deverá apresentar um personagem ou mascote, identidade visual própria e funcionalidades exclusivas que contribuam para diferenciá-lo de um encurtador convencional.

O **nome, público-alvo específico, tema, personagem e funcionalidades exclusivas** ainda estão pendentes. 

## 3. Requisitos obrigatórios do hackathon

Os requisitos abaixo derivam do enunciado da competição e constituem o escopo mínimo obrigatório.

### 3.1. Funcionalidades da aplicação

- **R-01 — Arquitetura da aplicação:** a solução deve possuir frontend, API e banco de dados, com os três componentes executando no Kubernetes.
- **R-02 — Criação e listagem:** o frontend deve permitir criar e listar links.
- **R-03 — Encurtamento e redirecionamento:** a API deve gerar ou associar códigos curtos e redirecionar usuários para as URLs originais.
- **R-04 — Persistência:** o banco de dados deve armazenar o mapeamento entre códigos curtos e URLs originais.

### 3.2. Infraestrutura e automação

- **R-05 — Recursos Kubernetes:** utilizar Deployments, Services, ConfigMaps, Secrets e probes de saúde.
- **R-06 — CI com GitHub Actions:** automatizar build, testes e publicação de imagens de contêiner.
- **R-07 — GitOps com ArgoCD:** utilizar um repositório Git como fonte de verdade para o estado desejado do cluster.

### 3.3. Observabilidade

- **R-08 — OpenTelemetry:** demonstrar traces distribuídos atravessando os componentes da aplicação.
- **R-09 — Grafana:** apresentar dashboards com métricas de cliques, latência, erros e saúde da aplicação.

### 3.4. Identidade e diferenciação

- **R-10 — Personagem e identidade visual:** criar um personagem ou mascote com nome, personalidade e representação visual, além de uma identidade própria para o produto.
- **R-11 — Tema e narrativa:** definir o conceito criativo, a história e o tom de voz do produto.
- **R-12 — Funcionalidades exclusivas:** implementar funcionalidades que diferenciem o produto e sejam coerentes com sua identidade.

### 3.5. Documentação e apresentação

- **R-13 — Uso do Kiro:** documentar prompts relevantes, resultados gerados, revisões humanas e decisões tomadas durante o desenvolvimento.
- **R-14 — Repositório e README:** entregar o código-fonte, os manifests Kubernetes, os workflows de CI/CD e a documentação necessária.
- **R-15 — Demonstração:** preparar uma apresentação de até 15 minutos, incluindo uma demonstração funcional da aplicação e dos recursos cloud-native.

## 4. Critérios de avaliação e prioridades

O enunciado avalia o projeto pelos critérios abaixo. Eles orientam a priorização, mas não alteram o escopo obrigatório.

| Critério | Peso | Requisitos relacionados |
|---|---|---|
| Engenharia cloud-native (K8s, Actions, ArgoCD, OTel e Grafana funcionando ponta a ponta) | 35% | R-01, R-05, R-06, R-07 |
| Criatividade e personagem | 30% | R-10, R-11, R-12 |
| Observabilidade (dashboard útil + traces reais cruzando os três componentes) | 15% | R-08, R-09 |
| Uso do Kiro | 10% | R-13 |
| Pitch e demo ao vivo | 10% | R-15 |

**Diretrizes de priorização**
- A stack precisa funcionar ponta a ponta antes de investir em features extras.
- Criatividade pesa quase tanto quanto engenharia: não deixar a identidade para a última hora.
- Toda feature exclusiva deve, se possível, gerar sinais observáveis (métricas ou traces).

## 5. Restrições e contexto técnico

- Os componentes da aplicação devem executar em Kubernetes.
- A automação de CI/CD deve utilizar GitHub Actions.
- A implantação GitOps deve utilizar ArgoCD.
- A observabilidade deve contemplar OpenTelemetry e Grafana.
- O desenvolvimento deve utilizar o Kiro, com documentação de seu uso.

## 6. Arquitetura conceitual

A arquitetura deverá conter três componentes principais:

- **Frontend:** interface responsável pela criação e listagem de links.
- **API:** componente responsável pelas operações de encurtamento, acesso aos dados e redirecionamento.
- **Banco de dados:** componente responsável pela persistência do mapeamento entre códigos curtos e URLs originais.

A solução deverá integrar esses componentes à infraestrutura Kubernetes, ao pipeline de CI/CD, à implantação GitOps e à infraestrutura de observabilidade.

## 7. Entregáveis

- [ ] Repositório Git contendo código-fonte, manifests Kubernetes e workflows do GitHub Actions.
- [ ] Aplicação implantada no cluster Kubernetes por meio do ArgoCD.
- [ ] Dashboard Grafana demonstrável.
- [ ] Traces distribuídos demonstráveis com OpenTelemetry.
- [ ] Personagem, identidade visual e funcionalidades exclusivas implementados.
- [ ] README com a proposta do produto, instruções de execução e documentação do uso do Kiro.
- [ ] Apresentação de até 15 minutos, conforme o enunciado do hackathon.

## 8. Registro/Estado de decisões

| ID | Decisão | Estado | Data | Justificativa / alternativas | Aprovada por |
|---|---|---|---|---|---|
| D-01 | Stack obrigatória: Kubernetes, GitHub Actions, ArgoCD, OpenTelemetry, Grafana | Confirmada | 2026-10-13 | Definida pelo enunciado | — |
| D-02 | Ambiente Kubernetes (local ou cluster do bootcamp) | Pendente | | | |
| D-03 | Tecnologia da API | Pendente | | | |
| D-04 | Frontend: React + Vite, JavaScript (sem TypeScript), React Router, CSS puro com variáveis de tema, animações em CSS e SVG, API mockada atrás de um único módulo (`api.js`) | Confirmada | 2026-10-15 | Proposta pelo responsável pelo frontend, É a stack que ele conhece e facilita a revisão do código gerado pelo Kiro. | — |
| D-05 | Banco de dados | Pendente | | | |
| D-06 | Formato do código curto | Pendente | | | |
| D-07 | Organização do repositório GitOps | Pendente | | | |
| D-08 | Mascote (personagem): Furl, o artista que dobra os atalhos (arte final em `public/mascot/*.webp`) | Proposta | | Candidatos: Furl (artista que dobra o espaço) e gatinho da caixa (estilo chibi/cartoon). O frontend trata o mascote como componente trocável | |
| D-09 | Ferramentas e configuração de observabilidade (coleta, armazenamento de traces e métricas, dashboards) | Pendente | | | |
| D-10 | Registry de imagens de contêiner | Pendente | | | |
| D-11 | Contrato da API usado pelo frontend: `POST /api/links` com `{ url }` → 201 `{ shortCode, shortUrl, originalUrl, createdAt }`; `GET /api/links` → 200 `[{ shortCode, originalUrl, createdAt, clicks }]`; erro de validação → 400 `{ error }`; código inexistente → 404 | Proposta | | Padrão de trabalho do frontend, adotado sem alinhamento prévio com a API (D-03). Se a API real divergir, a adaptação fica restrita a `api.js` | |
| D-12 | Roteamento das telas do visitante (link inexistente, expirado) | Pendente | | Opções: a API redireciona para uma rota do frontend, ou o Ingress envia o caminho do código curto ao frontend | |
| D-13 | Comunicação do frontend com a API (proxy no nginx, Ingress com caminhos separados ou CORS) | Pendente | | Depende de D-02 e de quem cuida do Kubernetes | |
| D-14 | OpenTelemetry no navegador (instrumentação e endereço do Collector acessível ao frontend) | Pendente | | Depende de D-09 | |
| D-15 | Paleta visual: Índigo, papel e coral, em versão clara (fundo `--color-mist`, texto índigo) | Proposta | | Índigo #14182B, azul-ardósia #2C3A5E, branco-papel #F7F3EA, kraft #CDB28A, coral #F2553D, ciano #2DE2E6 (valores de referência) | |
| D-16 | Nome do portal: **Foldway** (features exclusivas ainda pendentes) | Proposta | | | |

Estados possíveis:

- **Confirmada:** aprovada pelo grupo.
- **Em discussão:** anteriormente considerada, mas ainda não aprovada definitivamente.
- **Proposta:** alternativa sugerida para discussão.
- **Pendente:** ainda não discutida ou decidida.

Nenhuma proposta gerada pelo Kiro ou por outro assistente deve ser considerada aprovada sem validação humana.

As decisões relevantes devem registrar, quando necessário, a justificativa, as alternativas consideradas, os impactos e a data de aprovação.


## 9. Critérios gerais de conclusão

O projeto deverá demonstrar:

1. Criação, listagem e redirecionamento funcional de links.
2. Persistência correta dos dados.
3. Execução dos três componentes no Kubernetes.
4. Recursos de configuração e saúde exigidos.
5. Pipeline automatizado de build, testes e publicação de imagens.
6. Implantação gerenciada pelo ArgoCD.
7. Observabilidade distribuída e dashboards com as métricas exigidas.
8. Identidade própria e funcionalidades exclusivas.
9. Documentação técnica e registro do uso do Kiro.
10. Demonstração coerente com os requisitos do hackathon.

Os critérios específicos de aceitação e verificação deverão ser definidos nas respectivas especificações.

## 10. Governança do projeto

1. Este documento é a referência central para o escopo geral, as restrições e as decisões aprovadas.
2. As especificações detalham funcionalidades e mudanças específicas, mantendo consistência com este documento.
3. Mudanças de escopo ou de decisões técnicas devem ser documentadas antes de orientar novas implementações.
4. O código e a infraestrutura devem ser revisados e verificados conforme os critérios de aceitação aplicáveis.
5. O uso do Kiro deve ser acompanhado de revisão humana e registro das decisões relevantes.
6. O grupo deve manter a documentação alinhada à implementação, evitando divergências entre requisitos, design, tarefas e código.
7. Podem aprovar documentos e decisões: Joseph Roberto.

## 11. Referências do projeto

- **Enunciado oficial do hackathon:** fonte dos requisitos obrigatórios, critérios de avaliação e entregáveis.
- **`.kiro/steering/`:** orientações persistentes sobre o produto, as tecnologias, a estrutura do repositório e o fluxo de trabalho do Kiro.
- **`.kiro/specs/`:** especificações detalhadas de requisitos, design e tarefas por funcionalidade ou área do sistema.
- **`docs/development-workflow.md`:** orientações para a equipe sobre o processo de desenvolvimento, revisão e definição de pronto.
- **`docs/kiro-log.md`:** registro das interações relevantes com o Kiro, dos resultados obtidos e das decisões tomadas pela equipe.
- **`README.md`:** apresentação do projeto, sua organização e instruções de uso e execução, conforme forem definidas.