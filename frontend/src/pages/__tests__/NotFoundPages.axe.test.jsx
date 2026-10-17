/**
 * Verificações de acessibilidade automatizadas — NotFoundLinkPage e NotFoundPage
 * CA-30.1, CA-30.2 — rótulos e estrutura (vitest-axe)
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { axe } from 'vitest-axe';
import NotFoundLinkPage from '../NotFoundLinkPage.jsx';
import NotFoundPage from '../NotFoundPage.jsx';

describe('CA-30.1 / CA-30.2 — NotFoundLinkPage sem violações axe', () => {
  it('não tem violações de acessibilidade', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/link-inexistente']}>
        <Routes>
          <Route path="/link-inexistente" element={<NotFoundLinkPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('CA-30.1 / CA-30.2 — NotFoundPage sem violações axe', () => {
  it('não tem violações de acessibilidade', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/xyz']}>
        <Routes>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
