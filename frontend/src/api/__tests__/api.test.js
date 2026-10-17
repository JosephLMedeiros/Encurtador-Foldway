/**
 * Testes de api.js contra o contrato da API (openapi.yaml)
 * CA-01.1 a CA-01.4, CA-06.1
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createLink, listLinks } from '../api.js';

const API_LINK = {
  short_code: 'abc1234',
  short_url: 'http://localhost:3000/r/abc1234',
  original_url: 'https://example.com',
  clicks: 3,
  created_at: '2026-10-15T10:00:00+00:00',
  expires_at: null,
};

const LINK = {
  shortCode: 'abc1234',
  shortUrl: 'http://localhost:3000/r/abc1234',
  originalUrl: 'https://example.com',
  createdAt: '2026-10-15T10:00:00+00:00',
  clicks: 3,
};

function stubFetch(status, body) {
  const fetchMock = vi.fn().mockResolvedValue({ status, json: async () => body });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('CA-01.3 — createLink em 201', () => {
  it('envia original_url para /api/links (mesma origem)', async () => {
    const fetchMock = stubFetch(201, API_LINK);
    await createLink('https://example.com');
    expect(fetchMock).toHaveBeenCalledWith('/api/links', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ original_url: 'https://example.com' }),
    }));
  });

  it('converte a resposta para o formato dos componentes', async () => {
    stubFetch(201, API_LINK);
    await expect(createLink('https://example.com')).resolves.toEqual(LINK);
  });
});

describe('CA-06.1 — createLink em 400', () => {
  it('URL inválida vira mensagem amigável com type validation', async () => {
    stubFetch(400, { error: 'invalid_url', message: 'original_url deve ser uma URL http(s) absoluta' });
    await expect(createLink('ftp://x')).rejects.toMatchObject({
      message: expect.stringMatching(/http:\/\/ ou https:\/\//),
      type: 'validation',
    });
  });

  it('outros erros de validação usam a mensagem da API', async () => {
    stubFetch(400, { error: 'invalid_request', message: 'parâmetro inválido: original_url' });
    await expect(createLink('')).rejects.toThrow('parâmetro inválido: original_url');
  });
});

describe('createLink — falhas', () => {
  it('503 vira erro genérico de comunicação', async () => {
    stubFetch(503, { error: 'database_unavailable', message: 'banco de dados indisponível' });
    await expect(createLink('https://x.com')).rejects.toThrow('Falha na comunicação com o servidor');
  });

  it('erro de rede é propagado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(createLink('https://x.com')).rejects.toThrow();
  });
});

describe('tracing do navegador (D-14)', () => {
  it('propaga traceparent W3C e exporta o span para /otlp', async () => {
    const fetchMock = stubFetch(200, { total: 0, items: [] });
    await listLinks();
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);

    const [url, exported] = fetchMock.mock.calls[1];
    expect(url).toBe('/otlp/v1/traces');
    const span = JSON.parse(exported.body).resourceSpans[0];
    expect(span.resource.attributes[0].value.stringValue).toBe('kiro-browser');
    expect(span.scopeSpans[0].spans[0].traceId).toBe(options.headers.traceparent.split('-')[1]);
  });
});

describe('CA-01.4 — listLinks', () => {
  it('em 200 devolve os items convertidos', async () => {
    const fetchMock = stubFetch(200, { total: 1, items: [API_LINK] });
    await expect(listLinks()).resolves.toEqual([LINK]);
    expect(fetchMock).toHaveBeenCalledWith('/api/links', expect.anything());
  });

  it('fora de 200 lança erro', async () => {
    stubFetch(503, { error: 'database_unavailable' });
    await expect(listLinks()).rejects.toThrow('Falha na comunicação com o servidor');
  });
});
