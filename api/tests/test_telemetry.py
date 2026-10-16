"""Verifica o contrato de telemetria de docs/otel-metrics-spec.md."""

import pytest
from opentelemetry import trace
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter


@pytest.fixture(scope="module")
def spans():
    exporter = InMemorySpanExporter()
    trace.get_tracer_provider().add_span_processor(SimpleSpanProcessor(exporter))
    return exporter


def test_metrics_follow_contract(client):
    client.post("/api/links", json={"original_url": "https://example.com", "custom_code": "metrica"})
    client.post("/api/links", json={"original_url": "https://example.com"})
    client.get("/r/metrica")
    client.get("/r/nao-existe")

    r = client.get("/metrics")
    assert r.status_code == 200
    text = r.text
    assert "kiro_link_clicks_total{" in text
    assert 'kiro_links_created_total{kind="vanity"' in text
    assert 'kiro_links_created_total{kind="random"' in text
    redirect = [line for line in text.splitlines()
                if line.startswith("kiro_link_redirect_duration_seconds_bucket")]
    assert any('le="0.005"' in line and 'outcome="found"' in line for line in redirect)
    assert any('outcome="not_found"' in line for line in redirect)
    assert "kiro_active_links{" in text
    assert "http_server_request_duration_seconds" in text
    # http.route é o template, nunca o caminho real (regra de cardinalidade)
    assert 'http_route="/r/{short_code}"' in text
    assert "/r/metrica" not in text


def test_trace_has_db_span_as_child_of_server_span(client, spans):
    client.post("/api/links", json={"original_url": "https://example.com", "custom_code": "traced"})
    spans.clear()
    client.get("/r/traced", headers={"traceparent": "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"})

    finished = spans.get_finished_spans()
    server = [s for s in finished if s.kind == trace.SpanKind.SERVER]
    db = [s for s in finished if s.kind == trace.SpanKind.CLIENT]
    assert server and db
    root = server[0]
    assert root.name == "GET /r/{short_code}"
    assert root.attributes["kiro.link.short_code"] == "traced"
    # continua o trace recebido do frontend (W3C traceparent)
    assert format(root.context.trace_id, "032x") == "0af7651916cd43dd8448eb211c80319c"
    assert all(s.context.trace_id == root.context.trace_id for s in db)
    assert any(s.attributes.get("db.system") == "postgresql" or
               s.attributes.get("db.system.name") == "postgresql" for s in db)


def test_feature_usage_metric(client):
    client.get("/api/ranking")
    assert 'kiro_feature_used_total{feature="ranking"' in client.get("/metrics").text
