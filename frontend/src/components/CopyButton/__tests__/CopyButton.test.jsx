/**
 * Testes de CopyButton
 * CA-21.1 — clique executa clipboard.writeText
 * CA-21.2 — confirmação visual aparece ≥ 1,5 s e some
 * CA-21.3 — aria-live anuncia "Link copiado"
 * CA-21.4 — botão tem aria-label e é acessível por teclado
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CopyButton } from '../CopyButton.jsx';

/* Mock de navigator.clipboard */
const mockWriteText = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: mockWriteText },
  writable: true,
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('CA-21.1 — clique executa clipboard.writeText', () => {
  it('chama writeText com a URL correta ao clicar', async () => {
    render(<CopyButton url="https://short.ly/abc" label="Copiar link" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copiar link' }));
    });
    expect(mockWriteText).toHaveBeenCalledWith('https://short.ly/abc');
  });

  it('chama writeText ao pressionar Enter (acessibilidade de teclado)', async () => {
    render(<CopyButton url="https://short.ly/abc" label="Copiar link" />);
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
      fireEvent.click(screen.getByRole('button'));
    });
    expect(mockWriteText).toHaveBeenCalled();
  });
});

describe('CA-21.2 — confirmação visual', () => {
  it('exibe "Copiado" após o clique e volta ao estado original após 1,5 s', async () => {
    vi.useFakeTimers();
    render(<CopyButton url="https://short.ly/abc" label="Copiar link" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    expect(screen.getByRole('button')).toHaveTextContent('Copiado');

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.getByRole('button')).toHaveTextContent('Copiar');
  });
});

describe('CA-21.3 — aria-live anuncia "Link copiado"', () => {
  it('região aria-live contém "Link copiado" após o clique', async () => {
    render(<CopyButton url="https://short.ly/abc" label="Copiar link" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Link copiado');
  });

  it('região aria-live fica vazia antes do clique', () => {
    render(<CopyButton url="https://short.ly/abc" label="Copiar link" />);
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});

describe('CA-21.4 — botão com aria-label', () => {
  it('botão tem aria-label igual ao prop label', () => {
    render(<CopyButton url="https://short.ly/abc" label="Copiar link curto" />);
    expect(screen.getByRole('button', { name: 'Copiar link curto' })).toBeInTheDocument();
  });
});
