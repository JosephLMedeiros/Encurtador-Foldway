import { LinkItem } from './LinkItem.jsx';
import './LinkList.css';

/**
 * Lista de links com gerenciamento dos cinco estados de exibição.
 * Precedência de exibição (design.md §LinkList):
 *   1. listLoading && links.length === 0  → indicador de carregamento
 *   2. listLoading && links.length > 0    → itens existentes (sem indicador sobreposto)
 *   3. !listLoading && listError          → mensagem de falha + botão "Tentar novamente"
 *   4. !listLoading && !listError && links.length === 0 → mensagem de lista vazia
 *   5. caso padrão                        → lista de LinkItem
 *
 * @param {{
 *   listLoading: boolean,
 *   listError:   string|null,
 *   links:       Array,
 *   onRetry:     () => void
 * }} props
 */
export function LinkList({ listLoading, listError, links, onRetry }) {
  /* Caso 1: carregando sem itens → indicador */
  if (listLoading && links.length === 0) {
    return (
      <div className="link-list__status" aria-label="Carregando links" aria-busy="true">
        Carregando…
      </div>
    );
  }

  /* Caso 3: erro após carregamento (não durante) */
  if (!listLoading && listError) {
    return (
      <div className="link-list__status">
        <p>{listError}</p>
        <button type="button" onClick={onRetry} className="btn-outline link-list__retry">
          Tentar novamente
        </button>
      </div>
    );
  }

  /* Caso 4: carregamento concluído, lista vazia */
  if (!listLoading && !listError && links.length === 0) {
    return (
      <div className="link-list__status">
        <p>Nenhum link criado ainda. Crie o seu primeiro link acima!</p>
      </div>
    );
  }

  /* Caso 2 e 5: exibe itens (com ou sem carregamento em andamento) */
  return (
    <ul className="link-list" aria-label="Links criados">
      {/* A API já devolve do mais recente ao mais antigo */}
      {links.map((link) => (
        <LinkItem key={link.shortCode} link={link} />
      ))}
    </ul>
  );
}
