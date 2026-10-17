/**
 * Tracing mínimo do navegador (sem dependências), para o trace começar no browser (D-14).
 * Cada chamada à API leva um traceparent W3C; ao terminar, o span vai em OTLP/JSON para
 * /otlp/v1/traces (nginx -> Collector). O nginx e a API continuam o mesmo trace.
 * Contrato: docs/otel-metrics-spec.md (service.name "kiro-browser").
 */
const SERVICE_NAME = 'kiro-browser';

function randomHex(bytes) {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

/* Microssegundos como BigInt: o valor em ns não cabe com precisão num Number */
function nowNanos() {
  return BigInt(Math.round((performance.timeOrigin + performance.now()) * 1000)) * 1000n;
}

function exportSpan(span) {
  const attr = (key, value) => (typeof value === 'number'
    ? { key, value: { intValue: value } }
    : { key, value: { stringValue: String(value) } });
  const body = {
    resourceSpans: [{
      resource: { attributes: [attr('service.name', SERVICE_NAME)] },
      scopeSpans: [{
        scope: { name: 'foldway-frontend' },
        spans: [{
          traceId: span.traceId,
          spanId: span.spanId,
          name: span.name,
          kind: 3, // CLIENT
          startTimeUnixNano: span.start.toString(),
          endTimeUnixNano: span.end.toString(),
          attributes: Object.entries(span.attributes).map(([k, v]) => attr(k, v)),
          status: { code: span.error ? 2 : 1 },
        }],
      }],
    }],
  };
  /* keepalive: o envio sobrevive a navegações; falha de telemetria nunca quebra a página */
  fetch('/otlp/v1/traces', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}

/** fetch com span CLIENT e propagação do traceparent. */
export async function tracedFetch(path, options = {}) {
  const method = (options.method ?? 'GET').toUpperCase();
  const span = {
    traceId: randomHex(16),
    spanId: randomHex(8),
    name: `${method} ${path}`,
    start: nowNanos(),
    attributes: { 'http.request.method': method, 'url.path': path },
    error: false,
  };
  const headers = { ...options.headers, traceparent: `00-${span.traceId}-${span.spanId}-01` };
  try {
    const res = await fetch(path, { ...options, headers });
    span.attributes['http.response.status_code'] = res.status;
    span.error = res.status >= 500;
    return res;
  } catch (err) {
    span.error = true;
    throw err;
  } finally {
    span.end = nowNanos();
    exportSpan(span);
  }
}
