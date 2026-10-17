# Frontend — Foldway

Interface web do encurtador de links. **React 19 + Vite**, **React Router v7**, CSS puro com variáveis de tema, sem TypeScript.

A API fica na mesma origem: em produção o nginx deste diretório encaminha `/api` e `/r` para ela; em desenvolvimento o Vite faz o mesmo papel. Por isso não há variáveis de ambiente nem CORS.

## Rodando

Pré-requisitos: Node.js 22 (o mesmo da imagem Docker) e a API no ar.

```sh
# na raiz do repositório: banco + API na porta 8080
docker compose up -d api

# neste diretório
npm install
npm run dev          # http://localhost:5173
```

A API em outro endereço: `API_URL=http://outro-host:8080 npm run dev`.

Para ver tudo como em produção (nginx + API + observabilidade): `docker compose up --build` na raiz e abra http://localhost:3000.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento com proxy para a API |
| `npm test` | Testes unitários, de componente e de acessibilidade (axe) |
| `npm run lint` | ESLint (JS/JSX) |
| `npm run lint:css` | Stylelint (CSS, com padrão BEM e sem cores hexadecimais fora do tema) |
| `npm run build` | Bundle de produção em `dist/` |

O CI (`.github/workflows/ci-cd.yaml`) roda lint, testes e build a cada push e PR.

## Contrato com a API

Só `src/api/api.js` faz chamadas de rede (regra do ESLint). Ele converte o contrato da API (`openapi.yaml`, snake_case) para o formato dos componentes:

| Função | Chamada | Retorno |
|---|---|---|
| `createLink(url)` | `POST /api/links` com `{ original_url }` | `{ shortCode, shortUrl, originalUrl, createdAt, clicks }` |
| `listLinks()` | `GET /api/links` | lista no mesmo formato, mais recente primeiro |

Erro 400 vira `Error` com mensagem para o visitante e `type: 'validation'`; outros erros viram "Falha na comunicação com o servidor".

Cada chamada passa por `src/api/tracing.js`: leva um `traceparent` W3C e gera um span `kiro-browser`, enviado em OTLP/JSON para `/otlp/v1/traces` (nginx → Collector). É assim que o trace no Tempo começa no navegador. Em `npm run dev` não há Collector, então esse envio falha em silêncio.

## QR Code

Cada link curto tem um QR Code (no resultado e no botão **QR Code** de cada item da lista), gerado no navegador com `qrcode-generator`:

- módulos em índigo sobre papel branco (contraste máximo para a câmera) e o origami coral no centro, com correção de erro nível H;
- cartão com o canto dobrado, a assinatura visual do Foldway, e download em PNG (1024 px);
- o QR aponta para `/r/{código}?via=qr`, e a API conta esses acessos em `kiro_feature_used_total{feature="qrcode"}`.

Um teste decodifica o QR gerado com `jsqr` para garantir que ele continua legível com o origami no centro.

## Link inexistente ou expirado

Quando a API responde 404 ou 410 em `/r/{código}`, o nginx entrega o app na mesma URL e a rota `/r/:code` mostra a tela do Furl. O status HTTP original é mantido.

## Mascote

As imagens do Furl ficam em `public/mascot/` (`welcome`, `loading`, `success`, `error`, `empty`, em `.webp`). Para trocar o mascote, substitua os arquivos e ajuste os textos alternativos em `src/config/mascot.js`; nenhum componente precisa mudar.

## Estrutura

```
src/
├── api/          # api.js (única porta de rede, converte o contrato) e tracing.js
├── components/   # CopyButton, FoldAnimation, LinkForm, LinkList, Mascot, QrCode
├── config/       # mascot.js — poses e textos do mascote
├── lib/          # funções puras: pose do mascote, QR Code, desenho do origami
├── pages/        # HomePage, NotFoundLinkPage, NotFoundPage
└── styles/       # theme.css (única fonte de cores) e global.css
```
