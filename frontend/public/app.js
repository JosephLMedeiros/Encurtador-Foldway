// Placeholder do frontend: chama a API pela mesma origem (/api, /r) através do nginx.
const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------------------
// Tracing mínimo do navegador (sem dependências), para o trace começar no browser:
// cada chamada gera um traceparent W3C e, ao terminar, envia o span em OTLP/JSON para
// /otlp/v1/traces (nginx -> Collector). O frontend real deve trocar isto pelo SDK oficial
// (@opentelemetry/sdk-trace-web + instrumentation-fetch), mantendo service.name "kiro-browser".
// ---------------------------------------------------------------------------
const SERVICE_NAME = "kiro-browser";

function randomHex(bytes) {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function nowNanos() {
  // microssegundos como BigInt (o valor em ns não cabe com precisão num Number)
  return BigInt(Math.round((performance.timeOrigin + performance.now()) * 1000)) * 1000n;
}

function exportSpan(span) {
  const attr = (key, value) => typeof value === "number"
    ? { key, value: { intValue: value } }
    : { key, value: { stringValue: String(value) } };
  const body = {
    resourceSpans: [{
      resource: { attributes: [attr("service.name", SERVICE_NAME)] },
      scopeSpans: [{
        scope: { name: "kiro-placeholder-tracer" },
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
  // keepalive: o envio sobrevive a navegações; falhas de telemetria nunca quebram a página.
  fetch("/otlp/v1/traces", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}

async function api(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const route = path.split("?")[0];
  const span = {
    traceId: randomHex(16), spanId: randomHex(8), name: `${method} ${route}`,
    start: nowNanos(), attributes: { "http.request.method": method, "url.path": route }, error: false,
  };
  const headers = { ...(options.headers || {}), traceparent: `00-${span.traceId}-${span.spanId}-01` };
  try {
    const res = await fetch(path, { ...options, headers });
    span.attributes["http.response.status_code"] = res.status;
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

function text(value) {
  const span = document.createElement("span");
  span.textContent = value;
  return span.innerHTML;
}

async function loadLinks() {
  const res = await api("/api/links?limit=20");
  const { items } = await res.json();
  $("#links").innerHTML = items.map((l) => `
    <tr>
      <td><a href="/r/${encodeURIComponent(l.short_code)}" target="_blank" rel="noopener">${text(l.short_code)}</a></td>
      <td class="url" title="${text(l.original_url)}">${text(l.original_url)}</td>
      <td>${l.clicks}</td>
    </tr>`).join("");
}

async function loadRanking() {
  const res = await api("/api/ranking?limit=5");
  const { items } = await res.json();
  $("#ranking").innerHTML = items.length
    ? items.map((i) => `<li>${text(i.short_code)}: ${i.clicks} cliques</li>`).join("")
    : "<li class='muted'>Nenhum clique nas últimas 24h.</li>";
}

$("#create").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const body = { original_url: form.get("original_url") };
  if (form.get("custom_code")) body.custom_code = form.get("custom_code");

  const res = await api("/api/links", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  const msg = $("#msg");
  if (res.ok) {
    msg.className = "ok";
    msg.innerHTML = `Portal aberto: <a href="${text(data.short_url)}" target="_blank" rel="noopener">${text(data.short_url)}</a>`;
    event.target.reset();
    loadLinks();
  } else {
    msg.className = "err";
    msg.textContent = data.message || "Erro ao criar link";
  }
});

loadLinks();
loadRanking();
