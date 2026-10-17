import { useMemo, useRef } from 'react';
import { buildQr, downloadPng, qrTarget, QUIET_ZONE } from '../../lib/qr.js';
import { ORIGAMI_SVG } from '../../lib/origami.js';
import './QrCode.css';

/**
 * QR Code do link curto: papel branco, módulos em índigo e o origami no centro.
 * Ao ser lido, abre o link curto com ?via=qr (acesso medido pela API).
 *
 * @param {{ shortUrl: string }} props
 */
export function QrCode({ shortUrl }) {
  const svgRef = useRef(null);
  const { size, path, hole } = useMemo(() => buildQr(qrTarget(shortUrl)), [shortUrl]);
  const box = size + QUIET_ZONE * 2;
  const code = shortUrl.split('/').pop();

  return (
    <figure className="qr">
      <svg
        ref={svgRef}
        className="qr__code"
        viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${box} ${box}`}
        shapeRendering="crispEdges"
        role="img"
        aria-label={`QR Code que abre ${shortUrl}`}
      >
        <rect className="qr__paper" x={-QUIET_ZONE} y={-QUIET_ZONE} width={box} height={box} />
        <path className="qr__modules" d={path} />
        <svg
          x={hole.start}
          y={hole.start}
          width={hole.size}
          height={hole.size}
          viewBox="0 0 64 64"
          shapeRendering="geometricPrecision"
          dangerouslySetInnerHTML={{ __html: ORIGAMI_SVG }}
        />
      </svg>

      <figcaption className="qr__caption">
        <span className="qr__hint">Aponte a câmera</span>
        <button
          type="button"
          className="btn-outline"
          onClick={() => downloadPng(svgRef.current, `foldway-${code}.png`)}
          aria-label={`Baixar QR Code de ${shortUrl} em PNG`}
        >
          Baixar PNG
        </button>
      </figcaption>
    </figure>
  );
}
