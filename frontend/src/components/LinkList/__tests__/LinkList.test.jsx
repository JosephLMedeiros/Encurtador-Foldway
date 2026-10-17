/**
 * Testes de LinkList — precedência de exibição e CAs
 * CA-15.1, CA-15.2 — indicador de carregamento acessível
 * CA-16.1, CA-16.2 — falha + botão "Tentar novamente"
 * CA-17.2           — mensagem de lista vazia
 * Precedência dos cinco ramos
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LinkList } from '../LinkList.jsx';

/* Mock de clipboard para CopyButton dentro de LinkItem */
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
});

const LINKS = [
  {
    shortCode: 'abc',
    shortUrl: 'http://localhost/abc',
    originalUrl: 'https://example.com',
    createdAt: '2026-10-15T10:00:00Z',
    clicks: 5,
  },
];

describe('CA-15.1 / CA-15.2 — indicador de carregamento (ramo 1)', () => {
  it('exibe indicador acessível quando listLoading=true e links vazio', () => {
    render(
      <LinkList listLoading={true} listError={null} links={[]} onRetry={() => {}} />,
    );
    const indicator = screen.getByLabelText(/Carregando links/i);
    expect(indicator).toBeInTheDocument();
  });
});

describe('Precedência ramo 2 — listLoading=true com itens existentes', () => {
  it('exibe os itens existentes sem indicador sobreposto', () => {
    render(
      <LinkList listLoading={true} listError={null} links={LINKS} onRetry={() => {}} />,
    );
    expect(screen.getByText(LINKS[0].shortUrl)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Carregando links/i)).not.toBeInTheDocument();
  });
});

describe('CA-16.1 / CA-16.2 — falha ao carregar (ramo 3)', () => {
  it('exibe mensagem de erro quando !listLoading && listError', () => {
    render(
      <LinkList
        listLoading={false}
        listError="Falha ao carregar"
        links={[]}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByText('Falha ao carregar')).toBeInTheDocument();
  });

  it('exibe botão "Tentar novamente" e chama onRetry ao clicar', () => {
    const onRetry = vi.fn();
    render(
      <LinkList
        listLoading={false}
        listError="Falha"
        links={[]}
        onRetry={onRetry}
      />,
    );
    const btn = screen.getByRole('button', { name: /Tentar novamente/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('não exibe erro se listLoading=true (botão aparece só após o carregamento)', () => {
    render(
      <LinkList
        listLoading={true}
        listError="Falha"
        links={[]}
        onRetry={() => {}}
      />,
    );
    /* Ramo 1 prevalece: indicador de carregamento, não erro */
    expect(screen.queryByText('Falha')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Carregando links/i)).toBeInTheDocument();
  });
});

describe('CA-17.2 — mensagem de lista vazia (ramo 4)', () => {
  it('exibe mensagem orientando criar link quando lista vazia e sem erro', () => {
    render(
      <LinkList
        listLoading={false}
        listError={null}
        links={[]}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByText(/Nenhum link criado/i)).toBeInTheDocument();
  });
});

describe('Precedência ramo 5 — lista com itens', () => {
  it('exibe os itens da lista quando tudo ok', () => {
    render(
      <LinkList listLoading={false} listError={null} links={LINKS} onRetry={() => {}} />,
    );
    expect(screen.getByRole('list', { name: /Links criados/i })).toBeInTheDocument();
    expect(screen.getByText(LINKS[0].shortUrl)).toBeInTheDocument();
  });
});
