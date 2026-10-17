import { Link } from 'react-router-dom';
import './NotFound.css';
import { Mascot } from '../components/Mascot/Mascot.jsx';

/**
 * Tela de link não encontrado (RF-22).
 * Exibida quando o código curto não existe na API.
 * Rota interna provisória: /link-inexistente
 * O caminho definitivo depende de D-12 (pendente).
 */
export default function NotFoundLinkPage() {
  return (
    <main className="not-found-page">
      <Mascot pose="error" />
      <h1>Link não encontrado</h1>
      <p>Esse origami não encontrou destino. O papel foi rasgado ou nunca existiu.</p>
      <Link to="/">Voltar à página inicial e criar um link</Link>
    </main>
  );
}
