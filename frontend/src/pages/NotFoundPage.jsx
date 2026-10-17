import { Link } from 'react-router-dom';
import './NotFound.css';
import { Mascot } from '../components/Mascot/Mascot.jsx';

/**
 * Página 404 do site — rota não mapeada (RF-23).
 * Renderizada pelo React Router para qualquer caminho desconhecido.
 */
export default function NotFoundPage() {
  return (
    <main className="not-found-page">
      <Mascot pose="error" />
      <h1>Página não encontrada</h1>
      <p>Nem uma dobra leva até aqui: essa página não existe.</p>
      <Link to="/">Voltar à página inicial</Link>
    </main>
  );
}
