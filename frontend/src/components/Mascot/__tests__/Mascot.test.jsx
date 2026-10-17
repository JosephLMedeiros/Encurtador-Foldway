/**
 * Testes do componente Mascot
 * CA-24.1 — renderiza as cinco poses sem erros
 * N-03    — fallback para 'welcome' quando a pose é inválida
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Mascot } from '../Mascot.jsx';
import { mascotConfig } from '../../../config/mascot.js';

describe('Mascot — CA-24.1 — renderiza as cinco poses', () => {
  const poses = ['welcome', 'loading', 'success', 'error', 'empty'];

  poses.forEach((pose) => {
    it(`pose "${pose}" renderiza sem erros e com alt correto`, () => {
      const { alt } = mascotConfig.poses[pose];
      render(<Mascot pose={pose} />);
      const img = screen.getByRole('img', { name: alt });
      expect(img).toBeInTheDocument();
      expect(img.className).toContain(`mascot--${pose}`);
    });
  });
});

describe('Mascot — N-03 — fallback para pose inválida', () => {
  it('pose desconhecida renderiza a imagem de "welcome"', () => {
    const { alt } = mascotConfig.poses['welcome'];
    render(<Mascot pose="pose-inexistente" />);
    const img = screen.getByRole('img', { name: alt });
    expect(img).toBeInTheDocument();
    expect(img.src).toContain('welcome');
  });
});
