/**
 * Calcula a pose do mascote para a página inicial.
 * Prioridade: loading > error > success > empty > welcome
 *
 * Função pura — sem efeitos colaterais, sem dependência de React.
 * Todos os CAs de RF-31 são cobertos por testes unitários simples.
 *
 * @param {{
 *   submitStatus: 'idle'|'loading'|'success'|'error',
 *   listLoading:  boolean,
 *   listError:    string|null,
 *   links:        Array
 * }} state
 * @returns {'loading'|'error'|'success'|'empty'|'welcome'}
 */
export function resolvePose({ submitStatus, listLoading, listError, links }) {
  if (submitStatus === 'loading')            return 'loading';
  if (submitStatus === 'error' || listError) return 'error';
  if (submitStatus === 'success')            return 'success';
  if (!listLoading && links.length === 0)    return 'empty';
  return 'welcome';
}
