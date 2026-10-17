/**
 * Módulo de acesso à API — única porta de entrada para chamadas de rede.
 * Nenhum componente deve importar fetch diretamente (CA-01.2).
 *
 * Seleciona entre implementação real e mock via VITE_USE_MOCK (RF-03).
 * Endereço base lido de VITE_API_BASE_URL em build-time (RF-02).
 */
import * as mockApi from './mock.js';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

/* ── Implementação real ────────────────────────────────────────────────── */

async function realCreateLink(url) {
  const res = await fetch(`${BASE}/api/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  if (res.status === 201) {
    return res.json();
  }

  if (res.status === 400) {
    const body = await res.json();
    throw Object.assign(new Error(body.error), { type: 'validation' });
  }

  throw new Error('Falha na comunicação com o servidor');
}

async function realListLinks() {
  const res = await fetch(`${BASE}/api/links`);

  if (res.status === 200) {
    return res.json();
  }

  throw new Error('Falha na comunicação com o servidor');
}

/* ── Seleção de implementação (CA-03.1, CA-03.2) ────────────────────────── */

/**
 * Cria um link curto.
 * @param {string} url - URL original a encurtar
 * @returns {{ shortCode, shortUrl, originalUrl, createdAt }}
 */
export async function createLink(url) {
  if (import.meta.env.VITE_USE_MOCK === 'true') {
    return mockApi.createLink(url);
  }
  return realCreateLink(url);
}

/**
 * Lista todos os links criados.
 * @returns {{ shortCode, originalUrl, createdAt, clicks }[]}
 */
export async function listLinks() {
  if (import.meta.env.VITE_USE_MOCK === 'true') {
    return mockApi.listLinks();
  }
  return realListLinks();
}
