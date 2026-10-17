import { useState } from 'react';
import { CopyButton } from '../CopyButton/CopyButton.jsx';
import { QrCode } from '../QrCode/QrCode.jsx';

/**
 * Item individual da lista de links.
 * Renderiza URL original (truncada), link curto copiável, QR Code sob demanda,
 * data e cliques (RF-18).
 *
 * @param {{ link: { shortCode, shortUrl, originalUrl, createdAt, clicks } }} props
 */
export function LinkItem({ link }) {
  const { shortCode, shortUrl, originalUrl, createdAt, clicks } = link;
  const [showQr, setShowQr] = useState(false);
  const qrId = `qr-${shortCode}`;

  /* Formata a data de criação para pt-BR */
  const formattedDate = new Date(createdAt).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <li className="link-item">
      {/* URL original — truncada com CSS e title completo para acessibilidade */}
      <span className="link-item__original" title={originalUrl}>
        <svg className="link-item__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M2 14l1-4 7-7 3 3-7 7-4 1zm9-12l1.5-1.5 3 3L14 5l-3-3z" fill="currentColor" />
        </svg>
        {originalUrl}
      </span>

      {/* Link curto com botões de copiar e de QR Code (CA-21.5) */}
      <span className="link-item__short">
        <span className="link-item__short-url">{shortUrl}</span>
        <CopyButton url={shortUrl} label={`Copiar link curto ${shortUrl}`} />
        <button
          type="button"
          className="btn-outline"
          aria-expanded={showQr}
          aria-controls={qrId}
          aria-label={`QR Code do link ${shortUrl}`}
          onClick={() => setShowQr((v) => !v)}
        >
          QR Code
        </button>
      </span>

      {/* Metadados */}
      <span className="link-item__meta">
        <span className="link-item__date">{formattedDate}</span>
        <span className="link-item__clicks">{clicks} {clicks === 1 ? 'clique' : 'cliques'}</span>
      </span>

      <div id={qrId} hidden={!showQr}>
        {showQr && <QrCode shortUrl={shortUrl} />}
      </div>
    </li>
  );
}
