/**
 * Testes de LinkItem
 * CA-18.1 — renderiza os quatro campos
 * CA-21.5 — CopyButton presente
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LinkItem } from '../LinkItem.jsx';

/* Mock de clipboard para que CopyButton não quebre */
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
});

const LINK = {
  shortCode: 'abc123',
  shortUrl: 'http://localhost/abc123',
  originalUrl: 'https://example.com/uma-url-muito-longa',
  createdAt: '2026-10-15T10:00:00Z',
  clicks: 42,
};

describe('CA-18.1 — renderiza os quatro campos', () => {
  it('exibe URL original', () => {
    render(<LinkItem link={LINK} />);
    expect(screen.getByTitle(LINK.originalUrl)).toBeInTheDocument();
  });

  it('exibe link curto', () => {
    render(<LinkItem link={LINK} />);
    expect(screen.getByText(LINK.shortUrl)).toBeInTheDocument();
  });

  it('exibe data de criação formatada', () => {
    render(<LinkItem link={LINK} />);
    /* 2026-10-15 formatado para pt-BR → "15/10/2026" */
    expect(screen.getByText('15/10/2026')).toBeInTheDocument();
  });

  it('exibe total de cliques', () => {
    render(<LinkItem link={LINK} />);
    expect(screen.getByText(/42 cliques/i)).toBeInTheDocument();
  });
});

describe('CA-21.5 — CopyButton presente no item', () => {
  it('renderiza um botão de copiar para o link curto', () => {
    render(<LinkItem link={LINK} />);
    expect(
      screen.getByRole('button', { name: /Copiar link curto/i }),
    ).toBeInTheDocument();
  });
});

describe('QR Code no item', () => {
  it('o botão QR Code mostra e esconde o QR do link', () => {
    render(<LinkItem link={LINK} />);
    const toggle = screen.getByRole('button', { name: /QR Code do link/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('img', { name: /QR Code que abre/ })).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('img', { name: `QR Code que abre ${LINK.shortUrl}` })).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.queryByRole('img', { name: /QR Code que abre/ })).not.toBeInTheDocument();
  });
});
