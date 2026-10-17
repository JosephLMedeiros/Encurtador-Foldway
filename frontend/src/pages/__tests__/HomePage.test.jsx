/**
 * Testes de integração de HomePage
 * CA-07.1  — formulário e lista na mesma tela
 * CA-08.1  — pose welcome no estado inicial (lista carregada, sem submit)
 * CA-08.2  — pose muda com o estado
 * CA-14.1  — listLinks chamado na montagem
 * CA-16.3  — pose error quando listLinks falha
 * CA-17.1  — pose empty quando lista vazia
 * CA-19.1  — listLinks chamado após createLink bem-sucedido
 * CA-31.1  — exatamente um Mascot no DOM
 * CA-31.4  — mensagem de lista vazia sem segundo mascote
 * CA-11.4  — campo esvaziado após sucesso
 * RF-31    — pose permanece error durante retry (listError não limpo)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { mascotConfig } from '../../config/mascot.js';

/* Mock de api.js — substitui todas as implementações por vi.fn() */
vi.mock('../../api/api.js', () => ({
  createLink: vi.fn(),
  listLinks:  vi.fn(),
}));

/* Mock de clipboard */
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
});

/* Importa após o mock para que HomePage use os mocks */
import { createLink, listLinks } from '../../api/api.js';
import HomePage from '../HomePage.jsx';

const LINK = {
  shortCode: 'abc123',
  shortUrl:  'http://localhost/abc123',
  originalUrl: 'https://example.com',
  createdAt: '2026-10-15T10:00:00Z',
  clicks: 0,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

/* alt das poses do mascote */
const altFor = (pose) => mascotConfig.poses[pose].alt;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

/* ── CA-14.1 — listLinks chamado na montagem ─────────────────────────────── */
describe('CA-14.1 — carregamento automático da lista', () => {
  it('chama listLinks na montagem sem interação do usuário', async () => {
    listLinks.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(listLinks).toHaveBeenCalledTimes(1));
  });
});

/* ── CA-07.1 — formulário e lista na mesma tela ─────────────────────────── */
describe('CA-07.1 — formulário e lista na mesma tela', () => {
  it('renderiza o campo de URL e a área da lista na mesma página', async () => {
    listLinks.mockResolvedValue([LINK]);
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/URL original/i)).toBeInTheDocument());
    expect(screen.getByRole('list', { name: /Links criados/i })).toBeInTheDocument();
  });
});

/* ── CA-31.1 — exatamente um Mascot no DOM ─────────────────────────────── */
describe('CA-31.1 — instância única do mascote', () => {
  it('renderiza exatamente um elemento mascote em qualquer estado', async () => {
    listLinks.mockResolvedValue([LINK]);
    renderPage();
    await waitFor(() =>
      expect(screen.queryByText(/Carregando/i)).not.toBeInTheDocument(),
    );
    const imgs = screen.getAllByRole('img');
    /* Todos os imgs devem ser o mesmo mascote (somente um alt de mascote) */
    const mascotImgs = imgs.filter((img) =>
      Object.values(mascotConfig.poses).some((p) => p.alt === img.alt),
    );
    expect(mascotImgs).toHaveLength(1);
  });
});

/* ── CA-17.1 — pose empty quando lista vazia ────────────────────────────── */
describe('CA-17.1 — pose empty com lista vazia', () => {
  it('mascote recebe pose empty após listLinks retornar []', async () => {
    listLinks.mockResolvedValue([]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('img', { name: altFor('empty') })).toBeInTheDocument(),
    );
  });
});

/* ── CA-31.4 — mensagem de lista vazia sem segundo mascote ──────────────── */
describe('CA-31.4 — mensagem de lista vazia sem segundo mascote', () => {
  it('exibe mensagem de lista vazia na área da lista, sem duplicar o mascote', async () => {
    listLinks.mockResolvedValue([]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Nenhum link criado/i)).toBeInTheDocument(),
    );
    const mascotImgs = screen
      .getAllByRole('img')
      .filter((img) =>
        Object.values(mascotConfig.poses).some((p) => p.alt === img.alt),
      );
    expect(mascotImgs).toHaveLength(1);
  });
});

