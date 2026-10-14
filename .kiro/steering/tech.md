# Tech Steering

## Tecnologias e requisitos obrigatórios

O projeto deve atender aos seguintes requisitos tecnológicos:

- **Kubernetes:** executar os componentes da aplicação no cluster.
- **GitHub Actions:** automatizar build, testes e publicação das imagens.
- **ArgoCD:** realizar a implantação contínua utilizando GitOps.
- **OpenTelemetry:** permitir a coleta e propagação de traces entre os componentes.
- **Grafana:** apresentar métricas e informações relevantes sobre o funcionamento da aplicação.
- **Containers:** empacotar os componentes para execução no ambiente Kubernetes.

## Decisões técnicas

O estado de cada decisão técnica (confirmada, pendente etc.) é mantido na tabela de decisões do `SSOT.md` (seção 8), que é a referência única. Este arquivo não deve repetir esse estado.

As principais escolhas técnicas e seus IDs na tabela são:

- Ambiente Kubernetes (D-02).
- Linguagem e framework da API (D-03).
- Tecnologia do frontend (D-04).
- Banco de dados (D-05).
- Estratégia de geração e armazenamento dos códigos curtos (D-06).
- Organização do repositório GitOps (D-07).
- Ferramentas e configuração detalhada de observabilidade (D-09).
- Registry de imagens de contêiner (D-10).

O Kiro deve consultar a tabela antes de propor ou implementar soluções e não deve tratar como definitiva nenhuma decisão cujo estado não seja `Confirmada`. Quando uma escolha for necessária para elaborar uma proposta técnica, deverá apresentar uma sugestão fundamentada e aguardar a validação da equipe.

Quando uma decisão for confirmada, os detalhes técnicos aprovados (como versões e convenções) podem ser registrados neste arquivo.

## Diretrizes gerais

- Priorizar soluções compatíveis com os requisitos do desafio e com o ambiente Kubernetes disponível.
- Evitar complexidade desnecessária para o escopo e o prazo do projeto (2026/10/19).
- Manter configurações específicas do ambiente separadas do código da aplicação.
- Não inventar credenciais, URLs, recursos disponíveis no cluster ou configurações já aprovadas.
- Documentar as decisões técnicas relevantes e manter os arquivos consistentes com as escolhas confirmadas pela equipe.