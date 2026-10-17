/**
 * Testes do QR Code: destino com ?via=qr e leitura real por um decodificador,
 * mesmo com o origami ocupando o centro.
 */
import { describe, it, expect } from 'vitest';
import jsQR from 'jsqr';
import { buildQr, qrTarget, QUIET_ZONE } from '../qr.js';

/* Rasteriza os módulos (6 px cada) como faria uma câmera vendo o QR impresso */
function decode({ size, path }) {
  const dark = new Set([...path.matchAll(/M(\d+) (\d+)/g)].map((m) => `${m[2]},${m[1]}`));
  const px = 6;
  const width = (size + QUIET_ZONE * 2) * px;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const row = Math.floor(y / px) - QUIET_ZONE;
      const col = Math.floor(x / px) - QUIET_ZONE;
      if (dark.has(`${row},${col}`)) data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
    }
  }
  return jsQR(data, width, width)?.data;
}

describe('qrTarget', () => {
  it('marca o acesso como vindo do QR', () => {
    expect(qrTarget('http://localhost:3000/r/abc1234')).toBe('http://localhost:3000/r/abc1234?via=qr');
  });
});

describe('buildQr', () => {
  it('deixa um espaço central ímpar e centralizado para o origami', () => {
    const { size, hole } = buildQr(qrTarget('http://localhost:3000/r/abc1234'));
    expect(hole.size % 2).toBe(1);
    expect(hole.start * 2 + hole.size).toBe(size);
  });

  it.each([
    'http://localhost:3000/r/abc1234',
    'https://encurtador.exemplo.com.br/r/meu-link-personalizado',
    `https://um-dominio-bem-comprido.cluster.example.org/r/${'x'.repeat(50)}`,
  ])('continua legível com o origami no centro: %s', (url) => {
    const text = qrTarget(url);
    expect(decode(buildQr(text))).toBe(text);
  });
});
