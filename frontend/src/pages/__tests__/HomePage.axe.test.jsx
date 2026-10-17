/**
 * Verificações de acessibilidade automatizadas — HomePage
 * CA-30.1, CA-30.2 — rótulos, aria-live, aria-describedby, htmlFor (vitest-axe)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'vitest-axe';

vi.mock('../../api/api.js', () => ({
  createLink: vi.fn(),
  listLinks:  vi.fn(),
}));

Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
});

import { listLinks } from '../../api/api.js';
import HomePage from '../HomePage.jsx';

beforeEach(() => vi.clearAllMocks());

describe('CA-30.1 / CA-30.2 — HomePage sem violações axe', () => {
  it('estado inicial (lista vazia) não tem violações', async () => {
    listLinks.mockResolvedValue([]);
    const { container } = render(
      <MemoryRouter><HomePage /></MemoryRouter>,
    );
    /* Aguarda o carregamento inicial terminar */
    await waitFor(() =>
      expect(listLinks).toHaveBeenCalled(),
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('estado com lista carregada não tem violações', async () => {
    listLinks.mockResolvedValue([{
      shortCode: 'abc', shortUrl: 'http://localhost/abc',
      originalUrl: 'https://example.com', createdAt: '2026-01-01T00:00:00Z', clicks: 0,
    }]);
    const { container } = render(
      <MemoryRouter><HomePage /></MemoryRouter>,
    );
    await waitFor(() => expect(listLinks).toHaveBeenCalled());
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
