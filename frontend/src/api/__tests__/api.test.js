/**
 * Testes de api.js
 * CA-01.1 a CA-01.4, CA-02.1, CA-03.1, CA-03.2, CA-06.1
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

/* Importa api.js sem mock ativo (VITE_USE_MOCK ausente / false) */
async function freshApi(env = {}) {
  vi.stubEnv('VITE_USE_MOCK', env.VITE_USE_MOCK ?? 'false');
  vi.stubEnv('VITE_API_BASE_URL', env.VITE_API_BASE_URL ?? 'http://api.test');
  vi.stubEnv('VITE_MOCK_ERROR', env.VITE_MOCK_ERROR ?? 'false');
  vi.resetModules();
  return import('../api.js');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

/* ── CA-01.1: exporta createLink e listLinks ─────────────────────────────── */
describe('CA-01.1 — interface pública', () => {
  it('exporta createLink e listLinks', async () => {
    const api = await freshApi();
    expect(typeof api.createLink).toBe('function');
    expect(typeof api.listLinks).toBe('function');
  });
});

/* ── CA-02.1: usa VITE_API_BASE_URL como prefixo ────────────────────────── */
describe('CA-02.1 — endereço base', () => {
  it('createLink envia requisição para BASE/api/links', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      json: async () => ({
        shortCode: 'abc', shortUrl: 'http://api.test/abc',
        originalUrl: 'https://x.com', createdAt: '2026-01-01T00:00:00Z',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const api = await freshApi({ VITE_API_BASE_URL: 'http://api.test' });
    await api.createLink('https://x.com');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/links',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

/* ── CA-01.3: createLink retorna objeto correto em 201 ───────────────────── */
describe('CA-01.3 — createLink em 201', () => {
  it('retorna { shortCode, shortUrl, originalUrl, createdAt }', async () => {
    const payload = {
      shortCode: 'abc123', shortUrl: 'http://api.test/abc123',
      originalUrl: 'https://example.com', createdAt: '2026-01-01T00:00:00Z',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 201, json: async () => payload,
    }));

    const api = await freshApi();
    const result = await api.createLink('https://example.com');
    expect(result).toEqual(payload);
  });
});

/* ── CA-06.1: createLink lança erro com message = body.error em 400 ────── */
describe('CA-06.1 — createLink em 400', () => {
  it('lança Error com message igual a body.error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 400, json: async () => ({ error: 'URL inválida' }),
    }));

    const api = await freshApi();
    await expect(api.createLink('ftp://bad')).rejects.toMatchObject({
      message: 'URL inválida',
      type: 'validation',
    });
  });
});

/* ── CA-01.4: listLinks retorna array correto em 200 ─────────────────────── */
describe('CA-01.4 — listLinks em 200', () => {
  it('retorna array de { shortCode, originalUrl, createdAt, clicks }', async () => {
    const payload = [
      { shortCode: 'abc', originalUrl: 'https://x.com', createdAt: '2026-01-01T00:00:00Z', clicks: 3 },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200, json: async () => payload,
    }));

    const api = await freshApi();
    const result = await api.listLinks();
    expect(result).toEqual(payload);
  });
});

/* ── CA-03.1: com VITE_USE_MOCK=true, createLink não chama fetch ──────────── */
describe('CA-03.1 — seleção do mock em createLink', () => {
  it('com VITE_USE_MOCK=true, não chama fetch global', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { location: { origin: 'http://localhost' } });

    const api = await freshApi({ VITE_USE_MOCK: 'true' });
    /* mock retornará dados sem erros */
    await api.createLink('https://example.com');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/* ── CA-03.2: com VITE_USE_MOCK=false, createLink tenta fetch real ────────── */
describe('CA-03.2 — seleção da implementação real', () => {
  it('com VITE_USE_MOCK=false, chama fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      json: async () => ({
        shortCode: 'z', shortUrl: 'http://api.test/z',
        originalUrl: 'https://x.com', createdAt: '2026-01-01T00:00:00Z',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const api = await freshApi({ VITE_USE_MOCK: 'false' });
    await api.createLink('https://x.com');

    expect(fetchMock).toHaveBeenCalled();
  });
});

/* ── Erro de rede ─────────────────────────────────────────────────────────── */
describe('createLink — erro de rede', () => {
  it('lança erro genérico quando fetch rejeita', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const api = await freshApi();
    await expect(api.createLink('https://x.com')).rejects.toThrow();
  });
});
