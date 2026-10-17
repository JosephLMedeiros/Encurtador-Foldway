import { useState, useEffect } from 'react';
import { CopyButton } from '../CopyButton/CopyButton.jsx';
import { FoldAnimation } from '../FoldAnimation/FoldAnimation.jsx';
import './LinkForm.css';

/**
 * Formulário de criação de link curto (RF-07, RF-09 a RF-13).
 * Todo o estado de submissão vive em HomePage; este componente é controlado.
 *
 * @param {{
 *   urlInput:     string,
 *   onChange:     (e: Event) => void,
 *   onSubmit:     (url: string) => void,
 *   submitStatus: 'idle'|'loading'|'success'|'error',
 *   submitError:  string|null,
 *   lastShortUrl: string|null,
 *   onFoldingChange?: (folding: boolean) => void
 * }} props
 */
export function LinkForm({
  urlInput,
  onChange,
  onSubmit,
  submitStatus,
  submitError,
  lastShortUrl,
  onFoldingChange,
}) {
  /* Erro de validação local — só campo vazio (RF-09, CA-09.1 a CA-09.3) */
  const [localError, setLocalError] = useState('');

  /* Animação de dobra: ativa do envio até o origami pousar (puramente decorativa) */
  const [folding, setFolding] = useState(false);

  /* Avisa a página quando a animação começa/termina (o Furl segue "dobrando" até o fim) */
  useEffect(() => {
    onFoldingChange?.(folding);
  }, [folding, onFoldingChange]);

  const isLoading = submitStatus === 'loading';
  const errorMsgId = 'link-form-error';

  function handleSubmit(e) {
    e.preventDefault();

    /* Validação local: só testa campo vazio; regra de URL válida é da API (RF-09) */
    if (!urlInput.trim()) {
      setLocalError('Informe uma URL');
      /* Não altera a pose — RF-09, CA-09.3 */
      return;
    }

    setLocalError('');
    setFolding(true);
    onSubmit(urlInput);
  }

  /* Mensagem de erro a exibir: erro de API tem precedência sobre validação local */
  const displayError = submitError || localError;

  return (
    <section className="link-form" aria-label="Criar link curto">
      <form onSubmit={handleSubmit} noValidate>
        <div className="link-form__field">
          {/* label associado via htmlFor (CA-07.3) */}
          <label htmlFor="url-input" className="link-form__label">
            URL original
          </label>
          <input
            id="url-input"
            type="url"
            value={urlInput}
            onChange={onChange}
            placeholder="https://exemplo.com/sua-url-longa"
            disabled={isLoading}
            className="link-form__input"
            aria-describedby={displayError ? errorMsgId : undefined}
          />
          {/* Mensagem de erro inline com aria-describedby (CA-12.1, CA-06.3) */}
          {displayError && (
            <span id={errorMsgId} role="alert" className="link-form__error">
              {displayError}
            </span>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="link-form__submit"
        >
          {isLoading ? 'Encurtando…' : 'Encurtar'}
        </button>
      </form>

      {/* O papel bruto vira origami enquanto a API responde; o resultado real
          (texto + aria-live abaixo) existe desde a resposta e não espera a animação. */}
      {folding && (
        <FoldAnimation
          url={urlInput}
          status={submitStatus}
          shortUrl={lastShortUrl}
          onDone={() => setFolding(false)}
        />
      )}

      {/* Resultado de sucesso — link curto com CopyButton (RF-11, CA-21.5) */}
      {lastShortUrl && (
        <div
          className={`link-form__result${folding ? ' link-form__result--pending' : ''}`}
          aria-live="polite"
        >
          <span className="link-form__short-url">{lastShortUrl}</span>
          <CopyButton
            url={lastShortUrl}
            label={`Copiar link curto ${lastShortUrl}`}
          />
        </div>
      )}
    </section>
  );
}
