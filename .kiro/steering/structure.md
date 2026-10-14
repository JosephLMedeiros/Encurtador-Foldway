# Structure Steering

## Organização do repositório

O projeto deve seguir uma organização modular, separando a documentação, o código da aplicação, os recursos de infraestrutura e os arquivos de automação.

A estrutura planejada é:

- `SSOT.md`: referência central dos objetivos, requisitos gerais e decisões do projeto.
- `README.md`: apresentação do projeto e instruções de uso.
- `.kiro/steering/`: orientações permanentes para o Kiro.
- `.kiro/specs/`: especificações funcionais e técnicas organizadas por área ou funcionalidade.
- `docs/`: documentação complementar, fluxos de trabalho e registros de desenvolvimento.
- `frontend/`: código da interface da aplicação.
- `api/`: código da API.
- `k8s/`: manifests e recursos de implantação no Kubernetes.
- `.github/workflows/`: workflows de automação do GitHub Actions.

## Convenções

- Manter cada componente em seu diretório correspondente.
- Organizar as specs por funcionalidade ou área do sistema, mantendo os arquivos `requirements.md`, `design.md` e `tasks.md` dentro de cada especificação.
- Evitar duplicar informações já documentadas no SSOT ou nas specs.
- Atualizar a documentação quando mudanças relevantes alterarem a organização do projeto.
- Reutilizar a estrutura existente antes de criar novos diretórios ou arquivos.
- Manter nomes claros e consistentes com as convenções já adotadas no repositório.

## Flexibilidade da estrutura

A estrutura descrita representa a organização planejada inicialmente e pode ser ajustada conforme a evolução do projeto.

O Kiro deve respeitar a organização existente e propor alterações estruturais quando necessário, explicando sua finalidade e aguardando a aprovação da equipe antes de realizar mudanças significativas.

Decisões sobre tecnologias, arquitetura interna e implementação não devem ser inferidas apenas com base na localização dos arquivos.