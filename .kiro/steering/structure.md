# Estrutura do repositório

Monorepo: código, manifests, pipeline e documentação no mesmo lugar.

```
.
├── SSOT.md                  # escopo, requisitos do hackathon e tabela de decisões
├── README.md                # visão do projeto e como rodar
├── openapi.yaml             # contrato da API
├── docker-compose.yml       # stack completa local (e profile "test" para o pytest)
├── api/                     # API em Python/FastAPI
│   ├── app/                 # main, config, db, repository, shortcode, telemetry, schema.sql
│   └── tests/               # pytest
├── frontend/                # React + Vite, servido por nginx
│   ├── src/                 # api/, components/, config/, lib/, pages/, styles/
│   ├── public/mascot/       # poses do Furl
│   └── nginx.conf
├── k8s/                     # manifests (ponto de entrada: kustomization.yaml)
│   ├── base/                # namespace e Ingress
│   ├── api/  frontend/  database/
│   └── observability/       # Collector, Tempo, Prometheus, Grafana, configs e dashboard
├── argocd/application.yaml  # Application do ArgoCD (fora de k8s/ de propósito)
├── scripts/                 # kind-up, argocd-up, port-forward, gerar-trafego
├── .github/workflows/       # ci-cd.yaml, o único pipeline
├── docs/                    # registro do uso do Kiro, contrato de telemetria, guias e validação
└── .kiro/
    ├── steering/            # estes arquivos
    └── specs/               # 01-backend-api, 02-devops-gitops, 04-observabilidade
```

## Convenções

- Cada componente fica no seu diretório e tem seu próprio Dockerfile.
- Toda mudança no cluster passa por `k8s/`. Não aplique nada à mão: o ArgoCD desfaz.
- As configs da observabilidade ficam em `k8s/observability/config/` e são usadas pelo compose e pelo Kubernetes. Não crie cópias.
- Cada spec tem `requirements.md`, `design.md` e `tasks.md`. A numeração das specs é por área; o número 03 não foi usado.
- Antes de criar arquivo ou pasta nova, veja se já existe um lugar para aquilo.
- Documentação que muda com a estrutura (README, esta página, specs) é atualizada no mesmo commit da mudança.

## Mudanças estruturais

Mover diretórios, renomear arquivos de contrato ou trocar o ponto de entrada do kustomize afeta o pipeline e o ArgoCD. Proponha a mudança, explique o motivo e espere a equipe aprovar.
