# Frontend — Foldway (sugestão de nome, D-16 pendente)

Interface web do encurtador de links. Construída com **React 19 + Vite**, **React Router v7**, CSS puro com variáveis de tema e sem TypeScript.

---

## Pré-requisitos

- Node.js ≥ 18
- npm ≥ 9

---

## Instalação

```sh
npm install
```

---

## Desenvolvimento

```sh
npm run dev
```

Abre em `http://localhost:5173`. Por padrão usa o mock da API (sem servidor real).

### Variáveis de ambiente

Copie `.env.example` para `.env.local` e ajuste conforme necessário:

```sh
cp .env.example .env.local
```

| Variável | Padrão (dev) | Descrição |
|---|---|---|
| `VITE_API_BASE_URL` | `""` (mesmo domínio) | Endereço base da API real (sem barra final) |
| `VITE_USE_MOCK` | `true` | `true` ativa o mock; `false` usa a API real |
| `VITE_MOCK_DELAY_MS` | `""` (sem delay) | Atraso artificial das respostas do mock (ms) |
| `VITE_MOCK_ERROR` | `false` | `true` faz o mock rejeitar todas as chamadas |

> Os arquivos `.env.development` e `.env.production` estão versionados com os valores padrão de cada ambiente. Crie `.env.local` para sobrescrever localmente — ele está no `.gitignore`.

---

## Testes

```sh
npm test
```

Roda todos os testes uma vez (`vitest --run`). Inclui testes unitários, de componente e verificações de acessibilidade com axe.

---

## Lint

```sh
# JavaScript e JSX
npm run lint

# CSS
npm run lint:css
```

---

## Build de produção

```sh
npm run build
```

O bundle é gerado em `dist/`. O valor de `VITE_API_BASE_URL` é embutido no bundle no momento do build — alterar o endereço da API exige rebuild.

```sh
# Pré-visualizar o build localmente
npm run preview
```

---

## Mascote (D-08 pendente)

As imagens do mascote são SVGs provisórios em `public/mascot/`. Para substituir pela arte final:

1. Coloque os novos arquivos em `public/mascot/` com os mesmos nomes: `welcome.svg`, `loading.svg`, `success.svg`, `error.svg`, `empty.svg`.
2. Atualize os textos alternativos (`alt`) em `src/config/mascot.js` se necessário.
3. Atualize o campo `name` em `src/config/mascot.js` com o nome definitivo do mascote.

Nenhum componente precisa ser alterado.

---

## Estrutura relevante

```
src/
├── api/          # api.js (interface pública) e mock.js
├── components/   # CopyButton, LinkForm, LinkItem, LinkList, Mascot
├── config/       # mascot.js — configuração centralizada do mascote
├── lib/          # mascotPose.js — lógica pura de prioridade de poses
├── pages/        # HomePage, NotFoundLinkPage, NotFoundPage
└── styles/       # theme.css (variáveis CSS) e global.css
public/
└── mascot/       # imagens SVG do mascote (provisórias)
```
