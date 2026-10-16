// Placeholder do frontend: chama a API pela mesma origem (/api, /r) através do nginx.
const $ = (sel) => document.querySelector(sel);

function api(path, options) {
  return fetch(path, options);
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
