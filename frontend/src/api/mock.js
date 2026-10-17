/**
 * Implementação mock da API — ativa quando VITE_USE_MOCK=true.
 * Estado em memória: perdido ao recarregar (comportamento intencional, design.md §mock.js).
 */

/* Gera um shortCode aleatório de 6 caracteres alfanuméricos */
function generateShortCode() {
  return Math.random().toString(36).slice(2, 8).padEnd(6, '0');
}

/* Atraso configurável via VITE_MOCK_DELAY_MS (RF-04) */
function delay() {
  const ms = parseInt(import.meta.env.VITE_MOCK_DELAY_MS ?? '0', 10);
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* Dados iniciais — garantem lista não vazia em desenvolvimento (P-06, CA-03.3) */
const INITIAL_LINKS = [
  {
    shortCode: 'abc123',
    shortUrl: `${window.location.origin}/abc123`,
    originalUrl: 'https://example.com/pagina-muito-longa',
    createdAt: '2026-10-15T10:00:00Z',
    clicks: 42,
  },
  {
    shortCode: 'xyz789',
    shortUrl: `${window.location.origin}/xyz789`,
    originalUrl: 'https://outro-exemplo.com/artigo',
    createdAt: '2026-10-15T11:30:00Z',
    clicks: 7,
  },
];

/* Estado em memória — reiniciado ao recarregar a página */
let links = [...INITIAL_LINKS];

/**
 * Cria um link curto.
 * Ordem de verificação (design.md §mock.js):
 *   1. VITE_MOCK_ERROR=true → rejeita imediatamente
 *   2. URL inválida → 400 { error: 'URL inválida' }
 *   3. Aplica delay
 *   4. Cria e retorna
 */
export async function createLink(url) {
  /* 1. Simular erro de rede (RF-05, CA-05.1) */
  if (import.meta.env.VITE_MOCK_ERROR === 'true') {
    throw new Error('Erro de rede simulado');
  }

  /* 2. Validar URL (RF-06, CA-06.2) */
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    const err = Object.assign(new Error('URL inválida'), { type: 'validation' });
    throw err;
  }

  /* 3. Delay */
  await delay();

  /* 4. Criar e persistir em memória */
  const shortCode = generateShortCode();
  const newLink = {
    shortCode,
    shortUrl: `${window.location.origin}/${shortCode}`,
    originalUrl: url,
    createdAt: new Date().toISOString(),
    clicks: 0,
  };
  links = [...links, newLink];
  return newLink;
}

/**
 * Lista todos os links.
 * Retorna cópia do array para evitar mutações externas.
 */
export async function listLinks() {
  /* Simular erro de rede (RF-05) */
  if (import.meta.env.VITE_MOCK_ERROR === 'true') {
    throw new Error('Erro de rede simulado');
  }

  await delay();
  return [...links];
}
