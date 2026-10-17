/**
 * Arquivo de configuração do mascote.
 * Único ponto de troca: substituir src e alt atualiza o mascote em toda a aplicação.
 * Mascote: Furl, o artista que dobra os atalhos (D-08).
 */
export const mascotConfig = {
  name: 'Furl',
  poses: {
    welcome: { src: '/mascot/welcome.webp', alt: 'Furl, o artista dos atalhos, apresentando o Foldway' },
    loading: { src: '/mascot/loading.webp', alt: 'Furl dobrando o papel com fragmentos de luz ciano' },
    success: { src: '/mascot/success.webp', alt: 'Furl segurando um origami pronto na palma da mão' },
    error:   { src: '/mascot/error.webp',   alt: 'Furl pensativo diante de um origami rasgado' },
    empty:   { src: '/mascot/empty.webp',   alt: 'Furl de braços abertos esperando o primeiro papel' },
  },
};
