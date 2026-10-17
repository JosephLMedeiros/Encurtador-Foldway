import { mascotConfig } from '../../config/mascot.js';
import './Mascot.css';

/**
 * Componente do mascote — sem lógica de negócio (RF-24).
 * Recebe uma pose abstrata e exibe a imagem correspondente.
 * Fallback para 'welcome' se a pose não estiver mapeada (N-03).
 *
 * @param {{ pose: 'welcome'|'loading'|'success'|'error'|'empty' }} props
 */
export function Mascot({ pose }) {
  const config = mascotConfig.poses[pose] ?? mascotConfig.poses['welcome'];
  return (
    <img
      key={pose}
      src={config.src}
      alt={config.alt}
      className={`mascot mascot--${pose}`}
      width="724"
      height="965"
      decoding="async"
    />
  );
}
