"""Módulo único de telemetria (contrato: docs/otel-metrics-spec.md).

- Traces: OTLP/HTTP para o Collector (OTEL_EXPORTER_OTLP_ENDPOINT); spans de servidor (FastAPI)
  e de cliente do banco (psycopg), propagação W3C traceparent.
- Métricas: expostas em GET /metrics (formato Prometheus) via PrometheusMetricReader.

O restante da aplicação usa só as funções deste módulo, nunca o SDK diretamente.
"""

import logging
import os
from collections.abc import Callable

# Precisa vir antes dos imports de instrumentação: nomes estáveis (http.server.request.duration em s).
os.environ.setdefault("OTEL_SEMCONV_STABILITY_OPT_IN", "http")

from fastapi import FastAPI, Response  # noqa: E402
from opentelemetry import metrics, trace  # noqa: E402
from opentelemetry.exporter.prometheus import PrometheusMetricReader  # noqa: E402
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor  # noqa: E402
from opentelemetry.instrumentation.psycopg import PsycopgInstrumentor  # noqa: E402
from opentelemetry.instrumentation.utils import suppress_instrumentation  # noqa: E402
from opentelemetry.metrics import CallbackOptions, Observation  # noqa: E402
from opentelemetry.sdk.metrics import MeterProvider  # noqa: E402
from opentelemetry.sdk.metrics.view import ExplicitBucketHistogramAggregation, View  # noqa: E402
from opentelemetry.sdk.resources import Resource  # noqa: E402
from opentelemetry.sdk.trace import TracerProvider  # noqa: E402
from opentelemetry.sdk.trace.export import BatchSpanProcessor  # noqa: E402
from prometheus_client import CONTENT_TYPE_LATEST, REGISTRY, generate_latest  # noqa: E402

log = logging.getLogger(__name__)

SERVICE_NAME = os.getenv("OTEL_SERVICE_NAME", "kiro-api")
REDIRECT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0]
EXCLUDED_URLS = "/healthz$,/readyz$,/metrics$"

_initialized = False
_active_links_source: Callable[[], int] | None = None
_links_created = _link_clicks = _redirect_duration = _feature_used = None

# Valores permitidos para o atributo "feature" (cardinalidade fixa). Adicione aqui cada feature nova.
FEATURES = frozenset({"stats", "ranking"})


def _setup_providers() -> None:
    global _initialized, _links_created, _link_clicks, _redirect_duration, _feature_used
    if _initialized:
        return
    resource = Resource.create({"service.name": SERVICE_NAME})

    tracer_provider = TracerProvider(resource=resource)  # sampler via OTEL_TRACES_SAMPLER
    sdk_disabled = os.getenv("OTEL_SDK_DISABLED", "false").lower() == "true"
    if os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT") and not sdk_disabled:
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

        tracer_provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
        log.info("traces exportados para %s", os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"])
    else:
        log.info("exportação de traces desligada (OTEL_EXPORTER_OTLP_ENDPOINT ausente)")
    trace.set_tracer_provider(tracer_provider)

    metrics.set_meter_provider(MeterProvider(
        resource=resource,
        metric_readers=[PrometheusMetricReader()],
        views=[View(instrument_name="kiro.link.redirect.duration",
                    aggregation=ExplicitBucketHistogramAggregation(REDIRECT_BUCKETS))],
    ))

    meter = metrics.get_meter("kiro-api")
    _links_created = meter.create_counter(
        "kiro.links.created", description="Links criados (kind=random|vanity)")
    _link_clicks = meter.create_counter(
        "kiro.link.clicks", description="Redirecionamentos bem-sucedidos (302)")
    _redirect_duration = meter.create_histogram(
        "kiro.link.redirect.duration", unit="s",
        description="Busca no banco + decisão do redirect (outcome=found|not_found|expired)")
    _feature_used = meter.create_counter(
        "kiro.feature.used", description="Uso das features do portal (feature=<nome fixo>)")
    meter.create_observable_gauge(
        "kiro.active_links", callbacks=[_observe_active_links],
        description="Links ativos (view active_links)")

    PsycopgInstrumentor().instrument(enable_commenter=False)
    _initialized = True


def _observe_active_links(_options: CallbackOptions):
    if _active_links_source is None:
        return []
    try:
        with suppress_instrumentation():  # não gera um trace a cada coleta do Prometheus
            return [Observation(_active_links_source())]
    except Exception as exc:
        log.warning("kiro.active_links indisponível: %s", exc)
        return []


def setup(app: FastAPI) -> None:
    """Inicializa providers (uma vez por processo), instrumenta o app e expõe /metrics."""
    _setup_providers()
    FastAPIInstrumentor.instrument_app(app, excluded_urls=EXCLUDED_URLS)

    @app.get("/metrics", include_in_schema=False)
    def metrics_endpoint():
        return Response(generate_latest(REGISTRY), media_type=CONTENT_TYPE_LATEST)


def set_active_links_source(source: Callable[[], int]) -> None:
    global _active_links_source
    _active_links_source = source


# ---------- Interface usada pelo código de negócio ----------

def link_created(vanity: bool) -> None:
    _links_created.add(1, {"kind": "vanity" if vanity else "random"})


def link_clicked() -> None:
    _link_clicks.add(1)


def redirect_finished(seconds: float, outcome: str) -> None:
    _redirect_duration.record(seconds, {"outcome": outcome})


def feature_used(feature: str) -> None:
    if feature not in FEATURES:
        raise ValueError(f"feature desconhecida: {feature} (cadastre em telemetry.FEATURES)")
    _feature_used.add(1, {"feature": feature})


def tag_short_code(code: str) -> None:
    trace.get_current_span().set_attribute("kiro.link.short_code", code)
