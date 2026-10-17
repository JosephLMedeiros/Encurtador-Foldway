import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import NotFoundLinkPage from './pages/NotFoundLinkPage';
import NotFoundPage from './pages/NotFoundPage';

/* Declaração de rotas conforme design.md §Architecture */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/link-inexistente" element={<NotFoundLinkPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
