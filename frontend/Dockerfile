# Frontend placeholder: nginx serve arquivos estáticos e faz proxy de /api e /r para a API.
# Quando o frontend real existir (React/Vite etc.), adicione uma etapa de build e copie o
# resultado (dist/) para /usr/share/nginx/html — o nginx.conf continua o mesmo.
#
#   FROM node:22-alpine AS build
#   WORKDIR /src
#   COPY package*.json ./
#   RUN npm ci
#   COPY . .
#   RUN npm run build
#   ...
#   COPY --from=build /src/dist/ /usr/share/nginx/html/
#
# Imagem -otel: já traz o módulo oficial de OpenTelemetry do nginx (ngx_otel_module).
FROM nginx:1.27-alpine-otel
COPY nginx.conf /etc/nginx/nginx.conf
COPY public/ /usr/share/nginx/html/
EXPOSE 8080
