/* Teste trivial para confirmar que o ambiente Vitest + jsdom está funcional */
import { describe, it, expect } from 'vitest';

describe('ambiente de testes', () => {
  it('executa aritmética básica', () => {
    expect(1 + 1).toBe(2);
  });

  it('tem acesso ao DOM via jsdom', () => {
    const el = document.createElement('div');
    el.textContent = 'ok';
    expect(el.textContent).toBe('ok');
  });
});
