import { useState, useEffect } from 'react';
import './CopyButton.css';

/**
 * Botão de copiar link curto para a área de transferência.
 * Cada instância gerencia sua própria região aria-live (design.md §CopyButton).
 *
 * @param {{ url: string, label: string }} props
 *   url   — URL a ser copiada
 *   label — texto para aria-label do botão (CA-21.4)
 */
export function CopyButton({ url, label }) {
  const [copied, setCopied] = useState(false);

  /* Limpa o timer ao desmontar ou quando copied muda (design.md N do CopyButton) */
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => setCopied(true));
  }

  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={handleCopy}
        className={`copy-button${copied ? ' copy-button--copied' : ''}`}
      >
        {copied ? 'Copiado' : 'Copiar'}
      </button>
      {/* Região aria-live própria — visualmente oculta com sr-only (CA-21.3) */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? 'Link copiado' : ''}
      </span>
    </>
  );
}
