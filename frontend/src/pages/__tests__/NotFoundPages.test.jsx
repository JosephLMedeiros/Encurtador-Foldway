/**
 * Testes de NotFoundLinkPage e NotFoundPage
 * CA-22.1 — rota /r/:code renderiza NotFoundLinkPage
 * CA-22.3 — link retorna o usuário a /
 * CA-22.4 — mascote aparece na pose error
 * CA-23.1 — rota curinga renderiza NotFoundPage
 * CA-23.2 — página contém link para /
 * CA-23.3 — mascote aparece na pose error
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { mascotConfig } from '../../config/mascot.js';
import NotFoundLinkPage from '../NotFoundLinkPage.jsx';
import NotFoundPage from '../NotFoundPage.jsx';

/* alt da pose error vindo do arquivo de configuração */
const errorAlt = mascotConfig.poses['error'].alt;

/* Monta as rotas como o App.jsx faz, mas com MemoryRouter para isolar */
function renderWithRouter(initialPath) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/r/:code" element={<NotFoundLinkPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/* ── NotFoundLinkPage ────────────────────────────────────────────────────── */
describe('NotFoundLinkPage', () => {
  it('CA-22.1 — rota /r/:code renderiza o componente', () => {
    renderWithRouter('/r/abc1234');
    expect(screen.getByText(/Link não encontrado/i)).toBeInTheDocument();
  });

  it('CA-22.3 — contém link que leva a /', () => {
    renderWithRouter('/r/abc1234');
    const link = screen.getByRole('link', { name: /Voltar/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/');
  });

  it('CA-22.4 — mascote aparece na pose error', () => {
    renderWithRouter('/r/abc1234');
    expect(screen.getByRole('img', { name: errorAlt })).toBeInTheDocument();
  });
});

/* ── NotFoundPage ────────────────────────────────────────────────────────── */
describe('NotFoundPage', () => {
  it('CA-23.1 — rota desconhecida renderiza NotFoundPage', () => {
    renderWithRouter('/qualquer-coisa-inexistente');
    expect(screen.getByText(/Página não encontrada/i)).toBeInTheDocument();
  });

  it('CA-23.2 — contém link para /', () => {
    renderWithRouter('/qualquer-coisa-inexistente');
    const link = screen.getByRole('link', { name: /Voltar/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/');
  });

  it('CA-23.3 — mascote aparece na pose error', () => {
    renderWithRouter('/qualquer-coisa-inexistente');
    expect(screen.getByRole('img', { name: errorAlt })).toBeInTheDocument();
  });
});
