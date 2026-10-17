/**
 * QR Code do link curto (feature exclusiva do Foldway).
 * O QR aponta para o link curto com ?via=qr: a API conta esses acessos na
 * métrica kiro_feature_used_total{feature="qrcode"} (docs/otel-metrics-spec.md).
 */
import qrcode from 'qrcode-generator';

/* Margem em módulos ao redor do código (a especificação pede 4) */
export const QUIET_ZONE = 4;

export function qrTarget(shortUrl) {
  return `${shortUrl}?via=qr`;
}

/**
 * Gera os módulos do QR com um espaço livre no centro para o origami.
 * Correção de erro H recupera até ~30% do código; o centro ocupa ~5%.
 * @returns {{ size: number, path: string, hole: { start: number, size: number } }}
 */
export function buildQr(text) {
  const qr = qrcode(0, 'H');
  qr.addData(text);
  qr.make();

  const size = qr.getModuleCount();
  const holeSize = Math.round(size * 0.22) | 1; // ímpar, para ficar centralizado
  const start = (size - holeSize) / 2;
  const inHole = (n) => n >= start && n < start + holeSize;

  let path = '';
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (qr.isDark(row, col) && !(inHole(row) && inHole(col))) {
        path += `M${col} ${row}h1v1h-1z`;
      }
    }
  }
  return { size, path, hole: { start, size: holeSize } };
}

/**
 * Baixa o QR renderizado como PNG. As cores vêm de variáveis CSS, que um
 * arquivo isolado não conhece, então são copiadas já resolvidas para o clone.
 */
export function downloadPng(svg, filename, pixels = 1024) {
  const clone = svg.cloneNode(true);
  const source = svg.querySelectorAll('*');
  clone.querySelectorAll('*').forEach((el, i) => {
    const style = getComputedStyle(source[i]);
    el.setAttribute('fill', style.fill);
    el.setAttribute('fill-opacity', style.fillOpacity);
  });
  clone.setAttribute('width', pixels);
  clone.setAttribute('height', pixels);

  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = pixels;
    canvas.height = pixels;
    canvas.getContext('2d').drawImage(img, 0, 0, pixels, pixels);
    URL.revokeObjectURL(url);
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };
  img.src = url;
}
