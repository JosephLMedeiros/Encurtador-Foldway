/**
 * Testes de LinkForm
 * CA-07.2, CA-07.3  — estrutura do formulário e label
 * CA-09.1 a CA-09.3 — validação local campo vazio
 * CA-10.1, CA-10.2  — estado loading
 * CA-11.1 a CA-11.4 — sucesso
 * CA-12.1 a CA-12.3 — erro 400
 * CA-13.1 a CA-13.3 — erro de rede
 * CA-06.3            — exibe error.message do createLink
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LinkForm } from '../LinkForm.jsx';

/* Mock de clipboard */
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
});

/* Props padrão para estado idle */
const defaultProps = {
  urlInput: '',
  onChange: vi.fn(),
  onSubmit: vi.fn(),
  submitStatus: 'idle',
  submitError: null,
  lastShortUrl: null,
};

function renderForm(overrides = {}) {
  return render(<LinkForm {...defaultProps} {...overrides} />);
}

/* ── CA-07.2 / CA-07.3 — estrutura do formulário ─────────────────────── */
describe('CA-07.2 / CA-07.3 — estrutura', () => {
  it('renderiza campo de URL e botão de submissão', () => {
    renderForm();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Encurtar/i })).toBeInTheDocument();
  });

  it('label está associado ao campo via htmlFor', () => {
    renderForm();
    const input = screen.getByLabelText(/URL original/i);
    expect(input).toBeInTheDocument();
  });
});

/* ── CA-09.1 a CA-09.3 — validação local campo vazio ─────────────────── */
describe('CA-09.1 a CA-09.3 — validação local', () => {
  it('CA-09.1 — exibe "Informe uma URL" sem chamar onSubmit', () => {
    const onSubmit = vi.fn();
    renderForm({ urlInput: '', onSubmit });
    fireEvent.submit(screen.getByRole('button', { name: /Encurtar/i }).closest('form'));
    expect(screen.getByText(/Informe uma URL/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('CA-09.2 — onSubmit não é chamado com campo vazio', () => {
    const onSubmit = vi.fn();
    renderForm({ urlInput: '   ', onSubmit });
    fireEvent.submit(screen.getByRole('button', { name: /Encurtar/i }).closest('form'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('CA-09.3 — mensagem local aparece sem alterar submitStatus (permanece idle)', () => {
    renderForm({ urlInput: '', submitStatus: 'idle' });
    fireEvent.submit(screen.getByRole('button', { name: /Encurtar/i }).closest('form'));
    /* Botão ainda habilitado — pose não mudou para loading */
    expect(screen.getByRole('button', { name: /Encurtar/i })).not.toBeDisabled();
  });
});

/* ── CA-10.1 / CA-10.2 — estado loading ─────────────────────────────── */
describe('CA-10.1 / CA-10.2 — loading', () => {
  it('CA-10.1 — botão desabilitado durante loading', () => {
    renderForm({ submitStatus: 'loading', urlInput: 'https://x.com' });
    expect(screen.getByRole('button', { name: /Encurtando/i })).toBeDisabled();
  });
});

/* ── CA-11.1 a CA-11.4 — sucesso ─────────────────────────────────────── */
describe('CA-11.1 a CA-11.4 — sucesso', () => {
  it('CA-11.1 — link curto gerado é exibido na tela', () => {
    renderForm({ submitStatus: 'success', lastShortUrl: 'http://localhost/abc' });
    expect(screen.getByText('http://localhost/abc')).toBeInTheDocument();
  });

  it('CA-11.3 — link curto é acessível (CopyButton focável por teclado)', () => {
    renderForm({ submitStatus: 'success', lastShortUrl: 'http://localhost/abc' });
    expect(screen.getByRole('button', { name: /Copiar link curto/i })).toBeInTheDocument();
  });

  it('CA-11.4 — após sucesso, campo de URL está vazio (controlado por prop)', () => {
    /* O campo esvaziado vem via urlInput='' — simulamos aqui */
    renderForm({ submitStatus: 'success', urlInput: '', lastShortUrl: 'http://localhost/abc' });
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('CA-21.5 — CopyButton presente no resultado', () => {
    renderForm({ lastShortUrl: 'http://localhost/abc' });
    expect(screen.getByRole('button', { name: /Copiar link curto/i })).toBeInTheDocument();
  });
});

/* ── CA-12.1 a CA-12.3 / CA-06.3 — erro 400 ─────────────────────────── */
describe('CA-12.1 a CA-12.3 / CA-06.3 — erro 400', () => {
  it('CA-06.3 / CA-12.1 — exibe error.message abaixo do campo com aria-describedby', () => {
    renderForm({ submitStatus: 'error', submitError: 'URL inválida' });
    const errorMsg = screen.getByRole('alert');
    expect(errorMsg).toHaveTextContent('URL inválida');
    /* Input aponta para o erro */
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-describedby');
  });

  it('CA-12.2 — valor do campo é preservado após erro', () => {
    renderForm({
      submitStatus: 'error',
      submitError: 'URL inválida',
      urlInput: 'http://invalida',
    });
    expect(screen.getByRole('textbox')).toHaveValue('http://invalida');
  });
});

/* ── CA-13.1 a CA-13.3 — erro de rede ───────────────────────────────── */
describe('CA-13.1 a CA-13.3 — erro de rede', () => {
  it('CA-13.1 — exibe mensagem de erro de rede', () => {
    renderForm({
      submitStatus: 'error',
      submitError: 'Falha na comunicação com o servidor',
    });
    expect(screen.getByText(/Falha na comunicação/i)).toBeInTheDocument();
  });

  it('CA-13.2 — botão volta ao estado habilitado após o erro', () => {
    renderForm({ submitStatus: 'error', urlInput: 'https://x.com' });
    expect(screen.getByRole('button', { name: /Encurtar/i })).not.toBeDisabled();
  });
});

/* ── QR Code no resultado ─────────────────────────────────────────────── */
describe('QR Code do link criado', () => {
  it('aparece junto do link curto', () => {
    renderForm({ submitStatus: 'success', lastShortUrl: 'http://localhost/r/abc' });
    expect(screen.getByRole('img', { name: 'QR Code que abre http://localhost/r/abc' })).toBeInTheDocument();
  });
});
