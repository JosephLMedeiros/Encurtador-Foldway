/**
 * Módulo de acesso à API — única porta de entrada para chamadas de rede.
 * Nenhum componente deve importar fetch diretamente (CA-01.2).
 *
 * A API fica na mesma origem: o nginx (produção) e o Vite (desenvolvimento)
 * encaminham /api e /r para ela. Este módulo converte o contrato da API
 * (openapi.yaml, snake_case) para o formato usado pelos componentes.
 */

const NETWORK_ERROR = 'Falha na comunicação com o servidor';

/* Mensagens para o visitante; os códigos vêm do campo "error" da API */
const VALIDATION_MESSAGES = {
  invalid_url: 'Informe uma URL completa, começando com http:// ou https://',
};

/* Converte um link da API para o formato dos componentes */
function toLink(item) {
  return {
    shortCode: item.short_code,
    shortUrl: item.short_url,
    originalUrl: item.original_url,
    createdAt: item.created_at,
    clicks: item.clicks,
  };
}

/**
 * Cria um link curto.
 * Em 400 lança Error com a mensagem da API e type 'validation'.
 * @param {string} url - URL original a encurtar
 * @returns {Promise<{ shortCode, shortUrl, originalUrl, createdAt, clicks }>}
 */
export async function createLink(url) {
  const res = await fetch('/api/links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ original_url: url }),
  });

  if (res.status === 201) {
    return toLink(await res.json());
  }

  if (res.status === 400) {
    const body = await res.json();
    const message = VALIDATION_MESSAGES[body.error] ?? body.message ?? 'URL inválida';
    throw Object.assign(new Error(message), { type: 'validation' });
  }

  throw new Error(NETWORK_ERROR);
}

/**
 * Lista os links mais recentes (a API já devolve do mais novo ao mais antigo).
 * @returns {Promise<{ shortCode, shortUrl, originalUrl, createdAt, clicks }[]>}
 */
export async function listLinks() {
  const res = await fetch('/api/links');

  if (res.status === 200) {
    const body = await res.json();
    return body.items.map(toLink);
  }

  throw new Error(NETWORK_ERROR);
}
