import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { QrCode } from '../QrCode.jsx';

const URL = 'http://localhost:3000/r/abc1234';

describe('QrCode', () => {
  it('desenha o QR como imagem acessível com o destino no rótulo', () => {
    render(<QrCode shortUrl={URL} />);
    const img = screen.getByRole('img', { name: `QR Code que abre ${URL}` });
    expect(img.querySelector('.qr__modules').getAttribute('d')).toMatch(/^M\d+ \d+h1v1h-1z/);
  });

  it('oferece o download em PNG', () => {
    render(<QrCode shortUrl={URL} />);
    expect(screen.getByRole('button', { name: /Baixar QR Code .* em PNG/ })).toBeInTheDocument();
  });

  it('não tem violações de acessibilidade', async () => {
    const { container } = render(<QrCode shortUrl={URL} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
