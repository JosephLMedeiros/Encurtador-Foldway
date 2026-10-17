# Etapa 1: build do React/Vite (gera dist/ com os assets já com hash no nome).
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Etapa 2: nginx serve o dist/ e faz proxy de /api e /r para a API (mesma origem, sem CORS).
# Imagem -otel: já traz o módulo oficial de OpenTelemetry do nginx (ngx_otel_module).
FROM nginx:1.27-alpine-otel
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /src/dist/ /usr/share/nginx/html/
EXPOSE 8080
