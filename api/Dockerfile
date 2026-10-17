# ---- Etapa 1: instala dependências num virtualenv isolado ----
FROM python:3.12-slim AS build
RUN python -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# ---- Etapa 2: imagem final mínima, sem compiladores, usuário sem root ----
FROM python:3.12-slim
ENV PATH=/opt/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
RUN useradd --system --uid 10001 --no-create-home kiro
COPY --from=build /opt/venv /opt/venv
WORKDIR /app
COPY app ./app
USER 10001
EXPOSE 8080
# 1 worker por pod: o Kubernetes escala com réplicas, e as métricas /metrics ficam consistentes por processo.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--forwarded-allow-ips", "*"]
