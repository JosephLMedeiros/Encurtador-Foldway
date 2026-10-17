/**
 * Testes de mock.js
 * CA-03.3, CA-04.1, CA-05.1, CA-06.2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* Redefine o módulo antes de cada teste para reiniciar o estado em memória */
async function freshMock(env = {}) {
  /* Configura as variáveis de ambiente do Vite antes de importar o módulo */
  vi.stubEnv('VITE_MOCK_DELAY_MS', env.VITE_MOCK_DELAY_MS ?? '');
  vi.stubEnv('VITE_MOCK_ERROR', env.VITE_MOCK_ERROR ?? 'false');

  /* Reinicia o módulo para recomeçar com INITIAL_LINKS */
  vi.resetModules();
  return import('../mock.js');
}

beforeEach(() => {
  /* jsdom define window.location.origin como 'http://localhost' por padrão */
  vi.stubGlobal('window', { location: { origin: 'http://localhost' } });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('listLinks', () => {
  it('CA-03.3 — retorna pelo menos dois links pré-cadastrados na inicialização', async () => {
    const { listLinks } = await freshMock();
    const result = await listLinks();
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('retorna cópia — mutação externa não afeta o estado interno', async () => {
    const { listLinks } = await freshMock();
    const r1 = await listLinks();
    r1.push({ shortCode: 'hack' });
    const r2 = await listLinks();
    expect(r2.every((l) => l.shortCode !== 'hack')).toBe(true);
  });
});

describe('createLink — CA-06.2 — validação de URL', () => {
  it('rejeita URL sem http:// ou https://', async () => {
    const { createLink } = await freshMock();
    await expect(createLink('ftp://example.com')).rejects.toThrow('URL inválida');
  });

  it('rejeita URL sem esquema', async () => {
    const { createLink } = await freshMock();
    await expect(createLink('example.com')).rejects.toThrow('URL inválida');
  });

  it('aceita URL com http://', async () => {
    const { createLink } = await freshMock();
    const result = await createLink('http://example.com');
    expect(result.shortCode).toBeTruthy();
  });

  it('aceita URL com https://', async () => {
    const { createLink } = await freshMock();
    const result = await createLink('https://example.com');
    expect(result.shortCode).toBeTruthy();
  });
});

describe('createLink — retorno', () => {
  it('retorna objeto com shortCode, shortUrl, originalUrl, createdAt e clicks: 0', async () => {
    const { createLink } = await freshMock();
    const result = await createLink('https://example.com');
    expect(result).toMatchObject({
      shortCode: expect.any(String),
      shortUrl: expect.stringContaining('http://localhost/'),
      originalUrl: 'https://example.com',
      createdAt: expect.any(String),
      clicks: 0,
    });
  });

  it('adiciona o item criado à lista em memória', async () => {
    const { createLink, listLinks } = await freshMock();
    await createLink('https://example.com');
    const list = await listLinks();
    const added = list.find((l) => l.originalUrl === 'https://example.com');
    expect(added).toBeDefined();
    expect(added.clicks).toBe(0);
  });
});

describe('CA-05.1 — VITE_MOCK_ERROR', () => {
  it('createLink rejeita quando VITE_MOCK_ERROR=true', async () => {
    const { createLink } = await freshMock({ VITE_MOCK_ERROR: 'true' });
    await expect(createLink('https://example.com')).rejects.toThrow();
  });

  it('listLinks rejeita quando VITE_MOCK_ERROR=true', async () => {
    const { listLinks } = await freshMock({ VITE_MOCK_ERROR: 'true' });
    await expect(listLinks()).rejects.toThrow();
  });
});

describe('CA-04.1 — VITE_MOCK_DELAY_MS', () => {
  it('aguarda o delay configurado antes de responder', async () => {
    vi.useFakeTimers();
    const { createLink } = await freshMock({ VITE_MOCK_DELAY_MS: '1000' });

    let resolved = false;
    const promise = createLink('https://example.com').then(() => {
      resolved = true;
    });

    /* Antes de avançar o timer, não deve ter resolvido */
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    await promise;
    expect(resolved).toBe(true);

    vi.useRealTimers();
  });
});
