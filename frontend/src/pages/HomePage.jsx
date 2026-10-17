import { useState, useEffect, useCallback } from 'react';
import { createLink, listLinks } from '../api/api.js';
import { resolvePose } from '../lib/mascotPose.js';
import { Mascot } from '../components/Mascot/Mascot.jsx';
import { LinkForm } from '../components/LinkForm/LinkForm.jsx';
import { LinkList } from '../components/LinkList/LinkList.jsx';
import './HomePage.css';

/**
 * Página inicial — formulário de criação e lista de links na mesma tela (RF-07).
 * Todo o estado da aplicação fica aqui; filhos recebem dados e callbacks por props.
 * design.md §Architecture — Fluxo de estado em HomePage
 */
export default function HomePage() {
  /* ── Estado do formulário ───────────────────────────────────────────────── */
  const [urlInput, setUrlInput]       = useState('');
  const [submitStatus, setSubmitStatus] = useState('idle');
  const [submitError, setSubmitError] = useState(null);
  const [lastShortUrl, setLastShortUrl] = useState(null);
  /* A animação de dobra ainda está tocando (o Furl continua na pose "loading") */
  const [folding, setFolding] = useState(false);

  /* ── Estado da lista ────────────────────────────────────────────────────── */
  /* listLoading começa true para evitar flash de 'empty' antes do primeiro GET */
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError]     = useState(null);
  const [links, setLinks]             = useState([]);

  /* ── Pose calculada pela função pura (RF-31) ────────────────────────────── */
  /* Sucesso só vira pose "success" depois que a animação de dobra termina */
  const effectiveStatus = submitStatus === 'success' && folding ? 'loading' : submitStatus;
  const pose = resolvePose({ submitStatus: effectiveStatus, listLoading, listError, links });

  /* ── fetchList — não limpa listError antes de responder (design N-02) ───── */
  const fetchList = useCallback(async () => {
    setListLoading(true);
    /* listError permanece até GET 200 */
    try {
      const data = await listLinks();
      setLinks(data);
      setListError(null);
    } catch {
      setListError('Não foi possível carregar os links. Tente novamente.');
    } finally {
      setListLoading(false);
    }
  }, []);

  /* ── Carrega a lista na montagem (RF-14, CA-14.1) ───────────────────────── */
  useEffect(() => {
    fetchList(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [fetchList]);

  /* ── handleSubmit ───────────────────────────────────────────────────────── */
  async function handleSubmit(url) {
    /* Limpa resultado anterior antes de nova tentativa (nota N-01) */
    setLastShortUrl(null);
    setSubmitStatus('loading');
    setSubmitError(null);

    try {
      const result = await createLink(url);
      setSubmitStatus('success');
      setUrlInput('');
      setLastShortUrl(result.shortUrl);
      /* Recarrega a lista após sucesso (RF-19, CA-19.1) */
      fetchList();
    } catch (err) {
      setSubmitStatus('error');
      setSubmitError(err.message ?? 'Falha na comunicação com o servidor');
    }
  }

  /* ── handleRetry — SEM limpar listError (RF-31) ────────────────────────── */
  function handleRetry() {
    fetchList();
  }

  return (
    <main className="home-page">
      <header className="hero">
        <div className="hero__copy">
          <p className="hero__kicker">Ateliê de atalhos</p>
          <h1 className="hero__title">Foldway</h1>
          <p className="hero__tagline">Links longos demais? Deixa comigo.</p>
        </div>

        {/* Mascote — único na página, pose calculada por resolvePose (RF-31) */}
        <div className="hero__figure">
          <Mascot pose={pose} />
        </div>
      </header>

      <LinkForm
        urlInput={urlInput}
        onChange={(e) => setUrlInput(e.target.value)}
        onSubmit={handleSubmit}
        submitStatus={submitStatus}
        submitError={submitError}
        lastShortUrl={lastShortUrl}
        onFoldingChange={setFolding}
      />

      <section className="origamis" aria-labelledby="origamis-title">
        <h2 id="origamis-title" className="origamis__title">Seus links</h2>
        <LinkList
          listLoading={listLoading}
          listError={listError}
          links={links}
          onRetry={handleRetry}
        />
      </section>
    </main>
  );
}