/* ── CA-16.3 — pose error quando listLinks falha ───────────────────────── */
describe('CA-16.3 — pose error em falha da lista', () => {
  it('mascote recebe pose error quando listLinks rejeita', async () => {
    listLinks.mockRejectedValue(new Error('Falha de rede'));
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('img', { name: altFor('error') })).toBeInTheDocument(),
    );
  });
});

/* ── RF-31 — pose error permanece durante retry ─────────────────────────── */
describe('RF-31 — pose error durante retry', () => {
  it('a pose error permanece enquanto listLoading=true após retry (listError não limpo)', async () => {
    /* Primeira chamada falha */
    listLinks.mockRejectedValueOnce(new Error('Falha'));
    /* Segunda chamada (retry) demora — usamos uma Promise que não resolve */
    let resolveRetry;
    listLinks.mockImplementationOnce(
      () => new Promise((res) => { resolveRetry = res; }),
    );

    renderPage();

    /* Aguarda pose error após falha */
    await waitFor(() =>
      expect(screen.getByRole('img', { name: altFor('error') })).toBeInTheDocument(),
    );

    /* Clica em "Tentar novamente" */
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));

    /* listLoading=true mas listError ainda definido → pose continua error */
    expect(screen.getByRole('img', { name: altFor('error') })).toBeInTheDocument();

    /* Resolve o retry para limpar */
    act(() => resolveRetry([]));
  });
});

/* ── CA-19.1 — listLinks chamado após createLink bem-sucedido ───────────── */
describe('CA-19.1 — recarga da lista após criação', () => {
  it('listLinks é chamado novamente após createLink retornar sucesso', async () => {
    listLinks.mockResolvedValue([]);
    createLink.mockResolvedValue(LINK);

    renderPage();
    await waitFor(() => expect(listLinks).toHaveBeenCalledTimes(1));

    /* Preenche o campo e submete */
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'https://example.com' },
    });
    await act(async () => {
      fireEvent.submit(screen.getByRole('textbox').closest('form'));
    });

    await waitFor(() => expect(listLinks).toHaveBeenCalledTimes(2));
  });
});

/* ── CA-11.4 — campo esvaziado após sucesso ─────────────────────────────── */
describe('CA-11.4 — campo vazio após sucesso', () => {
  it('campo de URL fica vazio após createLink bem-sucedido', async () => {
    listLinks.mockResolvedValue([]);
    createLink.mockResolvedValue(LINK);

    renderPage();
    await waitFor(() => expect(listLinks).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'https://example.com' },
    });
    await act(async () => {
      fireEvent.submit(screen.getByRole('textbox').closest('form'));
    });

    await waitFor(() =>
      expect(screen.getByRole('textbox')).toHaveValue(''),
    );
  });
});

/* ── CA-08.1 — pose welcome no estado padrão ────────────────────────────── */
describe('CA-08.1 — pose welcome no estado padrão', () => {
  it('mascote recebe pose welcome quando lista tem itens e não há submit', async () => {
    listLinks.mockResolvedValue([LINK]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('img', { name: altFor('welcome') })).toBeInTheDocument(),
    );
  });
});

/* ── CA-08.2 — pose muda com o estado ──────────────────────────────────── */
describe('CA-08.2 — pose muda durante createLink', () => {
  it('pose passa para loading durante createLink e success após retorno', async () => {
    listLinks.mockResolvedValue([LINK]);

    let resolveCreate;
    createLink.mockImplementation(
      () => new Promise((res) => { resolveCreate = res; }),
    );

    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('img', { name: altFor('welcome') })).toBeInTheDocument(),
    );

    /* Submete */
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'https://example.com' },
    });
    act(() => {
      fireEvent.submit(screen.getByRole('textbox').closest('form'));
    });

    /* Durante loading */
    await waitFor(() =>
      expect(screen.getByRole('img', { name: altFor('loading') })).toBeInTheDocument(),
    );

    /* Resolve → success */
    await act(async () => resolveCreate(LINK));
    await waitFor(() =>
      expect(screen.getByRole('img', { name: altFor('success') })).toBeInTheDocument(),
      { timeout: 8000 }, /* a pose success espera a animação de dobra (~4 s) */
    );
  }, 15000);
});
