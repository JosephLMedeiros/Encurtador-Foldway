import { Link } from 'react-router-dom';
import './NotFound.css';
import { Mascot } from '../components/Mascot/Mascot.jsx';

/**
 * Tela de link não encontrado (RF-22).
 * Exibida em /r/:code quando a API responde 404 (não existe) ou 410 (expirou);
 * o nginx entrega o app nesses casos (D-12).
 */
export default function NotFoundLinkPage() {
  return (
    <main className="not-found-page">
      <Mascot pose="error" />
      <h1>Link não encontrado</h1>
      <p>Esse origami não encontrou destino: o link expirou ou nunca existiu.</p>
      <Link to="/">Voltar à página inicial e criar um link</Link>
    </main>
  );
}
