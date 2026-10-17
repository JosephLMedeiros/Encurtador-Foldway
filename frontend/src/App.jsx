import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import NotFoundLinkPage from './pages/NotFoundLinkPage';
import NotFoundPage from './pages/NotFoundPage';

/* Declaração de rotas conforme design.md §Architecture.
   /r/:code só chega ao frontend quando a API responde 404 ou 410: o nginx
   intercepta o erro e entrega o app na mesma URL (D-12). */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/r/:code" element={<NotFoundLinkPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
