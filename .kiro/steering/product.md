# Product Steering

## Visão do produto

O projeto consiste no desenvolvimento de um encurtador de URLs com uma proposta criativa e uma arquitetura cloud-native. A aplicação permitirá transformar URLs longas em links curtos, armazenar os dados associados e redirecionar os usuários para seus destinos originais.

O desenvolvimento será realizado em equipe, utilizando o Kiro como ferramenta de apoio e Spec-Driven Development (SDD) para organizar requisitos, decisões técnicas e implementação.

## Objetivos

- Desenvolver uma aplicação funcional de encurtamento e redirecionamento de URLs.
- Demonstrar o uso de tecnologias cloud-native, com execução em Kubernetes e implantação por GitOps.
- Implementar automação de build e testes por meio de CI/CD.
- Permitir a observabilidade da aplicação por meio de métricas e traces.
- Criar uma identidade visual própria e funcionalidades que diferenciem o produto.
- Documentar o processo de desenvolvimento e o uso do Kiro.

## Público-alvo

O produto será destinado a usuários que precisam criar, compartilhar e acessar links curtos de maneira simples e prática.

A interface deve priorizar clareza, facilidade de uso e apresentação objetiva das funcionalidades disponíveis.

Mais especificidades podem ser definidas de acordo com as decisões de identidade do grupo.

## Escopo inicial

O escopo funcional obrigatório inclui:

- Criar links curtos a partir de URLs originais.
- Persistir a associação entre códigos curtos e URLs originais.
- Redirecionar acessos aos destinos correspondentes.
- Disponibilizar uma interface para criação e listagem dos links.

Funcionalidades adicionais e elementos de identidade própria poderão ser definidos pela equipe ao longo do desenvolvimento, respeitando o prazo e os requisitos do desafio.

## Diretrizes de produto

- Priorizar o funcionamento correto das funcionalidades essenciais antes de adicionar recursos extras.
- Manter uma experiência de uso simples e coerente.
- Não assumir funcionalidades, regras de negócio ou decisões de produto que ainda não tenham sido aprovadas pela equipe.
- Manter as especificações alinhadas aos objetivos e requisitos registrados no SSOT.