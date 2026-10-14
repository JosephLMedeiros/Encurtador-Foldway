# Projeto Encurtador

Este projeto propõe o desenvolvimento de um encurtador de URLs com uma abordagem cloud-native, combinando funcionalidades práticas com tecnologias de conteinerização, orquestração e observabilidade. A aplicação será desenvolvida de forma incremental, utilizando o Kiro e a abordagem Spec-Driven Development (SDD) para organizar requisitos, planejar a implementação e manter as decisões técnicas documentadas.

A organização a seguir mostra a estrutura pensada para o projeto nessa etapa inicial, ela poderá (e provavelmente vai) ser ajustada conforme as necessidades do projeto e as decisões tomadas pela equipe.

```text
projeto/
├── SSOT.md
├── README.md
├── .kiro/
│   ├── steering/
│   └── specs/
├── docs/
│   ├── development-workflow.md
│   ├── kiro-log.md
├── frontend/
├── api/
├── k8s/
└── .github/
    └── workflows/
```